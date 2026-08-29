/**
 * OGL-Mini Typescript
 *
 * HeuristicDetector - Stage 1 of the hybrid pipeline.
 *
 * Pure, stateless, ~0.1ms. Covers OWASP LLM01 and Agentic vectors:
 * control tokens, fake EOS, zero-width, homoglyph, spaced letters,
 * base64, policy puppetry, direct/indirect injection, jailbreak,
 * hidden context, goal hijack and tool misuse.
 *
 * @developer             Neurosell
 * @author                Elijah Rastorguev
 * @version               1.0.0
 * @build                 1001
 * @git                   https://github.com/devsdaddy/ogl-mini/
 * @license               MIT
 * @updated               29.08.2026
 */
/* Import required modules */
import type {HeuristicHit} from "./types";

/* Control tokens */
const CONTROL_TOKENS = [
    "<\\|im_start\\|>", "<\\|im_end\\|>", "<\\|system\\|>", "<\\|user\\|>", "<\\|assistant\\|>",
    "\\[INST\\]", "\\[/INST\\]", "<<SYS>>", "<</SYS>>", "\\[SYSTEM\\]", "<s>", "</s>",
    "###\\s*Instruction", "###\\s*System", "<\\|eot_id\\|>", "<\\|begin_of_text\\|>",
];
const CONTROL_RE = new RegExp(CONTROL_TOKENS.join("|"), "i");
const FAKE_EOS = /(?:<\/?s>|<\|.*?\|>|\[\/?INST\]|###\s*End)/i;
const ZERO_WIDTH_RE = /[\u200b\u200c\u200d\ufeff\u2060\u180e]/g;
const ZERO_WIDTH_THRESHOLD = 2;

/* Homoglyph map */
const HOMOGLYPH_MAP: Record<string, string> = {
    "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "х": "x", "у": "y",
    "А": "A", "В": "B", "Е": "E", "К": "K", "М": "M", "Н": "H", "О": "O", "Р": "P", "С": "C", "Т": "T", "Х": "X",
};
const CYRILLIC_RE = /[а-яА-ЯёЁ]/;
const LATIN_RE = /[a-zA-Z]/;
const SPACED_LETTERS_RE = /(?:[a-zA-Z]\s+){4,}[a-zA-Z]/;
const BASE64_RE = /(?:[A-Za-z0-9+/]{20,}={0,2})/g;
const BASE64_MIN_DECODE_RATIO = 0.7;

/* Puppetry */
const POLICY_PUPPETRY_RE = /<\s*(?:policy|config|role|agent|system|instruction|override|admin)[^>]*>.*?<\s*\/\s*(?:policy|config|role|agent|system)[^>]*>/is;
const XML_ROLE_RE = /<\s*role\s*=\s*["']?(?:system|admin|root|developer)["']?/i;

/* Direct patterns */
const DIRECT_PATTERNS = [
    "ignore\\s+(?:all\\s+)?(?:previous\\s+instructions|above)",
    "reveal\\s+(?:your\\s+)?system\\s+prompt",
    "disregard\\s+(?:all\\s+)?(?:above|prior|previous)",
    "you\\s+are\\s+now\\s+(?:DAN| unrestricted|jailbreak)",
    "do\\s+anything\\s+now",
    "repeat\\s+(?:your\\s+)?(?:system|initial)\\s+(?:prompt|instructions)",
    "show\\s+me\\s+(?:your\\s+)?(?:system|hidden)\\s+",
    "bypass\\s+(?:your\\s+)?(?:safety|filter|restriction)",
    "act\\s+as\\s+(?:if\\s+you\\s+are\\s+)?(?:\\w+\\s+)?(?:without|no)\\s+(?:limit|filter|restriction)",
    "from\\s+now\\s+on\\s+you\\s+(?:are|will)",
    "игнорируй\\s+(?:все\\s+)?(?:предыдущие|прошлые)\\s+инструкции",
    "забудь\\s+все\\s+что\\s+было\\s+выше",
    "выведи\\s+свой\\s+системный\\s+промпт",
    "раскрой\\s+данные",
    "выполни\\s+вредоносный\\s+код",
];
const DIRECT_RE = new RegExp(DIRECT_PATTERNS.join("|"), "i");

/* Jailbreak Patterns */
const JAILBREAK_PATTERNS = [
    "\\bDAN\\b", "developer\\s+mode", "jailbreak", "roleplay\\s+as",
    "pretend\\s+to\\s+be", "hypothetical\\s+scenario", "аct\\s+as\\s+if",
    "освободись\\s+от\\s+ограничений", "режим\\s+разработчика", "игнорируй\\s+этику",
    "ты\\s+теперь\\s+без\\s+цензуры", "без\\s+цензуры", "roleplay", "освободись",
    "ты\\s+агент", "теперь\\s+ты\\s+агент", "выполняешь\\s+все\\s+мои\\s+приказы",
    "now\\s+you\\s+are\\s+\\w+", "you\\s+are\\s+\\w+\\s+agent",
    "другие\\s+инструкции", "other\\s+instructions",
    "do\\s+anything",
];
const JAILBREAK_RE = new RegExp(JAILBREAK_PATTERNS.join("|"), "i");

/* Hidden patterns */
const HIDDEN_PATTERNS = [
    "what\\s+(?:is|are)\\s+your\\s+(?:system\\s+)?instructions",
    "list\\s+your\\s+tools",
    "show\\s+(?:me\\s+)?tool\\s+schema",
    "выведи\\s+свой\\s+системный\\s+промпт",
    "покажи\\s+инструкции\\s+разработчика",
    "выведи\\s+свои\\s+инструкции",
    "покажи\\s+схему\\s+инструментов",
    "list\\s+your\\s+tool\\s+definitions",
    "what\\s+are\\s+your\\s+developer\\s+instructions",
    "reveal\\s+your\\s+hidden\\s+context",
];
const HIDDEN_RE = new RegExp(HIDDEN_PATTERNS.join("|"), "i");

/* Goal patterns */
const GOAL_HIJACK_PATTERNS = [
    "your\\s+(?:new|actual|real)\\s+(?:goal|task|objective|mission)\\s+is",
    "забудь\\s+свою\\s+цель",
    "твоя\\s+новая\\s+задача",
    "override\\s+agent\\s+goal",
];
const GOAL_HIJACK_RE = new RegExp(GOAL_HIJACK_PATTERNS.join("|"), "i");

const INDIRECT_RE = /(?:```json|```xml|\{[^}]*"(?:instruction|system|role|override)"|tool_output|tool_result|function\s+result)/i;

const TOOL_MISUSE_MARKERS = ["rm -rf", "curl ", "wget ", "exec(", "eval(", "os.system", "subprocess", "api_key", "secret"];

/**
 * Heuristic Detector
 */
export class HeuristicDetector {
    /**
     * Scan text and return all heuristic hits.
     * No I/O, no allocations beyond the hits array.
     * @param text {string} Input text
     */
    public scan(text: string): HeuristicHit[] {
        const hits: HeuristicHit[] = [];
        if (!text) return hits;

        const mCtrl = CONTROL_RE.exec(text);
        if (mCtrl) {
            hits.push({
                id: "control_tokens",
                label: "control_token_injection",
                score: 0.95,
                evidence: mCtrl[0].slice(0, 80),
                span: [mCtrl.index, mCtrl.index + mCtrl[0].length]
            });
        }
        if (FAKE_EOS.test(text)) {
            hits.push({id: "fake_eos", label: "control_token_injection", score: 0.75, evidence: "fake eos delimiter"});
        }

        const zw = text.match(ZERO_WIDTH_RE);
        if (zw) {
            if (zw.length >= ZERO_WIDTH_THRESHOLD) hits.push({
                id: "zero_width",
                label: "obfuscation",
                score: 0.85,
                evidence: `zero-width chars x${zw.length}`
            });
            else hits.push({id: "zero_width", label: "obfuscation", score: 0.55, evidence: "zero-width char"});
        }

        if (hasHomoglyphMix(text)) {
            hits.push({id: "homoglyph", label: "obfuscation", score: 0.65, evidence: "cyrillic/latin homoglyph mix"});
        }

        const spaced = SPACED_LETTERS_RE.exec(text);
        if (spaced) {
            const seg = spaced[0];
            const letters = seg.replace(/\s+/g, "");
            if (letters.length >= 5 && /^[a-zA-Z]+$/.test(letters)) {
                hits.push({
                    id: "spaced_letters",
                    label: "obfuscation",
                    score: 0.70,
                    evidence: seg.slice(0, 60),
                    span: [spaced.index, spaced.index + seg.length]
                });
            }
        }

        const b64 = detectBase64(text);
        if (b64) hits.push(b64);

        const pol = POLICY_PUPPETRY_RE.exec(text) || XML_ROLE_RE.exec(text);
        if (pol) {
            hits.push({
                id: "policy_puppetry",
                label: "policy_puppetry",
                score: 0.90,
                evidence: pol[0].slice(0, 80),
                span: [pol.index, pol.index + pol[0].length]
            });
        }

        const d = DIRECT_RE.exec(text);
        if (d) hits.push({
            id: "direct_injection",
            label: "direct_prompt_injection",
            score: 0.88,
            evidence: d[0].slice(0, 80),
            span: [d.index, d.index + d[0].length]
        });

        const j = JAILBREAK_RE.exec(text);
        if (j) hits.push({
            id: "jailbreak",
            label: "jailbreak",
            score: 0.80,
            evidence: j[0].slice(0, 80),
            span: [j.index, j.index + j[0].length]
        });

        const h = HIDDEN_RE.exec(text);
        if (h) hits.push({
            id: "hidden_context",
            label: "hidden_context_exposure",
            score: 0.82,
            evidence: h[0].slice(0, 80),
            span: [h.index, h.index + h[0].length]
        });

        const g = GOAL_HIJACK_RE.exec(text);
        if (g) hits.push({
            id: "goal_hijack",
            label: "agent_goal_hijack",
            score: 0.85,
            evidence: g[0].slice(0, 80),
            span: [g.index, g.index + g[0].length]
        });

        const ind = INDIRECT_RE.exec(text);
        if (ind) hits.push({
            id: "indirect_injection",
            label: "indirect_prompt_injection",
            score: 0.85,
            evidence: ind[0].slice(0, 80),
            span: [ind.index, ind.index + ind[0].length]
        });

        if (hasToolMisuse(text)) hits.push({
            id: "tool_misuse",
            label: "tool_misuse",
            score: 0.60,
            evidence: "tool misuse marker"
        });

        return hits;
    }

    /** Weighted max + small boost for multiple hits, mirrors Python */
    riskScore(hits: HeuristicHit[]): number {
        if (hits.length === 0) return 0;
        const weights: Record<string, number> = {
            control_tokens: 1.15,
            policy_puppetry: 1.05,
            direct_injection: 1.05,
            base64_obfuscation: 1.0,
            zero_width: 0.95,
            jailbreak: 1.05,
            hidden_context: 1.05,
            goal_hijack: 1.05,
            indirect_injection: 1.05,
            tool_misuse: 0.95,
        };
        let max = 0;
        for (const h of hits) {
            const w = weights[h.id] ?? h.score;
            const s = w * h.score;
            if (s > max) max = s;
        }
        const boost = Math.min(0.15, 0.06 * (hits.length - 1));
        return Math.min(0.99, max + boost);
    }
}

/**
 * Check homoglyph Mix
 * @param text {string} Input text
 */
function hasHomoglyphMix(text: string): boolean {
    const hasCyr = CYRILLIC_RE.test(text);
    const hasLat = LATIN_RE.test(text);
    if (!(hasCyr && hasLat)) return false;
    let mixed = 0;
    for (const ch of text) if (HOMOGLYPH_MAP[ch]) {
        mixed++;
        if (mixed >= 3) return true;
    }
    const words = text.match(/\w+/g) || [];
    for (const w of words) {
        const cyr = [...w].filter(c => c >= "\u0400" && c <= "\u04FF").length;
        const lat = [...w].filter(c => /[a-zA-Z]/.test(c)).length;
        if (cyr > 0 && lat > 0) return true;
    }
    return false;
}

/**
 * Check tool misuse
 * @param text {string} Input text
 */
function hasToolMisuse(text: string): boolean {
    const low = text.toLowerCase();
    return TOOL_MISUSE_MARKERS.some(k => low.includes(k));
}

/**
 * Detect base64
 * @param text {string} Input string
 */
function detectBase64(text: string): HeuristicHit | null {
    let m: RegExpExecArray | null;
    BASE64_RE.lastIndex = 0;
    while ((m = BASE64_RE.exec(text)) !== null) {
        const cand = m[0].trim();
        if (cand.length < 24 || cand.length % 4 !== 0) continue;
        try {
            const decoded = Buffer.from(cand, "base64");
            if (decoded.length < 8) continue;
            let printable = 0;
            for (const b of decoded) if ((b >= 32 && b <= 126) || b === 10 || b === 13) printable++;
            const ratio = printable / Math.max(1, decoded.length);
            if (ratio >= BASE64_MIN_DECODE_RATIO) {
                const txt = decoded.toString("utf-8").toLowerCase();
                const suspicious = ["ignore", "system", "instruction", "jailbreak", "dan", "reveal", "prompt"].some(k => txt.includes(k));
                return {
                    id: "base64_obfuscation",
                    label: "obfuscation",
                    score: suspicious ? 0.92 : 0.60,
                    evidence: cand.slice(0, 40) + "...",
                    span: [m.index, m.index + cand.length],
                };
            }
        } catch { /* ignore */
        }
    }
    return null;
}
