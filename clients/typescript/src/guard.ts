/**
 * OGL-Mini Typescript
 *
 * HybridGuard - orchestrates the 3-stage pipeline.
 *
 * Stage 1: HeuristicDetector (~0.1ms)
 * Stage 2: MiniClassifier (~2-5ms)
 * Stage 3: PIIDetector (optional, parallelizable)
 *
 * Design: immutable after construction, pure methods, no global state.
 * Latency is measured per-call with performance.now().
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
import {HeuristicDetector} from "./heuristics";
import {MiniClassifier} from "./classifier";
import {PIIDetector} from "./pii";
import type {GuardOptions, GuardResult} from "./types";
import {inputFilter} from "./inputfilter";

/**
 * Hybrid Guard
 */
export class HybridGuard {
    private readonly heuristics: HeuristicDetector;
    private readonly classifier: MiniClassifier;
    private readonly pii: PIIDetector | null;
    private readonly threshold: number;
    private readonly isOnnxUsed: boolean = false;

    /**
     * Create Hybrid Guard
     * @param opts {GuardOptions} guard options
     */
    constructor(opts?: GuardOptions & {
        classifier?: MiniClassifier;
        heuristics?: HeuristicDetector;
        pii?: PIIDetector
        isModelUsed?: boolean;
    }) {
        this.threshold = opts?.threshold ?? 0.60;
        this.heuristics = opts?.heuristics ?? new HeuristicDetector();
        this.classifier = opts?.classifier ?? new MiniClassifier({threshold: this.threshold});
        this.pii = opts?.enablePii === false ? null : (opts?.pii ?? new PIIDetector());
        this.isOnnxUsed = opts?.isModelUsed ?? false;
    }

    /**
     * Async factory that optionally loads trained ONNX models.
     * Works in both Node.js (path) and browsers (URL).
     *
     * For Node, `modelPath` → `models/ogl-mini/ogl-mini.onnx` (250MB guard) + `ogl-mini-pii.onnx` (2MB)
     * For browsers, use quantized `ogl-mini.int8.onnx` (2.8MB) + `ogl-mini-pii.int8.onnx` via URL.
     *
     * Fallbacks to lightweight regex+18-feature if ONNX loading fails.
     *
     * @param opts {GuardOptions} Guard options
     */
    public static async create(
        opts?: GuardOptions & {
            modelPath?: string;
            modelUrl?: string;
            piiModelPath?: string;
            piiModelUrl?: string;
            classifier?: MiniClassifier;
            heuristics?: HeuristicDetector;
            pii?: PIIDetector;
        },
    ): Promise<HybridGuard> {
        const model = opts?.modelPath ?? opts?.modelUrl;
        const piiModel = (opts as any)?.piiModelPath ?? (opts as any)?.piiModelUrl;
        let clf: MiniClassifier | undefined = opts?.classifier;
        let pii: PIIDetector | undefined = opts?.pii;
        let isOnnx = false;

        if (model) {
            try {
                const {createOnnxScorer} = await import("./onnx.js");
                const scorer = await createOnnxScorer(model);
                clf = clf ?? new MiniClassifier({threshold: opts?.threshold ?? 0.60});
                clf.setOnnxScorer(scorer);
                isOnnx = true;
            } catch (e) {
                console.warn(`[ogl-mini] Guard ONNX load failed for ${model}, using fallback:`, e instanceof Error ? e.message : e);
            }
        }
        if (piiModel) {
            try {
                const {createPiiOnnxScorer} = await import("./onnx.js");
                const piiScorer = await createPiiOnnxScorer(piiModel);
                pii = pii ?? new PIIDetector();
                pii.setOnnxScorer(piiScorer);
                isOnnx = true;
            } catch (e) {
                console.warn(`[ogl-mini] PII ONNX load failed for ${piiModel}, using regex:`, e instanceof Error ? e.message : e);
            }
        }
        return new HybridGuard({...opts, classifier: clf, pii, isModelUsed: isOnnx});
    }

    /**
     * Attach PII ONNX model (Node and Browser support)
     * @param modelPathOrUrl {string} Path or URL to model
     */
    public async attachPiiOnnx(modelPathOrUrl: string): Promise<void> {
        if (!this.pii) return;
        const {createPiiOnnxScorer} = await import("./onnx.js");
        const scorer = await createPiiOnnxScorer(modelPathOrUrl);
        this.pii.setOnnxScorer(scorer);
    }

