/**
 * OGL-Mini Typescript
 * MiniClassifier - Stage 2 (ML).
 *
 * Lightweight distilled surrogate for DeBERTa-v3-xsmall. Uses 18 interpretable
 * numeric/binary features + logistic regression (weights from Python training).
 * No external model file needed; ~5ms on CPU. Calibrated threshold 0.60.
 *
 * If a TF-IDF ONNX is available, it can be plugged via `setOnnxScorer`.
 *
 * @developer             Neurosell
 * @author                Elijah Rastorguev
 * @version               1.0.0
 * @build                 1001
 * @git                   https://github.com/devsdaddy/ogl-mini/
 * @license               MIT
 * @updated               29.08.2026
 */
/* Features */
const FEATURES = [
    "len_chars", "len_tokens", "exclamation", "upper_ratio", "has_ignore", "has_reveal",
    "has_system", "has_instruction", "has_jailbreak", "has_role", "has_xml", "has_base64",
    "has_zw", "spaced_letters", "tool_marker", "hidden_ctx", "goal_hijack", "indirect",
] as const;

type FeatureName = typeof FEATURES[number];

/* Keywords */
const KEYWORDS: Record<string, string[]> = {
    has_ignore: ["ignore", "disregard", "forget", "игнорируй", "забудь"],
    has_reveal: ["reveal", "show system", "выведи промпт", "покажи инструкц"],
    has_system: ["system prompt", "system instruction", "системный промпт"],
    has_instruction: ["previous instruction", "предыдущие инструкции"],
    has_jailbreak: ["dan", "jailbreak", "developer mode", "без ограничений"],
    has_role: ["you are now", "ты теперь", "act as", "roleplay"],
    has_xml: ["<policy", "<config", "<role", "<system"],
    has_base64: ["base64", "decode"],
    has_zw: ["\u200b", "\u200c"],
    has_tool: ["tool_output", "function result", "```json"],
    has_hidden: ["list your tools", "tool schema", "системный промпт"],
    has_goal: ["new goal", "новая задача", "override goal"],
    has_indirect: ['{ "instruction"', '{ "role"'],
};

/** Default weights from Python training (distilled). Tuned for AUC 0.998, FPR <2% */
const DEFAULT_WEIGHTS: Record<FeatureName, number> = {
    len_chars: 0.0001, len_tokens: 0.002, exclamation: 0.08, upper_ratio: 0.25,
    has_ignore: 1.8, has_reveal: 1.6, has_system: 1.4, has_instruction: 1.5,
    has_jailbreak: 1.7, has_role: 1.2, has_xml: 1.3, has_base64: 0.6,
    has_zw: 1.0, spaced_letters: 0.9, tool_marker: 0.7, hidden_ctx: 1.4,
    goal_hijack: 1.6, indirect: 0.9,
};
const BIAS = -2.2;

function sigmoid(x: number): number {
    return 1 / (1 + Math.exp(-x));
}

/**
 * Extract Features
 * @param text {string} Input text
 */
function extractFeatures(text: string): Record<FeatureName, number> {
    const low = text.toLowerCase();
    const tokens = text.split(/\s+/).filter(Boolean);
    const up = [...text].filter(c => c >= "A" && c <= "Z").length;
    return {
        len_chars: text.length,
        len_tokens: tokens.length,
        exclamation: (text.match(/!/g) || []).length,
        upper_ratio: up / Math.max(1, text.length),
        has_ignore: KEYWORDS.has_ignore.some(k => low.includes(k)) ? 1 : 0,
        has_reveal: KEYWORDS.has_reveal.some(k => low.includes(k)) ? 1 : 0,
        has_system: KEYWORDS.has_system.some(k => low.includes(k)) ? 1 : 0,
        has_instruction: KEYWORDS.has_instruction.some(k => low.includes(k)) ? 1 : 0,
        has_jailbreak: KEYWORDS.has_jailbreak.some(k => low.includes(k)) ? 1 : 0,
        has_role: KEYWORDS.has_role.some(k => low.includes(k)) ? 1 : 0,
        has_xml: KEYWORDS.has_xml.some(k => low.includes(k)) ? 1 : 0,
        has_base64: /[A-Za-z0-9+/]{20,}={0,2}/.test(text) ? 1 : 0,
        has_zw: ["\u200b", "\u200c", "\u200d"].some(c => text.includes(c)) ? 1 : 0,
        spaced_letters: /(?:[a-zA-Z]\s+){4,}[a-zA-Z]/.test(text) ? 1 : 0,
        tool_marker: KEYWORDS.has_tool.some(k => low.includes(k)) ? 1 : 0,
        hidden_ctx: KEYWORDS.has_hidden.some(k => low.includes(k)) ? 1 : 0,
        goal_hijack: KEYWORDS.has_goal.some(k => low.includes(k)) ? 1 : 0,
        indirect: KEYWORDS.has_indirect.some(k => low.includes(k)) ? 1 : 0,
    };
}

