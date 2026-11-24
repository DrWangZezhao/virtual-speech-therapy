"""Create audio and original CHIMERA articulator tracks for each shipped exercise."""
from argparse import ArgumentParser
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from hashlib import sha256
import json
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory

from other_languages import items

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'public' / 'data'
VOICES = {'zh-CN': 'cmn', 'en': 'en-us', 'es-ES': 'es', 'fi-FI': 'fi'}


def run(*args, cwd=None):
    result = subprocess.run(args, cwd=cwd, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(f'{args[0]}: {result.stderr or result.stdout}')
    return result.stdout.strip()


def european_syllables(phonetics):
    for group in phonetics.split():
        before, vowel, after = group.split(':')
        nucleus = vowel.removesuffix('ː')
        coda = [{'ipa': p} for p in after]
        if nucleus in ('oi', 'ɑu'):
            coda.insert(0, {'ipa': 'j' if nucleus == 'oi' else 'w', 'dur': 0.06})
            nucleus = nucleus[0]
        yield {'text': group, 'onset': [{'ipa': p} for p in before], 'nucleus': {'ipa': nucleus},
               'coda': coda, 'wordEnd': False, 'phraseEnd': False}


def mandarin_syllables(item, mappings):
    for group in item['groups']:
        for sound in group['syllables']:
            syllable = deepcopy(mappings[sound['surface_pinyin_numbered']]['chimera'])
            syllable['text'] = sound['hanzi']
            yield syllable


def build_item(item, cli, upstream, mappings, reference):
    stem = item['id']
    audio_path = DATA / 'audio' / f'{stem}.mp3'
    track_path = DATA / 'artic' / f'{stem}.json'
    reference_file = reference.get(stem) or reference.get(item['text'])
    if item['language'] == 'zh-CN':
        syllables = list(mandarin_syllables(item, mappings))
    else:
        syllables = list(european_syllables(item['phonetics']))
    with TemporaryDirectory() as directory:
        scratch = Path(directory)
        voice_wav = scratch / 'speech.wav'
        source = Path(reference_file['path']) if reference_file else voice_wav
        if reference_file is None:
            run('espeak-ng', '-v', VOICES[item['language']], '-s', '155', '-w', str(voice_wav), item['text'])
        run('ffmpeg', '-v', 'error', '-y', '-i', str(source), '-ac', '1', '-af', 'silenceremove=start_periods=1:start_duration=0.02:start_threshold=-44dB', '-codec:a', 'libmp3lame', '-q:a', '6', str(audio_path))
        source_duration = float(run('ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(audio_path)))
        lengths = [1.5 if 'ː' in syllable['text'] else 1 for syllable in syllables]
        beats = max(0.5, 2 * source_duration / sum(lengths))
        notes = [[60, beats * length] for length in lengths]
        score = scratch / 'score.json'
        score.write_text(json.dumps({'bpm': 120, 'syllables': syllables, 'notes': notes,
                                     'vibrato': 0, 't0': 0.08}, ensure_ascii=False))
        tracks = scratch / 'tracks.json'
        run(str(cli), 'render', 'notes', str(score), str(scratch / 'preview'), 'male', '--artic', str(tracks), cwd=upstream)
        original = json.loads(tracks.read_text())
        frames = original['frames']
        # Sample the genuine output at half rate. The browser interpolates adjacent poses.
        track = {'keys': original['keys'], 'frames': frames[::2], 'duration': source_duration}
        track_path.write_text(json.dumps(track, separators=(',', ':')) + '\n')
    media = {'audio': f'data/audio/{stem}.mp3', 'animation': f'data/artic/{stem}.json',
             'audio_kind': reference_file.get('kind', 'human') if reference_file else 'espeak',
             'duration': round(source_duration, 3)}
    if reference_file:
        media['credit'] = {k: v for k, v in reference_file.items() if k not in ('path', 'kind')}
    media['audio_revision'] = sha256(audio_path.read_bytes()).hexdigest()[:12]
    media['animation_revision'] = sha256(track_path.read_bytes()).hexdigest()[:12]
    return stem, media


if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('chimera_cli', type=Path)
    parser.add_argument('chimera_source', type=Path)
    parser.add_argument('mandarin_inventory', type=Path)
    parser.add_argument('--references', type=Path)
    args = parser.parse_args()
    inventory = json.loads(args.mandarin_inventory.read_text())
    mappings = inventory.get('map', inventory)
    references = json.loads(args.references.read_text()) if args.references else {}
    mandarin = json.loads((DATA / 'curriculum.zh-CN.json').read_text())['items']
    others = list(items())
    (DATA / 'curriculum.other.json').write_text(json.dumps(others, ensure_ascii=False, indent=2) + '\n')
    for directory in ('audio', 'artic'):
        (DATA / directory).mkdir(exist_ok=True)
    (DATA / 'chimera-mandarin-map.json').write_text(json.dumps(mappings, ensure_ascii=False, separators=(',', ':')) + '\n')
    with ThreadPoolExecutor(max_workers=4) as pool:
        media = dict(pool.map(lambda item: build_item(item, args.chimera_cli.resolve(), args.chimera_source.resolve(), mappings, references), mandarin + others))
    manifest = DATA / 'demos.json'
    if manifest.exists():
        existing = json.loads(manifest.read_text())
        media = {**{identifier: media[identifier] for identifier in existing if identifier in media}, **media}
    manifest.write_text(json.dumps(media, ensure_ascii=False, indent=2) + '\n')
    kinds = {kind: sum(item['audio_kind'] == kind for item in media.values()) for kind in ('human', 'neural', 'espeak')}
    print(f'Built {len(media)} demonstrations: {kinds}')