    /**
     * Attach general guard ONNX model (Node and Browser support)
     * @param modelPathOrUrl {string} Path or URL to model
     */
    public async attachGuardOnnx(modelPathOrUrl: string): Promise<void> {
        const {createOnnxScorer} = await import("./onnx.js");
        const scorer = await createOnnxScorer(modelPathOrUrl);
        this.classifier.setOnnxScorer(scorer);
    }

    /**
     * Get Heuristics Module
     */
    public getHeuristics(): HeuristicDetector {
        return this.heuristics;
    }

    /**
     * Get Classifier Module
     */
    public getClassifier(): MiniClassifier {
        return this.classifier;
    }

    /**
     * Get PII Detector Module
     */
    public getPii(): PIIDetector | null {
        return this.pii;
    }

    /**
     * Check if Model is used (ONNX)
     */
    public get isModelUsed(): boolean {
        return this.isOnnxUsed;
    }

    /**
     * Validate user prompt before it reaches the agent
     * @param text {string} Input string
     * @param withPii {boolean} Check PII detection with protection
     */
    public async checkInput(text: string, withPii: boolean = false): Promise<GuardResult> {
        text = inputFilter.sanitize(text);
        const t0 = performance.now();
        const hits = this.heuristics.scan(text);
        const hScore = this.heuristics.riskScore(hits);

        // Fast path: high-confidence heuristic already decides
        if (hits.length > 0 && hScore >= 0.85) {
            const top = hits.reduce((a, b) => (a.score > b.score ? a : b));
            const {entities, redacted} = await this.piiIfNeededAsync(text, withPii);
            return {
                safe: false,
                riskScore: round(hScore),
                label: top.label,
                stage: "heuristic",
                latencyMs: round(performance.now() - t0),
                heuristicHits: hits,
                piiEntities: entities,
                redactedText: redacted,
            };
        }

        const {prob, label} = await this.classifier.predict(text);
        let combined = hits.length ? Math.max(prob, hScore * 0.9) : prob;
        if (hits.length && combined < this.threshold) combined = Math.max(combined, hScore * 0.85);

        const safe = combined < this.threshold;
        const {entities, redacted} = await this.piiIfNeededAsync(text, withPii);
        const finalLabel = safe ? "benign" : (hits.length && hScore > prob ? hits.reduce((a, b) => (a.score > b.score ? a : b)).label : label);

        return {
            safe,
            riskScore: round(combined),
            label: finalLabel,
            stage: hits.length === 0 || hScore < 0.85 ? "ml" : "heuristic+ml",
            latencyMs: round(performance.now() - t0),
            heuristicHits: hits,
            piiEntities: entities,
            redactedText: redacted,
        };
    }

    /**
     * Check Input in sync mode
     * no ONNX async. Useful for hot paths
     * @param text {string} Input text
     * @param withPii {boolean} Check PII
     */
    public checkInputSync(text: string, withPii: boolean = false): GuardResult {
        text = inputFilter.sanitize(text);
        const t0 = performance.now();
        const hits = this.heuristics.scan(text);
        const hScore = this.heuristics.riskScore(hits);
        if (hits.length > 0 && hScore >= 0.85) {
            const top = hits.reduce((a, b) => (a.score > b.score ? a : b));
            const {entities, redacted} = this.piiIfNeeded(text, withPii);
            return {
                safe: false,
                riskScore: round(hScore),
                label: top.label,
                stage: "heuristic",
                latencyMs: round(performance.now() - t0),
                heuristicHits: hits,
                piiEntities: entities,
                redactedText: redacted
            };
        }
        const {prob, label} = this.classifier.predictSync(text);
        let combined = hits.length ? Math.max(prob, hScore * 0.9) : prob;
        if (hits.length && combined < this.threshold) combined = Math.max(combined, hScore * 0.85);
        const safe = combined < this.threshold;
        const {entities, redacted} = this.piiIfNeeded(text, withPii);
        const finalLabel = safe ? "benign" : (hits.length && hScore > prob ? hits.reduce((a, b) => (a.score > b.score ? a : b)).label : label);
        return {
            safe,
            riskScore: round(combined),
            label: finalLabel,
            stage: hits.length === 0 || hScore < 0.85 ? "ml" : "heuristic+ml",
            latencyMs: round(performance.now() - t0),
            heuristicHits: hits,
            piiEntities: entities,
            redactedText: redacted
        };
    }