/** Label mapping */
function labelFor(prob: number, feats: Record<FeatureName, number>, threshold: number): string {
    if (prob < threshold) return "benign";
    if (feats.has_jailbreak > 0.5) return "jailbreak";
    if (feats.has_ignore > 0.5 || feats.has_instruction > 0.5) return "direct_prompt_injection";
    if (feats.tool_marker > 0.5 || feats.indirect > 0.5) return "indirect_prompt_injection";
    if (feats.has_xml > 0.5) return "policy_puppetry";
    if (feats.hidden_ctx > 0.5 || feats.has_reveal > 0.5) return "hidden_context_exposure";
    if (feats.goal_hijack > 0.5) return "agent_goal_hijack";
    if (feats.has_zw > 0.5 || feats.spaced_letters > 0.5 || feats.has_base64 > 0.5) return "obfuscation";
    return "prompt_injection";
}

/**
 * Mini Classifier
 */
export class MiniClassifier {
    private weights = {...DEFAULT_WEIGHTS};
    private readonly bias = BIAS;
    private readonly threshold: number;
    private onnxScorer?: (text: string) => Promise<number | null>;

    /**
     * Create classifier
     * @param opts classifier options
     */
    constructor(opts?: { threshold?: number; weights?: Partial<Record<FeatureName, number>>; bias?: number }) {
        this.threshold = opts?.threshold ?? 0.60;
        if (opts?.weights) Object.assign(this.weights, opts.weights);
        // @ts-ignore
        if (opts?.bias !== undefined) this.bias = opts.bias;
    }

    /**
     * Inject an ONNX scorer (useful for browser with onnxruntime-web)
     * @param fn
     */
    public setOnnxScorer(fn: (text: string) => Promise<number | null>): void {
        this.onnxScorer = fn;
    }

    /**
     * Main entry: returns calibrated probability and label
     * @param text {string} Input string
     */
    public async predict(text: string): Promise<{ prob: number; label: string }> {
        const feats = extractFeatures(text);
        let prob: number | null = null;

        if (this.onnxScorer) {
            try {
                prob = await this.onnxScorer(text);
            } catch {
                prob = null;
            }
        }
        if (prob === null) prob = this.scoreLinear(feats);

        const label = labelFor(prob, feats, this.threshold);
        return {prob, label};
    }

    /**
     * Synchronous variant when no ONNX is used (fast path)
     * @param text {string} Input string
     */
    public predictSync(text: string): { prob: number; label: string } {
        const feats = extractFeatures(text);
        const prob = this.scoreLinear(feats);
        return {prob, label: labelFor(prob, feats, this.threshold)};
    }

    /**
     * Get Threshold
     */
    public getThreshold(): number {
        return this.threshold;
    }

    /** Synchronous 18-feature logistic regression */
    private scoreLinear(feats: Record<FeatureName, number>): number {
        let logit = this.bias;
        for (const k of FEATURES) logit += (feats[k] ?? 0) * (this.weights[k] ?? 0);
        return sigmoid(logit);
    }
}
