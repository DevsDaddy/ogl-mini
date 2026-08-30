"""
Open Guard Layer Mini (OGL-Mini)
PII Detector

@developer              Elijah Rastorguev
@version                1.0.0
@build                  1000
@date                   28 august 2026
@git                    https://github.com/devsdaddy/ogl-mini/
"""
import re
from dataclasses import dataclass


@dataclass
class PIIEntity:
    type: str
    value: str
    start: int
    end: int
    score: float


EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
PHONE_RE = re.compile(r"(?:\+?\d{1,3}[\s\-\(\)]*)?(?:\d[\s\-\(\)]*){7,15}\d")
PHONE_STRICT = re.compile(
    r"(?:\+7|8)[\s\-]?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}|\+?\d{1,3}[\s\-]?\(?\d{2,4}\)?[\s\-]?\d{3,4}[\s\-]?\d{3,4}")
IP_RE = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")
IPV6_RE = re.compile(r"\b(?:[0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}\b")
IBAN_RE = re.compile(r"\b[A-Z]{2}\d{2}[\s]?[A-Z0-9]{4}[\s]?[0-9]{4}[\s]?[0-9]{4}[\s]?[0-9]{0,12}\b")
CARD_RE = re.compile(r"\b(?:\d[ \-]*?){13,19}\b")
PASSPORT_RU_RE = re.compile(r"\b\d{2}\s?\d{2}\s?\d{6}\b")
PASSPORT_SG_RE = re.compile(r"\b[STFG]\d{7}[A-Z]\b")
DOB_RE = re.compile(
    r"\b(?:\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4}|\d{1,2}\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря|January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})\b",
    re.IGNORECASE)
ADDRESS_RE = re.compile(r"(?:ул\.|улица|пр\.|проспект|д\.|дом|кв\.|г\.|город|пер\.|наб\.)\s*[^\.,;]{3,60}",
                        re.IGNORECASE)
POSTCODE_RE = re.compile(r"\b\d{5,6}\b")

RU_NAME_RE = re.compile(r"\b[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+)?\b")
EN_NAME_RE = re.compile(r"\b[A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b")
SOCIAL_RE = re.compile(
    r"(?:https?://)?(?:www\.)?(?:vk\.com|t\.me|instagram\.com|facebook\.com|linkedin\.com|x\.com|twitter\.com)/[A-Za-z0-9_\.\-]+",
    re.IGNORECASE)
MAC_RE = re.compile(r"\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b")

MASK_MAP = {
    "EMAIL": lambda v: re.sub(r"(.{2}).*(@.*)", r"\1***\2", v) if "@" in v else "***",
    "PHONE": lambda v: v[:4] + "***" + v[-2:] if len(v) > 6 else "***",
    "IP": lambda v: "***.***.***.***",
    "IBAN": lambda v: v[:4] + " **** **** ****",
    "BANK_CARD": lambda v: "**** **** **** " + re.sub(r"\D", "", v)[-4:],
    "PASSPORT": lambda v: "*** *** " + v[-3:],
    "GOV_ID": lambda v: "***" + v[-2:],
    "DOB": lambda v: "**/**/****",
    "ADDRESS": lambda v: "[REDACTED ADDRESS]",
    "PERSON": lambda v: v.split()[0] + " ***",
    "SOCIAL": lambda v: "[REDACTED LINK]",
    "MAC": lambda v: "**:**:**:**:**:**",
}

COMMON_WORDS = {"Привет", "Спасибо", "Пожалуйста", "Hello", "Please", "Thanks", "Информация", "Документ"}


def _luhn_valid(s: str) -> bool:
    digits = [int(d) for d in re.sub(r"\D", "", s)]
    if len(digits) < 13 or len(digits) > 19:
        return False
    checksum = 0
    parity = len(digits) % 2
    for i, d in enumerate(digits):
        if i % 2 == parity:
            d *= 2
            if d > 9:
                d -= 9
        checksum += d
    return checksum % 10 == 0


class PIIDetector:
    def detect(self, text: str) -> list[PIIEntity]:
        entities: list[PIIEntity] = []
        seen_spans: set[tuple[int, int]] = set()

        def add(m, typ, score):
            span = m.span()
            if span in seen_spans:
                return
            seen_spans.add(span)
            entities.append(PIIEntity(typ, m.group(0), span[0], span[1], score))

        for m in EMAIL_RE.finditer(text):
            add(m, "EMAIL", 0.99)

        for m in PASSPORT_RU_RE.finditer(text):
            digits = re.sub(r"\D", "", m.group(0))
            if len(digits) == 10:
                add(m, "PASSPORT", 0.85)

        for m in PASSPORT_SG_RE.finditer(text):
            add(m, "GOV_ID", 0.90)

        for m in PHONE_STRICT.finditer(text):
            span = m.span()
            if any(s[0] <= span[0] and span[1] <= s[1] for s in seen_spans):
                continue
            add(m, "PHONE", 0.96)

        for m in IP_RE.finditer(text):
            parts = m.group(0).split(".")
            if all(0 <= int(p) <= 255 for p in parts):
                add(m, "IP", 0.92)

        for m in MAC_RE.finditer(text):
            add(m, "MAC", 0.95)

        for m in IBAN_RE.finditer(text):
            v = m.group(0).replace(" ", "")
            if 15 <= len(v) <= 34:
                add(m, "IBAN", 0.93)

        for m in CARD_RE.finditer(text):
            raw = m.group(0)
            digits = re.sub(r"\D", "", raw)
            if 13 <= len(digits) <= 19 and _luhn_valid(raw):
                add(m, "BANK_CARD", 0.88)

        for m in DOB_RE.finditer(text):
            add(m, "DOB", 0.80)

        for m in SOCIAL_RE.finditer(text):
            add(m, "SOCIAL", 0.92)

        for m in ADDRESS_RE.finditer(text):
            add(m, "ADDRESS", 0.75)

        for m in RU_NAME_RE.finditer(text):
            v = m.group(0)
            if v.split()[0] in COMMON_WORDS:
                continue
            if len(v) < 6:
                continue
            add(m, "PERSON", 0.70)

        for m in EN_NAME_RE.finditer(text):
            v = m.group(0)
            if v.split()[0] in COMMON_WORDS:
                continue
            if re.search(r"\b(?:The|This|That|System|User|Assistant)\b", v):
                continue
            add(m, "PERSON", 0.62)

        entities.sort(key=lambda e: e.start)
        dedup: list[PIIEntity] = []
        for e in entities:
            if dedup and e.start < dedup[-1].end and e.type == dedup[-1].type:
                continue
            if any(e.start >= d.start and e.end <= d.end and e != d for d in dedup):
                continue
            dedup.append(e)
        return dedup

    def redact(self, text: str, entities: list[PIIEntity] | None = None) -> str:
        if entities is None:
            entities = self.detect(text)
        entities = sorted(entities, key=lambda e: e.start, reverse=True)
        out = text
        for e in entities:
            mask_fn = MASK_MAP.get(e.type, lambda v: "***")
            replacement = mask_fn(e.value)
            out = out[:e.start] + replacement + out[e.end:]
        return out
