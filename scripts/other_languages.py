"""Starter lessons with explicit target syllables for the CHIMERA planner."""

COURSES = {
    'en': [
        ['me|m:i:', 'see|s:i:', 'no|n:oʊ:'],
        ['mama|m:ɑ: m:ə:', 'baby|b:eɪ: b:i:', 'so-so|s:oʊ: s:oʊ:'],
        ['map|m:æ:p', 'water|w:ɔ: t:ɚ:', 'hello|h:ə: l:oʊ:', 'apple|:æ:p l:ə:l'],
        ['I see you.|:aɪ: s:i: j:u:', 'Can I go?|k:æ:n :aɪ: ɡ:oʊ:', 'I like apples.|:aɪ: l:aɪ:k :æ:p l:ə:lz'],
    ],
    'es-ES': [
        ['a|:a:', 'e|:e:', 'i|:i:'],
        ['ma|m:a:', 'pa|p:a:', 'la|l:a:', 'mi mamá|m:i: m:a: m:a:'],
        ['hola|:o: l:a:', 'casa|k:a: s:a:', 'mesa|m:e: s:a:', 'luna|l:u: n:a:'],
        ['Hola, Ana.|:o: l:a: :a: n:a:', 'Eso es mío.|:e: s:o: :e:s m:i: :o:', 'Mi casa es azul.|m:i: k:a: s:a: :e:s :a: θ:u:l'],
    ],
    'fi-FI': [
        ['a|:ɑ:', 'i|:i:', 'u|:u:'],
        ['ma|m:ɑ:', 'pa|p:ɑ:', 'ta|t:ɑ:', 'mama|m:ɑ: m:ɑ:'],
        ['talo|t:ɑ: l:o:', 'kala|k:ɑ: l:ɑ:', 'moi|m:oɪ:', 'nimi|n:i: m:i:'],
        ['Minä olen Ana.|m:i: n:æ: :o: l:e:n :ɑ: n:ɑ:', 'Tämä on kala.|t:æ: m:æ: :o:n k:ɑ: l:ɑ:', 'Talo on iso.|t:ɑ: l:o: :o:n :i: s:o:'],
    ],
}


def items():
    for language, levels in COURSES.items():
        for level, lines in enumerate(levels, 1):
            for number, line in enumerate(lines, 1):
                text, phonetics = line.split('|')
                yield {'id': f'{language}-{level}-{number}', 'text': text, 'level': level, 'language': language,
                       'mode': 'pronunciation', 'groups': [], 'word_spans': [], 'focus': None,
                       'phonetics': phonetics}
