"""Optional local or hosted analysis service. It retains no user recordings."""

from functools import lru_cache
from io import BytesIO
import json
from pathlib import Path
import os
from tempfile import TemporaryDirectory
from threading import BoundedSemaphore
import subprocess
import wave

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool
import numpy as np

from mandarin import character_error_rate, normalize_text
from pitch import measure_region, track_pitch

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'public' / 'data'
LANGUAGE = {'en': 'en', 'fi-FI': 'fi', 'es-ES': 'es', 'zh-CN': 'zh'}
MODELS = Path(os.environ.get('VST_MODELS', ROOT / '.models'))
MFA = os.environ.get('VST_MFA', 'mfa')
MAX_BODY = 390000
SLOT = BoundedSemaphore(1)
ORIGINS = os.environ.get('VST_ORIGINS', 'https://drwangzezhao.github.io,http://localhost:5173,http://127.0.0.1:5173,http://127.0.0.1:4173').split(',')
app = FastAPI(title='Virtual Speech Therapy analysis')
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=['GET', 'POST'], allow_headers=['Content-Type'])


@lru_cache(maxsize=1)
def curriculum():
    mandarin = json.loads((DATA / 'curriculum.zh-CN.json').read_text())['items']
    other = json.loads((DATA / 'curriculum.other.json').read_text())
    return {item['id']: item for item in mandarin + other}


@lru_cache(maxsize=1)
def whisper_model():
    from faster_whisper import WhisperModel
    engine = WhisperModel(str(MODELS / 'whisper-base'), device='cpu', compute_type='int8', cpu_threads=4, local_files_only=True)
    if not engine.model.is_multilingual:
        raise ValueError('A multilingual Whisper checkpoint is required')
    return engine


@lru_cache(maxsize=1)
def segment_model():
    import torch
    from transformers import Wav2Vec2FeatureExtractor, Wav2Vec2ForCTC
    torch.set_num_threads(4)
    checkpoint = MODELS / 'w2v2'
    model = Wav2Vec2ForCTC.from_pretrained(checkpoint, local_files_only=True).eval()
    extractor = Wav2Vec2FeatureExtractor.from_pretrained(checkpoint, local_files_only=True)
    vocabulary = {index: token for token, index in json.loads((checkpoint / 'vocab.json').read_text()).items()}
    return model, extractor, vocabulary


def decode_pcm(payload):
    try:
        with wave.open(BytesIO(payload), 'rb') as reader:
            if (reader.getnchannels(), reader.getsampwidth(), reader.getframerate()) != (1, 2, 16000):
                raise ValueError('Expected 16 kHz mono PCM WAV')
            frame_count = reader.getnframes()
            if frame_count < 3200 or frame_count > 193000:
                raise ValueError('Expected between 0.2 and 12 seconds of audio')
            audio = np.frombuffer(reader.readframes(frame_count), dtype='<i2').astype(np.float32) / 32768
    except (wave.Error, EOFError) as error:
        raise ValueError('Invalid WAV recording') from error
    if audio.size != frame_count or np.sqrt(np.mean(audio * audio)) < 0.002:
        raise ValueError('Recording is incomplete or quiet')
    return audio


def phones(samples):
    import torch
    model, extractor, vocabulary = segment_model()
    features = extractor(samples, sampling_rate=16000, return_tensors='pt')
    with torch.inference_mode():
        predictions = model(**features).logits[0].argmax(dim=-1).tolist()
    return [vocabulary[code] for i,code in enumerate(predictions)
            if code != model.config.pad_token_id and (i == 0 or predictions[i - 1] != code)]


def force_align(payload, item):
    text = ' '.join(word['text'] for word in item['word_spans']) or normalize_text(item['text'])
    if not text:
        return None
    with TemporaryDirectory(prefix='vst-alignment-') as temp:
        directory = Path(temp)
        audio, transcript, output = (directory / name for name in ('practice.wav', 'practice.lab', 'alignment.json'))
        audio.write_bytes(payload)
        transcript.write_text(text, encoding='utf-8')
        subprocess.run([MFA, 'align_one', str(audio), str(transcript), 'mandarin_china_mfa', 'mandarin_mfa', str(output),
                        '--output_format', 'json', '--no_tokenization', '--quiet'],
                       check=True, timeout=38, capture_output=True)
        tiers = json.loads(output.read_text())['tiers']
        words = tiers['words']['entries']
        phone_entries = tiers['phones']['entries']
        nuclei = [entry for entry in phone_entries if any(tone in entry[2] for tone in '˩˨˧˦˥')]
        sounds = [s for group in item['groups'] for s in group['syllables']]
        tone_regions = []
        if len(nuclei) == len(sounds):
            for interval, target in zip(nuclei, sounds, strict=True):
                tone_regions.append({'start': interval[0], 'end': interval[1], 'label': interval[2],
                                     'target': target['pinyin'], 'surface_tone': target['surface_tone']})
        return {'words': words, 'phones': phone_entries, 'tone_regions': tone_regions}


def analyze(payload, samples, item):
    if not SLOT.acquire(blocking=False):
        raise HTTPException(429, 'Analysis is busy')
    try:
        language = LANGUAGE[item['language']]
        timing, timing_info = None, 'unavailable'
        track = track_pitch(samples, 16000)
        measured = measure_region(track, 0, samples.size / 16000, None)['measured']
        text, labels = None, []
        failures = []
        try:
            chunks, _ = whisper_model().transcribe(samples, language=language, task='transcribe', beam_size=4,
                                                   condition_on_previous_text=False)
            text = ''.join(chunk.text for chunk in chunks).strip()
        except (OSError, RuntimeError, ValueError):
            failures.append('whisper')
        try:
            labels = phones(samples)
        except (OSError, RuntimeError, ValueError):
            failures.append('phoneme_model')
        if language == 'zh':
            try:
                timing = force_align(payload, item)
                timing_info = 'aligned' if timing else 'unavailable'
            except (OSError, subprocess.SubprocessError, ValueError, KeyError):
                failures.append('mfa')
        return {'text': text, 'segments': labels, 'segment_status': 'uncertain' if labels else 'unavailable',
                'tone': 'uncertain' if language == 'zh' else 'not_applicable', 'match': 'uncertain',
                'pitch': measured, 'source': 'praat', 'alignment': timing, 'alignment_status': timing_info,
                'character_error': character_error_rate(item['text'], text) if language == 'zh' and text is not None else None,
                'unavailable': failures}
    finally:
        SLOT.release()


@app.get('/api/health')
def health():
    return {'speech_therapy': True, 'whisper': (MODELS / 'whisper-base' / 'model.bin').exists(),
            'phoneme_model': (MODELS / 'w2v2' / 'pytorch_model.bin').exists()}


@app.post('/api/analyze')
async def analyze_attempt(request: Request, exercise: str):
    item = curriculum().get(exercise)
    if not item:
        raise HTTPException(404, 'Unknown exercise')
    if request.headers.get('content-type', '').split(';')[0] != 'audio/wav':
        raise HTTPException(415, 'Expected PCM WAV')
    payload = bytearray()
    async for chunk in request.stream():
        if len(payload) + len(chunk) > MAX_BODY:
            raise HTTPException(413, 'Recording is too long')
        payload.extend(chunk)
    try:
        samples = decode_pcm(bytes(payload))
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
    return await run_in_threadpool(analyze, bytes(payload), samples, item)
