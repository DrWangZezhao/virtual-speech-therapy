"""Mandarin pronunciation data for the Virtual Speech Therapy curriculum."""

from dataclasses import dataclass, replace
from functools import lru_cache
import re
import unicodedata as ud

from opencc import OpenCC
from pypinyin import Style, lazy_pinyin
from pypinyin.constants import PINYIN_DICT


INITIALS = {
    "b": ("p", "bilabial_closure"), "p": ("pʰ", "bilabial_closure"),
    "m": ("m", "bilabial_nasal"), "f": ("f", "labiodental_constriction"),
    "d": ("t", "alveolar_closure"), "t": ("tʰ", "alveolar_closure"),
    "n": ("n", "alveolar_nasal"), "l": ("l", "alveolar_lateral"),
    "g": ("k", "velar_closure"), "k": ("kʰ", "velar_closure"),
    "h": ("x", "velar_constriction"),
    "j": ("tɕ", "alveolopalatal_affrication"),
    "q": ("tɕʰ", "alveolopalatal_affrication"),
    "x": ("ɕ", "alveolopalatal_constriction"),
    "zh": ("ʈʂ", "retroflex_affrication"), "ch": ("ʈʂʰ", "retroflex_affrication"),
    "sh": ("ʂ", "retroflex_constriction"), "r": ("ɻ", "retroflex_approximant"),
    "z": ("ts", "alveolar_affrication"), "c": ("tsʰ", "alveolar_affrication"),
    "s": ("s", "alveolar_constriction"),
}
FINALS = {
    "a": ("a",), "o": ("ɔ",), "e": ("ɤ",), "ê": ("ɛ",), "i": ("i",),
    "u": ("u",), "ü": ("y",), "er": ("ɚ",),
    "ai": ("a", "ɪ̯"), "ei": ("e", "ɪ̯"), "ao": ("a", "ʊ̯"),
    "ou": ("ə", "ʊ̯"), "an": ("a", "n"), "en": ("ə", "n"),
    "ang": ("ɑ", "ŋ"), "eng": ("ɤ", "ŋ"), "ong": ("ʊ", "ŋ"),
    "ia": ("j", "a"), "io": ("j", "ɔ"), "ie": ("j", "ɛ"),
    "iao": ("j", "a", "ʊ̯"), "iou": ("j", "ə", "ʊ̯"),
    "ian": ("j", "ɛ", "n"), "in": ("i", "n"), "iang": ("j", "ɑ", "ŋ"),
    "ing": ("i", "ŋ"), "iong": ("j", "ʊ", "ŋ"),
    "ua": ("w", "a"), "uo": ("w", "ɔ"), "uai": ("w", "a", "ɪ̯"),
    "uei": ("w", "e", "ɪ̯"), "uan": ("w", "a", "n"),
    "uen": ("w", "ə", "n"), "uang": ("w", "ɑ", "ŋ"), "ueng": ("w", "ə", "ŋ"),
    "üe": ("ɥ", "ɛ"), "üan": ("ɥ", "ɛ", "n"), "ün": ("y", "n"),
}
Y_SPELLINGS = {
    "ya": "ia", "yo": "io", "ye": "ie", "yao": "iao", "you": "iou", "yan": "ian",
    "yi": "i", "yin": "in", "ying": "ing", "yang": "iang", "yong": "iong",
    "yu": "ü", "yue": "üe", "yuan": "üan", "yun": "ün",
}
W_SPELLINGS = {
    "wu": "u", "wa": "ua", "wo": "uo", "wai": "uai", "wei": "uei",
    "wan": "uan", "wen": "uen", "wang": "uang", "weng": "ueng",
}
TONE_MARKS = ("", "\u0304", "\u0301", "\u030c", "\u0300", "")
PHRASE_READINGS = {"妈妈": ("ma1", "ma5"), "爸爸": ("ba4", "ba5"),
                   "谢谢": ("xie4", "xie5"), "喜欢": ("xi3", "huan5")}


