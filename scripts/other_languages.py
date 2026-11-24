"""Original practice prompts and target syllables for the CHIMERA planner."""

COURSES = {
    'en': [
        ['me|m:i:', 'see|s:i:', 'no|n:oʊ:'],
        ['mama|m:ɑ: m:ə:', 'baby|b:eɪ: b:i:', 'so-so|s:oʊ: s:oʊ:'],
        ['map|m:æ:p', 'water|w:ɔ: t:ɚ:', 'hello|h:ə: l:oʊ:', 'apple|:æ:p l:ə:l',
         'help|h:ɛ:lp', 'home|h:oʊ:m', 'please|pl:i:z', 'phone|f:oʊ:n'],
        ['I see you.|:aɪ: s:i: j:u:', 'Can I go?|k:æ:n :aɪ: ɡ:oʊ:', 'I like apples.|:aɪ: l:aɪ:k :æ:p l:ə:lz'],
    ],
    'es-ES': [
        ['a|:a:', 'e|:e:', 'i|:i:'],
        ['ma|m:a:', 'pa|p:a:', 'la|l:a:', 'mi mamá|m:i: m:a: m:a:'],
        ['hola|:o: l:a:', 'casa|k:a: s:a:', 'mesa|m:e: s:a:', 'luna|l:u: n:a:',
         'agua|:a: ɣw:a:', 'pan|p:a:n', 'mano|m:a: n:o:', 'boca|b:o: k:a:', 'cama|k:a: m:a:'],
        ['Hola, Ana.|:o: l:a: :a: n:a:', 'Eso es mío.|:e: s:o: :e:s m:i: :o:', 'Mi casa es azul.|m:i: k:a: s:a: :e:s :a: θ:u:l'],
    ],
    'fi-FI': [
        ['a|:ɑ:', 'i|:i:', 'u|:u:'],
        ['ma|m:ɑ:', 'pa|p:ɑ:', 'ta|t:ɑ:', 'mama|m:ɑ: m:ɑ:'],
        ['talo|t:ɑ: l:o:', 'kala|k:ɑ: l:ɑ:', 'moi|m:oɪ:', 'nimi|n:i: m:i:',
         'vesi|v:e: s:i:', 'käsi|k:æ: s:i:', 'koti|k:o: t:i:', 'apua|:ɑ: p:u: :ɑ:', 'kiitos|k:iː: t:o:s'],
        ['Minä olen Ana.|m:i: n:æ: :o: l:e:n :ɑ: n:ɑ:', 'Tämä on kala.|t:æ: m:æ: :o:n k:ɑ: l:ɑ:', 'Talo on iso.|t:ɑ: l:o: :o:n :i: s:o:'],
    ],
}

SOUND_PAIRS = {
    'en': [
        ('fan|f:æ:n', 'van|v:æ:n'),
        ('sip|s:ɪ:p', 'zip|z:ɪ:p'),
        ('cap|k:æ:p', 'cab|k:æ:b'),
        ('light|l:aɪ:t', 'right|ɹ:aɪ:t'),
    ],
    'es-ES': [
        ('pala|p:a: l:a:', 'bala|b:a: l:a:'),
        ('pata|p:a: t:a:', 'bata|b:a: t:a:'),
        ('tía|t:i: :a:', 'día|d:i: :a:'),
        ('cala|k:a: l:a:', 'gala|ɡ:a: l:a:'),
        ('pero|p:e: ɾ:o:', 'perro|p:e: r:o:'),
        ('caro|k:a: ɾ:o:', 'carro|k:a: r:o:'),
    ],
    'fi-FI': [
        ('tuli|t:u: l:i:', 'tuuli|t:uː: l:i:'),
        ('mato|m:ɑ: t:o:', 'matto|m:ɑ:t t:o:'),
        ('uni|:u: n:i:', 'uuni|:uː: n:i:'),
        ('kuka|k:u: k:ɑ:', 'kukka|k:u:k k:ɑ:'),
    ],
}

EVERYDAY = {
    'en': [
        'Can you help me?|k:æ:n j:u: h:ɛ:lp m:i:',
        'I need some water.|:aɪ: n:i:d s:ʌ:m w:ɔ: t:ɚ:',
        'Please say it again.|pl:i:z s:eɪ: :ɪ:t :ə: ɡ:ɛ:n',
        'I need a break.|:aɪ: n:i:d :ə: bɹ:eɪ:k',
    ],
    'es-ES': [
        '¿Me ayudas?|m:e: :a: ʝ:u: ð:a:s',
        'Quiero agua.|kj:e: ɾ:o: :a: ɣw:a:',
        '¿Puedes repetirlo?|pw:e: ð:e:s r:e: p:e: t:i:ɾ l:o:',
        'Necesito un descanso.|n:e: θ:e: s:i: t:o: :u:n d:e:s k:a:n s:o:',
        'Más despacio, por favor.|m:a:s d:e:s p:a: θj:o: p:o:ɾ f:a: β:o:ɾ',
    ],
    'fi-FI': [
        'Voitko auttaa?|v:oi:t k:o: :ɑu:t t:ɑː:',
        'Tarvitsen vettä.|t:ɑ:r v:i:t s:e:n v:e:t t:æ:',
        'Voitko toistaa?|v:oi:t k:o: t:oi:s t:ɑː:',
        'Tarvitsen tauon.|t:ɑ:r v:i:t s:e:n t:ɑu: :o:n',
    ],
}


def exercise(identifier, language, level, line, **extra):
    text, phonetics = line.split('|')
    return {'id': identifier, 'text': text, 'level': level, 'language': language,
            'mode': 'pronunciation', 'groups': [], 'word_spans': [], 'focus': None,
            'phonetics': phonetics, **extra}


def items():
    for language, levels in COURSES.items():
        for level, lines in enumerate(levels, 1):
            for number, line in enumerate(lines, 1):
                yield exercise(f'{language}-{level}-{number}', language, level, line)
        for number, (first, second) in enumerate(SOUND_PAIRS[language], 1):
            pair = f'{language}-pair-{number}'
            yield exercise(f'{pair}-a', language, 3, first, practice_set='pairs', partner=f'{pair}-b')
            yield exercise(f'{pair}-b', language, 3, second, practice_set='pairs', partner=f'{pair}-a')
        for number, line in enumerate(EVERYDAY[language], 1):
            yield exercise(f'{language}-everyday-{number}', language, 4, line, practice_set='everyday')
