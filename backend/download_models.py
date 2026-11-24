"""Fetch the fixed multilingual and phoneme checkpoint revisions."""
from os import environ
from pathlib import Path
from huggingface_hub import snapshot_download

root = Path(environ.get('VST_MODELS', Path(__file__).resolve().parents[1] / '.models'))
snapshot_download('Systran/faster-whisper-base', revision='ebe41f70d5b6dfa9166e2c581c45c9c0cfc57b66',
                  local_dir=root/'whisper-base', allow_patterns=['*.json','model.bin','vocabulary.txt'])
snapshot_download('facebook/wav2vec2-xlsr-53-espeak-cv-ft', revision='2c733782da5604684829819a5eb744c193fe9398',
                  local_dir=root/'w2v2', allow_patterns=['*.json','pytorch_model.bin'])