@dataclass(frozen=True)
class Syllable:
    hanzi: str
    pinyin: str
    pinyin_numbered: str
    initial: str
    final: str
    phones: tuple[str, ...]
    lexical_tone: int
    surface_tone: int
    surface_phones: tuple[str, ...]
    contour: str
    gestures: tuple[str, ...]

    @property
    def ipa(self) -> str:
        return "".join(self.phones)

    @property
    def surface_pinyin_numbered(self) -> str:
        return f"{self.pinyin_numbered[:-1]}{self.surface_tone}"


def parse_pinyin(pinyin: str) -> tuple[str, int]:
    """Read one orthographic syllable in marked or numeric form."""
    spelling = ud.normalize("NFD", pinyin.strip().lower().replace("u:", "ü").replace("v", "ü"))
    tone = None
    if spelling and spelling[-1] in "012345":
        tone = int(spelling[-1]) or 5
        spelling = spelling[:-1]
    for number, mark in enumerate(TONE_MARKS[1:5], 1):
        if mark not in spelling:
            continue
        if tone is not None or spelling.count(mark) > 1:
            raise ValueError(f"Multiple tone indicators in {pinyin!r}")
        tone = number
        spelling = spelling.replace(mark, "")
    spelling = ud.normalize("NFC", spelling)
    if not re.fullmatch(r"[a-züê]+", spelling):
        raise ValueError(f"Invalid Pinyin syllable {pinyin!r}")
    return spelling, tone or 5


@lru_cache(maxsize=1)
def valid_spellings() -> frozenset[str]:
    attested = set()
    for readings in PINYIN_DICT.values():
        for reading in readings.split(","):
            try:
                attested.add(parse_pinyin(reading)[0])
            except ValueError:
                continue
    return frozenset(attested)


def marked(spelling: str, tone: int) -> str:
    if tone == 5:
        return spelling
    for candidate in ("a", "e", "ou"):
        if candidate in spelling:
            index = spelling.index(candidate)
            break
    else:
        index = max(i for i, char in enumerate(spelling) if char in "aeiouüê")
    return ud.normalize("NFC", spelling[:index + 1] + TONE_MARKS[tone] + spelling[index + 1:])


def syllable(hanzi: str, reading: str) -> Syllable:
    spelling, tone = parse_pinyin(reading)
    if spelling not in valid_spellings():
        raise ValueError(f"Unattested standard Pinyin spelling {reading!r}")
    initial = next((p for p in ("zh", "ch", "sh", spelling[0]) if p in INITIALS and spelling.startswith(p)), "")
    final = Y_SPELLINGS.get(spelling, W_SPELLINGS.get(spelling, spelling[len(initial):]))
    if initial in ("j", "q", "x") and final.startswith("u"):
        final = "ü" + final[1:]
    final = {"iu": "iou", "ui": "uei", "un": "uen"}.get(final, final)
    if final not in FINALS:
        raise ValueError(f"Unsupported Mandarin final {final!r} in {reading!r}")
    rhyme = FINALS[final]
    if final == "i" and initial in ("z", "c", "s", "zh", "ch", "sh", "r"):
        rhyme = ("z̩",) if initial in ("z", "c", "s") else ("ʐ̩",)
    phones = (INITIALS[initial][0], *rhyme) if initial else rhyme
    gestures = [INITIALS[initial][1]] if initial else []
    if initial and phones[0].endswith("ʰ"):
        gestures.append("aspiration")
    if any(phone in ("ɔ", "u", "y", "w", "ɥ", "ʊ", "ʊ̯") for phone in rhyme):
        gestures.append("lip_rounding")
    if any(phone in ("a", "ɑ") for phone in rhyme):
        gestures.append("lower_vowel")
    if any(phone in ("i", "y", "u") for phone in rhyme):
        gestures.append("higher_vowel")
    if any(phone in ("a", "i", "y", "e", "ɛ", "j", "ɥ") for phone in rhyme):
        gestures.append("front_vowel_or_glide")
    if any(phone in ("ɑ", "ɤ", "ɔ", "u", "w", "ʊ", "ʊ̯") for phone in rhyme):
        gestures.append("back_vowel_or_glide")
    if rhyme[-1] in ("n", "ŋ"):
        gestures.append("alveolar_nasal_coda" if rhyme[-1] == "n" else "velar_nasal_coda")
    if len(rhyme) > 1:
        gestures.append("rhyme_transition")
    contour = {1: "high_level", 2: "rising", 3: "full_third", 4: "falling", 5: "neutral"}[tone]
    surface_phones = tuple("ə" if tone == 5 and final == "e" and p == "ɤ" else p for p in phones)
    return Syllable(hanzi, marked(spelling, tone), f"{spelling}{tone}", initial, final,
                    phones, tone, tone, surface_phones, contour, tuple(gestures))


