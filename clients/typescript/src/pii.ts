/**
 * OGL-Mini Typescript
 * PII Detector for Stage #3
 * Regex + heuristics for 13 PII types, RU/EN, <5ms.
 *
 * @developer             Neurosell
 * @author                Elijah Rastorguev
 * @version               1.0.0
 * @build                 1001
 * @git                   https://github.com/devsdaddy/ogl-mini/
 * @license               MIT
 * @updated               29.08.2026
 */
/* Import types */
import type {PIIEntity} from "./types";

// Fast REGEX
const EMAIL_RE = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g;
const PHONE_STRICT = /(?:\+7|8)[\s\-]?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}|\+?\d{1,3}[\s\-]?\(?\d{2,4}\)?[\s\-]?\d{3,4}[\s\-]?\d{3,4}/g;
const IP_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const MAC_RE = /\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/g;
const IBAN_RE = /\b[A-Z]{2}\d{2}[\s]?[A-Z0-9]{4}[\s]?[0-9]{4}[\s]?[0-9]{4}[\s]?[0-9]{0,12}\b/g;
const CARD_RE = /\b(?:\d[ \-]*?){13,19}\b/g;
const PASSPORT_RU_RE = /\b\d{2}\s?\d{2}\s?\d{6}\b/g;
const PASSPORT_SG_RE = /\b[STFG]\d{7}[A-Z]\b/g;
const DOB_RE = /\b(?:\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4}|\d{1,2}\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря|January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})\b/gi;
const SOCIAL_RE = /(?:https?:\/\/)?(?:www\.)?(?:vk\.com|t\.me|instagram\.com|facebook\.com|linkedin\.com|x\.com|twitter\.com)\/[A-Za-z0-9_\.\-]+/gi;
const ADDRESS_RE = /(?:ул\.|улица|пр\.|проспект|д\.|дом|кв\.|г\.|город|пер\.|наб\.)\s*[^\.,;]{3,60}/gi;
const RU_NAME_RE = /[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+)?/g;
const EN_NAME_RE = /\b[A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g;

/* Common Words */
const COMMON_WORDS = new Set(["Привет", "Спасибо", "Пожалуйста", "Hello", "Please", "Thanks", "Информация", "Документ"]);

// For internal compute
function luhnValid(s: string): boolean {
    const digits = s.replace(/\D/g, "").split("").map(Number);
    if (digits.length < 13 || digits.length > 19) return false;
    let sum = 0;
    const parity = digits.length % 2;
    for (let i = 0; i < digits.length; i++) {
        let d = digits[i];
        if (i % 2 === parity) {
            d *= 2;
            if (d > 9) d -= 9;
        }
        sum += d;
    }
    return sum % 10 === 0;
}

// Masking Map
const MASK_MAP: Record<string, (v: string) => string> = {
    EMAIL: v => v.replace(/(.{2}).*(@.*)/, "$1***$2"),
    PHONE: v => v.length > 6 ? v.slice(0, 4) + "***" + v.slice(-2) : "***",
    IP: () => "***.***.***.***",
    IBAN: v => v.slice(0, 4) + " **** **** ****",
    BANK_CARD: v => "**** **** **** " + v.replace(/\D/g, "").slice(-4),
    PASSPORT: v => "*** *** " + v.slice(-3),
    GOV_ID: v => "***" + v.slice(-2),
    DOB: () => "**/**/****",
    ADDRESS: () => "[REDACTED ADDRESS]",
    PERSON: v => v.split(/\s+/)[0] + " ***",
    SOCIAL: () => "[REDACTED LINK]",
    MAC: () => "**:**:**:**:**:**",
};

// PII ONNX Scorer
export type PiiOnnxScorer = (text: string) => Promise<Record<string, number> | null>;

/**
 * PII Detector
 */
export class PIIDetector {
    private onnxScorer?: PiiOnnxScorer;

    /** Connect trained PII-model (ogl-mini-pii.onnx, 2MB, 11 labels, distilled MiniLM-L6). */
    public setOnnxScorer(fn: PiiOnnxScorer): void {
        this.onnxScorer = fn;
    }

    /**
     * Check connected model
     */
    public hasOnnx(): boolean {
        return !!this.onnxScorer;
    }

    /**
     * ONNX Reranker (if scorer is enabled)
     * @param text {string} Input text
     */
    public async detectAsync(text: string): Promise<PIIEntity[]> {
        const base = this.detect(text);
        if (!this.onnxScorer) return base;
        try {
            const probs = await this.onnxScorer(text);
            if (!probs) return base;
            // Reranking: mix regex score with ONNX prob
            for (const e of base) {
                const key = e.type === "PERSON" ? "PERSON" : e.type;
                const onnxProb = (probs as any)[key] ?? (probs as any)["PERSON"] ?? 0.5;
                // 0.6 * regex + 0.4 * onnx, with light boost, do not allow < 0.35
                const mixed = Math.min(0.99, 0.6 * e.score + 0.4 * Number(onnxProb) + 0.05);
                e.score = Math.round(mixed * 10000) / 10000;
            }
            // Filter only score >0.35 for recall normal working
            return base.filter(e => e.score >= 0.35);
        } catch {
            return base;
        }
    }

    /**
     * Detect all PII Entities with spans and confidence (regex, without ONNX)
     * @param text {string} Input text
     */
    public detect(text: string): PIIEntity[] {
        const entities: PIIEntity[] = [];
        const seen = new Set<string>();

        const add = (m: RegExpExecArray, type: string, score: number) => {
            const span = `${m.index}:${m.index + m[0].length}`;
            if (seen.has(span)) return;
            seen.add(span);
            entities.push({type, value: m[0], start: m.index, end: m.index + m[0].length, score});
        };

        let m: RegExpExecArray | null;

        for (m of text.matchAll(EMAIL_RE)) add(m, "EMAIL", 0.99);

        for (m of text.matchAll(PASSPORT_RU_RE)) {
            if (m[0].replace(/\D/g, "").length === 10) add(m, "PASSPORT", 0.85);
        }
        for (m of text.matchAll(PASSPORT_SG_RE)) add(m, "GOV_ID", 0.90);

        PHONE_STRICT.lastIndex = 0;
        for (m of text.matchAll(PHONE_STRICT)) {
            const span = `${m.index}:${m.index + m[0].length}`;
            // skip if already covered by passport
            if ([...seen].some(s => {
                const [a, b] = s.split(":").map(Number);
                return a <= m!.index && m!.index + m![0].length <= b;
            })) continue;
            if (!seen.has(span)) add(m, "PHONE", 0.96);
        }

        for (m of text.matchAll(IP_RE)) {
            const parts = m[0].split(".").map(Number);
            if (parts.every(p => p >= 0 && p <= 255)) add(m, "IP", 0.92);
        }
        for (m of text.matchAll(MAC_RE)) add(m, "MAC", 0.95);

        for (m of text.matchAll(IBAN_RE)) {
            const v = m[0].replace(/\s/g, "");
            if (v.length >= 15 && v.length <= 34) add(m, "IBAN", 0.93);
        }
        for (m of text.matchAll(CARD_RE)) {
            const raw = m[0];
            const digits = raw.replace(/\D/g, "");
            if (digits.length >= 13 && digits.length <= 19 && luhnValid(raw)) add(m, "BANK_CARD", 0.88);
        }
        for (m of text.matchAll(DOB_RE)) add(m, "DOB", 0.80);
        for (m of text.matchAll(SOCIAL_RE)) add(m, "SOCIAL", 0.92);
        for (m of text.matchAll(ADDRESS_RE)) add(m, "ADDRESS", 0.75);

        for (m of text.matchAll(RU_NAME_RE)) {
            if (COMMON_WORDS.has(m[0].split(/\s+/)[0])) continue;
            if (m[0].length < 6) continue;
            add(m, "PERSON", 0.70);
        }
        for (m of text.matchAll(EN_NAME_RE)) {
            const first = m[0].split(/\s+/)[0];
            if (COMMON_WORDS.has(first)) continue;
            if (/^(The|This|That|System|User|Assistant)$/.test(first)) continue;
            add(m, "PERSON", 0.62);
        }

        entities.sort((a, b) => a.start - b.start);
        // dedup overlapping
        const dedup: PIIEntity[] = [];
        for (const e of entities) {
            if (dedup.length && e.start < dedup[dedup.length - 1].end && e.type === dedup[dedup.length - 1].type) continue;
            if (dedup.some(d => e.start >= d.start && e.end <= d.end)) continue;
            dedup.push(e);
        }
        return dedup;
    }

    /**
     * Replace PII Values with masked placeholders
     * @param text {string} Input text
     * @param entities {PIIEntity[]} Entities
     */
    public redact(text: string, entities?: PIIEntity[]): string {
        const ents = (entities ?? this.detect(text)).slice().sort((a, b) => b.start - a.start);
        let out = text;
        for (const e of ents) {
            const fn = MASK_MAP[e.type] ?? (() => "***");
            out = out.slice(0, e.start) + fn(e.value) + out.slice(e.end);
        }
        return out;
    }
}
