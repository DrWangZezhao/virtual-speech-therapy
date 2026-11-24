"""Add everyday Mandarin prompts and sound pairs to the existing curriculum."""

from argparse import ArgumentParser
from dataclasses import asdict
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'public' / 'data'
sys.path.insert(0, str(ROOT / 'backend'))
from mandarin import surface_group, syllable

PAIRS = [
    (('包', 'bao1'), ('刀', 'dao1')),
    (('米', 'mi3'), ('笔', 'bi3')),
    (('汤', 'tang1'), ('糖', 'tang2')),
]

EVERYDAY = [
    ('你 能 帮 我 吗？', 'ni3 neng2 bang1 wo3 ma5'),
    ('我 想 喝 点 水。', 'wo3 xiang3 he1 dian3 shui3'),
    ('可以 再 说 一次 吗？', 'ke3 yi3 zai4 shuo1 yi1 ci4 ma5'),
    ('我 需要 休息。', 'wo3 xu1 yao4 xiu1 xi5'),
    ('请 慢 一点。', 'qing3 man4 yi1 dian3'),
]


def prompt(identifier, category, words, readings, **extra):
    text = ''.join(words)
    letters = [char for char in text if char not in '。！？、，']
    sounds = surface_group(tuple(syllable(char, reading) for char, reading in zip(letters, readings, strict=True)))
    spans = []
    for word in words:
        word = word.rstrip('。！？、，')
        start = spans[-1]['end'] if spans else 0
        spans.append({'text': word, 'start': start, 'end': start + len(word)})
    item = {
        'id': identifier, 'language': 'zh-CN', 'level': 3 if category == 'pairs' else 4,
        'mode': 'pronunciation', 'text': text,
        'groups': [{'start': 0, 'end': len(sounds), 'syllables': [
            dict(asdict(sound), ipa=sound.ipa, surface_pinyin_numbered=sound.surface_pinyin_numbered)
            for sound in sounds
        ]}],
        'word_spans': spans, 'focus': None, 'practice_set': category, **extra,
    }
    return item, sounds


def exercises():
    for number, (first, second) in enumerate(PAIRS, 1):
        pair = f'zh-CN-pair-{number}'
        for suffix, partner, (word, reading) in [('a', 'b', first), ('b', 'a', second)]:
            yield prompt(f'{pair}-{suffix}', 'pairs', [word], [reading], partner=f'{pair}-{partner}')
    for number, (text, pinyin) in enumerate(EVERYDAY, 1):
        yield prompt(f'zh-CN-everyday-{number}', 'everyday', text.split(), pinyin.split())


def update(cli, source):
    catalog_path = DATA / 'curriculum.zh-CN.json'
    mapping_path = DATA / 'chimera-mandarin-map.json'
    catalog, mapping = (json.loads(path.read_text()) for path in (catalog_path, mapping_path))
    new = list(exercises())
    for _, sounds in new:
        for sound in sounds:
            reading = sound.surface_pinyin_numbered
            if reading in mapping:
                continue
            output = subprocess.run([str(cli.resolve()), 'syllables', reading], cwd=source,
                                    check=True, text=True, capture_output=True)
            chimera, = json.loads(output.stdout)
            mapping[reading] = {'surface_phones': sound.surface_phones, 'gesture_goals': sound.gestures,
                                'source_input': reading, 'carrier_only': False, 'chimera': chimera}
    new_items = [item for item, _ in new]
    updated_ids = {item['id'] for item in new_items}
    catalog['items'] = [item for item in catalog['items'] if item['id'] not in updated_ids] + new_items
    catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n')
    mapping_path.write_text(json.dumps(mapping, ensure_ascii=False, separators=(',', ':')) + '\n')


if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('chimera_cli', type=Path)
    parser.add_argument('chimera_source', type=Path)
    args = parser.parse_args()
    update(args.chimera_cli, args.chimera_source)