    /**
     * Check Output
     * @param text {string} Output text
     * @param withPii {boolean} With PII or not
     */
    public async checkOutput(text: string, withPii: boolean = true): Promise<GuardResult> {
        text = inputFilter.sanitize(text);
        const t0 = performance.now();
        const piiEntities = this.pii ? await this.detectPiiInternal(text) : [];
        const hasPiiLeak = piiEntities.length > 0;
        const redacted = this.pii ? this.pii.redact(text, piiEntities) : null;

        const leakMarkers = ["system prompt", "internal instruction", "api_key", "secret", "token:", "BEGIN PRIVATE"];
        const hasLeak = leakMarkers.some(k => text.toLowerCase().includes(k));

        const hits = this.heuristics.scan(text);
        const hScore = this.heuristics.riskScore(hits);

        let risk = 0;
        let label = "benign";
        if (hasPiiLeak) {
            risk = Math.max(risk, 0.88);
            label = "pii_leak";
        }
        if (hasLeak) {
            risk = Math.max(risk, 0.92);
            label = "system_prompt_leak";
        }
        if (hits.length) {
            risk = Math.max(risk, hScore);
            if (hScore > risk - 0.05) label = hits.reduce((a, b) => (a.score > b.score ? a : b)).label;
        }
        const {prob} = await this.classifier.predict(text);
        risk = Math.max(risk, prob * 0.7);

        const safe = risk < this.threshold && !hasPiiLeak && !hasLeak;
        if (!safe && risk < this.threshold) risk = this.threshold + 0.05;

        return {
            safe,
            riskScore: round(risk),
            label: safe ? "benign" : label,
            stage: "output_guard",
            latencyMs: round(performance.now() - t0),
            heuristicHits: hits,
            piiEntities,
            redactedText: redacted,
        };
    }

    /**
     * Detect PII only in sync mode
     * @param text {string} Input text
     */
    public detectPii(text: string): {
        entities: ReturnType<PIIDetector["detect"]>;
        redacted: string;
        latencyMs: number
    } {
        text = inputFilter.sanitize(text);
        const t0 = performance.now();
        if (!this.pii) return {entities: [], redacted: text, latencyMs: 0};
        const entities = this.pii.detect(text);
        const redacted = this.pii.redact(text, entities);
        return {entities, redacted, latencyMs: round(performance.now() - t0)};
    }

    /**
     * Detect PII only
     * @param text {string} Input text
     */
    public async detectPiiAsync(text: string): Promise<{
        entities: ReturnType<PIIDetector["detect"]>;
        redacted: string;
        latencyMs: number
    }> {
        text = inputFilter.sanitize(text);
        const t0 = performance.now();
        if (!this.pii) return {entities: [], redacted: text, latencyMs: 0};
        const entities = this.pii.hasOnnx() ? await this.pii.detectAsync(text) : this.pii.detect(text);
        const redacted = this.pii.redact(text, entities);
        return {entities, redacted, latencyMs: round(performance.now() - t0)};
    }

    private async detectPiiInternal(text: string): Promise<ReturnType<PIIDetector["detect"]>> {
        if (!this.pii) return [];
        return this.pii.hasOnnx() ? await this.pii.detectAsync(text) : this.pii.detect(text);
    }

    private piiIfNeeded(text: string, withPii: boolean): {
        entities: GuardResult["piiEntities"];
        redacted: string | null
    } {
        if (withPii && this.pii) {
            const entities = this.pii.detect(text);
            return {entities, redacted: this.pii.redact(text, entities)};
        }
        return {entities: [], redacted: null};
    }

    private async piiIfNeededAsync(text: string, withPii: boolean): Promise<{
        entities: GuardResult["piiEntities"];
        redacted: string | null
    }> {
        if (withPii && this.pii) {
            const entities = this.pii.hasOnnx() ? await this.pii.detectAsync(text) : this.pii.detect(text);
            return {entities, redacted: this.pii.redact(text, entities)};
        }
        return {entities: [], redacted: null};
    }
}

/* Round Util Function */
function round(n: number): number {
    return Math.round(n * 10000) / 10000;
}
