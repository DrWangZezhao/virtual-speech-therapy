"""Add audio-timed mouth cues to existing CHIMERA tracks using Rhubarb 1.14."""
import argparse
from hashlib import sha256
import json
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'public/data'

def build(binary, limit=None):
    media = json.loads((DATA/'demos.json').read_text())
    courses = json.loads((DATA/'curriculum.other.json').read_text()) + json.loads((DATA/'curriculum.zh-CN.json').read_text())['items']
    items = {item['id']:item for item in courses}
    count = 0
    for identifier, asset in media.items():
        path = ROOT/'public'/asset['animation']
        track = json.loads(path.read_text())
        if track.get('lip_sync') == 'rhubarb-1.14.0':
            continue
        with tempfile.TemporaryDirectory() as directory:
            wav = Path(directory)/'audio.wav'
            output = Path(directory)/'mouth.json'
            subprocess.run(['ffmpeg','-v','error','-y','-i',str(ROOT/'public'/asset['audio']),'-ar','16000','-ac','1',str(wav)],check=True)
            item = items[identifier]
            command = [str(binary),'-r','pocketSphinx' if item['language']=='en' else 'phonetic','-f','json','--threads','1','-o',str(output),str(wav)]
            if item['language']=='en':
                text = Path(directory)/'text.txt'; text.write_text(item['text'])
                command += ['--dialogFile',str(text)]
            subprocess.run(command,check=True,capture_output=True)
            track['mouthCues'] = json.loads(output.read_text())['mouthCues']
        track['lip_sync'] = 'rhubarb-1.14.0'
        path.write_text(json.dumps(track,separators=(',',':'))+'\n')
        asset['animation_revision'] = sha256(path.read_bytes()).hexdigest()[:12]
        (DATA/'demos.json').write_text(json.dumps(media,ensure_ascii=False,indent=2)+'\n')
        count += 1
        if count%20 == 0: print(f'Aligned {count} recordings',flush=True)
        if limit and count>=limit: break
    print(f'Added mouth timing to {count} recordings',flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('rhubarb',type=Path)
    parser.add_argument('--limit',type=int)
    args=parser.parse_args()
    build(args.rhubarb.resolve(),args.limit)
