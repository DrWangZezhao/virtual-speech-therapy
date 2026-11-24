"""Render the voice coach's prepared lines with the same voices as practice examples."""

from argparse import ArgumentParser
import json
from pathlib import Path
import subprocess

from neural_demos import ROOT, generate


def render(working, voice):
    result = subprocess.run(['node', '--input-type=module', '-e',
                             "import {coachLines} from './src/coach-guide.js'; console.log(JSON.stringify(coachLines));"],
                            cwd=ROOT, check=True, text=True, capture_output=True)
    prompts = [{'language': language, 'text': line, 'id': f'{language}-{key}'}
               for language, entries in json.loads(result.stdout).items() for key, line in entries.items()]
    manifest = working / 'references.json'
    generate(working, voice, manifest if manifest.exists() else None, prompts)
    destination = ROOT / 'public' / 'data' / 'coach'
    destination.mkdir(parents=True, exist_ok=True)
    sources = json.loads(manifest.read_text())
    for prompt in prompts:
        stem = prompt['id']
        subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', sources[stem]['path'],
                        '-af', 'silenceremove=start_periods=1:start_duration=0.02:start_threshold=-44dB',
                        '-ac', '1', '-codec:a', 'libmp3lame', '-q:a', '6', str(destination / f'{stem}.mp3')],
                       check=True)


if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('working', type=Path)
    parser.add_argument('piper_model', type=Path)
    options = parser.parse_args()
    render(options.working, options.piper_model)
