"""Generate the licensed reference manifest and neural samples for the release."""
from argparse import ArgumentParser
import json
from pathlib import Path
import wave

from huggingface_hub import hf_hub_download
from kokoro import KModel, KPipeline
import numpy as np
from piper import PiperVoice, SynthesisConfig
import soundfile as sf
import torch

ROOT = Path(__file__).resolve().parents[1]
VOICE_REPO = 'hexgrad/Kokoro-82M'
KOKORO_REV = 'f3ff3571791e39611d31c381e3a41a3af07b4987'
PIPER_REV = '375a0fe641dea077c2a47b4e9a056d6da521eed3'
LANGUAGES = {'en': ('a', 'af_heart'), 'es-ES': ('e', 'ef_dora'), 'zh-CN': ('z', 'zf_xiaobei')}


def credits(name, language):
    if language == 'fi-FI':
        return {'kind': 'neural', 'author': 'Piper Harri (fi-FI)', 'license': 'CC0 voice dataset',
                'license_url': 'https://creativecommons.org/publicdomain/zero/1.0/',
                'source': f'https://huggingface.co/rhasspy/piper-voices/tree/{PIPER_REV}/fi/fi_FI/harri/medium'}
    return {'kind': 'neural', 'author': f'Kokoro ({name})', 'license': 'Apache 2.0 model',
            'license_url': 'https://www.apache.org/licenses/LICENSE-2.0',
            'source': f'https://huggingface.co/{VOICE_REPO}/tree/{KOKORO_REV}'}


def generate(destination, piper_model, reference):
    destination.mkdir(parents=True, exist_ok=True)
    neural_cache = destination / 'kokoro-cache'
    data = ROOT / 'public' / 'data'
    items = json.loads((data / 'curriculum.zh-CN.json').read_text())['items'] + json.loads((data / 'curriculum.other.json').read_text())
    manifest = json.loads(reference.read_text()) if reference else {}
    if 'tone-ma-1' in manifest:
        manifest.setdefault('妈', manifest['tone-ma-1'])
    torch.set_num_threads(4)

    def checkpoint(name):
        return hf_hub_download(VOICE_REPO, name, revision=KOKORO_REV, cache_dir=neural_cache)

    model = KModel(repo_id=VOICE_REPO, config=checkpoint('config.json'), model=checkpoint('kokoro-v1_0.pth')).eval()
    pipelines = {}
    finnish = PiperVoice.load(piper_model, use_cuda=False, download_dir=destination)
    cached = {}
    for item in items:
        identifier, text, language = item['id'], item['text'], item['language']
        if identifier in manifest or text in manifest:
            continue
        key = language, text
        if key not in cached:
            wav = (destination / f'{identifier}.wav').resolve()
            if language == 'fi-FI':
                name = 'harri'
                with wave.open(str(wav), 'wb') as output:
                    finnish.synthesize_wav(text, output, SynthesisConfig(length_scale=1.02, volume=.9))
            else:
                code, name = LANGUAGES[language]
                if code not in pipelines:
                    pipelines[code] = KPipeline(lang_code=code, repo_id=VOICE_REPO, model=model, device='cpu')
                voice = checkpoint(f'voices/{name}.pt')
                segments = [item.audio.detach().cpu().numpy() for item in pipelines[code](text, voice=voice, speed=.94)
                            if item.audio is not None]
                if not segments:
                    raise ValueError(f'No audio returned for {identifier}: {text}')
                sf.write(wav, np.concatenate(segments), 24000)
            if sf.info(wav).duration < .10:
                raise ValueError(f'Clip too short for {identifier}: {text}')
            cached[key] = {'path': str(wav), **credits(name, language)}
            print(identifier, text, wav.name, flush=True)
        manifest[identifier] = cached[key]
    (destination / 'references.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    print(f'Rendered {len(cached)} distinct neural recordings', flush=True)


if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('destination', type=Path)
    parser.add_argument('piper_model', type=Path)
    parser.add_argument('--human-references', type=Path)
    args = parser.parse_args()
    generate(args.destination, args.piper_model, args.human_references)