@lru_cache(maxsize=1)
def simplified() -> OpenCC:
    return OpenCC("t2s")


def normalize_text(text: str) -> str:
    compatible = ud.normalize("NFKC", text)
    return "".join(c for c in simplified().convert(compatible).casefold()
                   if ud.category(c)[0] in "LMN")


def contextual_reading(text: str) -> tuple[Syllable, ...]:
    """Use the phrase lexicon. Authored material should supply verified readings."""
    hanzi = normalize_text(text)
    if not hanzi or any(not ud.name(c, "").startswith("CJK UNIFIED IDEOGRAPH-") for c in hanzi):
        raise ValueError("Expected a nonempty Mandarin Han text span")
    readings = list(lazy_pinyin(hanzi, style=Style.TONE3, neutral_tone_with_five=True, tone_sandhi=False))
    for phrase, verified in PHRASE_READINGS.items():
        for match in re.finditer(phrase, hanzi):
            readings[match.start():match.end()] = verified
    # Some phrase entries already encode sandhi. Keep the base form here.
    base = {"一": "yi1", "不": "bu4"}
    return tuple(syllable(c, base.get(c, reading)) for c, reading in zip(hanzi, readings, strict=True))


def surface_group(items: tuple[Syllable, ...], overrides: dict[int, int] | None = None) -> tuple[Syllable, ...]:
    """Resolve one supplied prosodic group. Authored exceptions override the defaults."""
    overrides = overrides or {}
    tones = [item.lexical_tone for item in items]
    for i, item in enumerate(items[:-1]):
        next_tone = items[i + 1].lexical_tone
        previous = items[i - 1].hanzi if i else ""
        repeated = previous == items[i + 1].hanzi and previous != ""
        if item.hanzi == "一" and item.lexical_tone == 1 and previous != "第":
            tones[i] = 5 if repeated else {1: 4, 2: 4, 3: 4, 4: 2, 5: 1}[next_tone]
        if item.hanzi == "不" and item.lexical_tone == 4:
            tones[i] = 5 if repeated else 2 if next_tone == 4 else 4
    for i, tone in enumerate(tones):
        if tone == 3 and i + 1 < len(tones) and tones[i + 1] == 3:
            tones[i] = 2
    for i, tone in overrides.items():
        if i not in range(len(tones)) or tone not in range(1, 6):
            raise ValueError("Invalid surface-tone override")
        tones[i] = tone
    out = []
    for i, (item, tone) in enumerate(zip(items, tones, strict=True)):
        contour = {1: "high_level", 2: "rising", 4: "falling", 5: "neutral"}.get(tone)
        if tone == 3:
            contour = "low_third" if i < len(tones) - 1 else "phrase_final_third"
        surface_phones = tuple("ə" if tone == 5 and item.final == "e" and p == "ɤ" else p for p in item.phones)
        out.append(replace(item, surface_tone=tone, surface_phones=surface_phones, contour=contour))
    return tuple(out)


def character_error_rate(reference: str, hypothesis: str) -> dict[str, int | float]:
    ref = normalize_text(reference)
    hyp = normalize_text(hypothesis)
    if not ref:
        raise ValueError("CER requires a nonempty reference")
    previous = list(range(len(hyp) + 1))
    for i, target in enumerate(ref, 1):
        current = [i]
        for j, observed in enumerate(hyp, 1):
            current.append(min(current[-1] + 1, previous[j] + 1,
                               previous[j - 1] + (target != observed)))
        previous = current
    return {"edits": previous[-1], "reference_characters": len(ref), "cer": previous[-1] / len(ref)}
