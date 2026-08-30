/**
 * OGL-Mini Typescript
 *
 * ONNX scorer for OGL-Mini - works in Node.js and browsers.
 * - Node.js: uses `onnxruntime-node` (native, CPU, loads from filesystem)
 * - Browser: uses `onnxruntime-web` (WASM, loads via fetch)
 *
 * Both share the same API: createOnnxScorer(modelPathOrUrl) => (text)=>Promise<number>
 *
 * Model expectations:
 *  input: string tensor, shape [1,1], name "input" (skl2onnx TF-IDF pipeline)
 *   outputs: "label" (int64) and "probabilities" (float32[1,2]) or single probability.
 *   We extract P(attack) = prob[1].
 *
 * The 250MB FP32 model is for Node; for browsers use the 2.8MB INT8 quantized
 * variant (`ogl-mini.int8.onnx`) to avoid 250MB download.
 *
 * @developer             Neurosell
 * @author                Elijah Rastorguev
 * @version               1.0.0
 * @build                 1001
 * @git                   https://github.com/devsdaddy/ogl-mini/
 * @license               MIT
 * @updated               29.08.2026
 */
/* ONNX Scorer */
export type OnnxScorer = (text: string) => Promise<number | null>;

/**
 * Detect if we are in a browser-like environment
 */
function isBrowser(): boolean {
    return typeof window !== "undefined" || typeof self !== "undefined" || typeof document !== "undefined";
}

/**
 * Lazy loader for ORT - uses onnxruntime-web (WASM) for both Node and browser
 * to avoid native compilation. onnxruntime-node is also supported if present.
 */
async function getOrt(): Promise<any> {
    if (isBrowser()) {
        // Browser Runtime
        const ort = await import("onnxruntime-web");
        try {
            ort.env.wasm.numThreads = Math.min(4, (navigator as any).hardwareConcurrency ?? 4);
            if (!ort.env.wasm.wasmPaths) {
                ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.0/dist/";
            }
        } catch { /* ignore */
        }
        return ort;
    } else {
        // Node
        try {
            // Trying to get native
            return await import("onnxruntime-node");
        } catch {
            // Trying to get web version WASM
            const ort = await import("onnxruntime-web");
            try {
                const {createRequire} = await import("node:module");
                const path = await import("node:path");

                const require = createRequire(import.meta.url);
                const pkgPath = require.resolve('onnxruntime-web/package.json');
                const wasmDir = path.join(path.dirname(pkgPath), 'dist');
                ort.env.wasm.wasmPaths = wasmDir; // or pathToFileURL(wasmDir).href
            } catch {
                // fallback for CDN
                ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.0/dist/";
            }
            return ort;
        }
    }
}

/**
 * Create a scorer backed by an ONNX model.
 * The returned function is `(text:string)=>Promise<number|null>` where number is P(attack).
 *
 * @param modelPathOrUrl - filesystem path (Node) or URL (Browser). E.g. "./models/ogl-mini.onnx" or "/models/ogl-mini.int8.onnx"
 * @param opts
 * @param opts.inputName - override if your model uses different input name (default auto-detected)
 * @param opts.logLevel - Log level
 */
export async function createOnnxScorer(
    modelPathOrUrl: string,
    opts?: { inputName?: string; logLevel?: "verbose" | "info" | "warning" | "error" },
): Promise<OnnxScorer> {
    const ort = await getOrt();

    if (opts?.logLevel) {
        try {
            ort.env.logLevel = opts.logLevel;
        } catch { /* ignore */
        }
    }

    // In browser, modelPathOrUrl is a URL; in Node, a filesystem path or Uint8Array.
    // onnxruntime-node accepts path string; onnxruntime-web accepts URL string or ArrayBuffer.
    let session: any;
    if (isBrowser()) {
        // Browser: fetch ArrayBuffer and create from buffer to avoid CORS issues with WASM
        // onnxruntime-web can also create directly from URL string, but fetching gives better errors.
        session = await ort.InferenceSession.create(modelPathOrUrl, {
            executionProviders: ["wasm"],
            graphOptimizationLevel: "all",
        });
    } else {
        // Node: filesystem path
        // Allow passing Uint8Array or path; try both
        const fs = await import("node:fs");
        const path = await import("node:path");
        let modelInput: string | Uint8Array = modelPathOrUrl;
        // If path is relative, resolve against cwd
        if (typeof modelPathOrUrl === "string" && !modelPathOrUrl.startsWith("http")) {
            const resolved = path.resolve(modelPathOrUrl);
            if (!fs.existsSync(resolved)) {
                throw new Error(`ONNX model not found at ${resolved}. Checked original: ${modelPathOrUrl}`);
            }
            modelInput = resolved;
        }
        session = await ort.InferenceSession.create(modelInput as string, {
            executionProviders: ["cpu"],
            graphOptimizationLevel: "all",
            logSeverityLevel: 2,
        });
    }

    const inputName = opts?.inputName ?? (session.inputNames?.[0] ?? "input");
    const outputNames = session.outputNames ?? [];

    // Heuristic to find probability output: prefer "probabilities", "output_probability", "prob"
    const probOutputName = outputNames.find((n: string) => /prob/i.test(n)) ?? outputNames[1] ?? outputNames[0];

    return async (text: string): Promise<number | null> => {
        try {
            // String tensor: dims [1,1], data [text]
            // onnxruntime-web/node expects Tensor type "string"
            const tensor = new ort.Tensor("string", [text], [1, 1]);
            const feeds: Record<string, any> = {[inputName]: tensor};
            const results = await session.run(feeds);

            // Try known output names
            let out: any = results[probOutputName] ?? results[outputNames[0]] ?? Object.values(results)[0];
            if (!out) return null;

            // out.data is TypedArray or Array
            const data: any = out.data ?? out;
            // Cases:
            // - probabilities: Float32Array [p_benign, p_attack] or [[p_benign, p_attack]]
            // - label: Int64Array [0|1]
            // - map: Map or object
            if (Array.isArray(data) || ArrayBuffer.isView(data)) {
                const arr = data as any;
                if (arr.length === 2) {
                    return Number(arr[1]);
                }
                if (arr.length === 1 && Array.isArray(arr[0])) {
                    return Number(arr[0][1]);
                }
                if (typeof arr[0] === "object" && arr[0] !== null) {
                    const v = Object.values(arr[0] as any);
                    if (v.length === 2) return Number(v[1]);
                }
            }
            // If output is a map like {0: 0.1, 1: 0.9}
            if (typeof data === "object" && !ArrayBuffer.isView(data)) {
                const vals = Object.values(data as any);
                if (vals.length === 2) return Number(vals[1]);
                if ((data as any).data) return Number((data as any).data[1]);
            }
            return null;
        } catch (e) {
            // Don't throw - fallback to linear scorer
            console.warn("[ogl-mini] ONNX inference failed, falling back:", e instanceof Error ? e.message : e);
            return null;
        }
    };
}

/**
 * Convenience: warm up the session with a dummy input to avoid first-call latency.
 */
export async function warmupScorer(scorer: OnnxScorer): Promise<void> {
    try {
        await scorer("warmup");
    } catch { /* ignore */
    }
}

// ---------------------------------------------------------------------------
// PII ONNX (multi-label, 11 types)
// ---------------------------------------------------------------------------

/** Labels order like in training labels of model */
export const PII_LABELS = ["EMAIL", "PHONE", "PERSON", "IP", "IBAN", "BANK_CARD", "PASSPORT", "GOV_ID", "DOB", "ADDRESS", "SOCIAL"] as const;
export type PiiLabel = typeof PII_LABELS[number];
export type PiiOnnxScorer = (text: string) => Promise<Record<PiiLabel, number> | null>;

/**
 * Create scorer for PII-model `ogl-mini-pii.onnx` (Multi-label, TF-IDF 20k + OneVsRest).
 * Returns `Record<label, probability>` for 11 types. Used for reranking regex.
 *
 * @param modelPathOrUrl - path to `ogl-mini-pii.onnx` (2MB) or `ogl-mini-pii.int8.onnx` (browser, 2MB)
 * @param opts - Options
 */
export async function createPiiOnnxScorer(
    modelPathOrUrl: string,
    opts?: { inputName?: string },
): Promise<PiiOnnxScorer> {
    const ort = await getOrt();
    let session: any;
    if (isBrowser()) {
        session = await ort.InferenceSession.create(modelPathOrUrl, {
            executionProviders: ["wasm"],
            graphOptimizationLevel: "all"
        });
    } else {
        const fs = await import("node:fs");
        const path = await import("node:path");
        let modelInput: string = modelPathOrUrl;
        if (!modelPathOrUrl.startsWith("http")) {
            const resolved = path.resolve(modelPathOrUrl);
            if (!fs.existsSync(resolved)) throw new Error(`PII ONNX not found at ${resolved}`);
            modelInput = resolved;
        }
        session = await ort.InferenceSession.create(modelInput, {
            executionProviders: ["cpu"],
            graphOptimizationLevel: "all"
        });
    }
    const inputName = opts?.inputName ?? (session.inputNames?.[0] ?? "input");
    // ogl-mini-pii.onnx has outputs: label [1,11] and probabilities [1,11]
    const probName = session.outputNames?.find((n: string) => /prob/i.test(n)) ?? session.outputNames?.[1] ?? "probabilities";

    return async (text: string): Promise<Record<PiiLabel, number> | null> => {
        try {
            const tensor = new ort.Tensor("string", [text], [1, 1]);
            const results = await session.run({[inputName]: tensor});
            const out: any = results[probName] ?? Object.values(results)[1] ?? Object.values(results)[0];
            if (!out) return null;
            const data: any = out.data ?? out;
            // data is Float32Array length 11, order = PII_LABELS
            let probs: number[] = [];
            if (ArrayBuffer.isView(data)) {
                probs = Array.from(data as any);
                if (probs.length === PII_LABELS.length) {
                    // ok
                } else if ((data as any).length === 11) {
                    probs = Array.from(data as Float32Array);
                }
            } else if (Array.isArray(data)) {
                if (Array.isArray(data[0])) probs = data[0] as number[];
                else probs = data as number[];
            }
            if (probs.length !== PII_LABELS.length) {
                // Try to handle shape [1,11]
                if (Array.isArray(data) && data.length === 1 && Array.isArray(data[0]) && data[0].length === PII_LABELS.length) {
                    probs = data[0];
                } else {
                    console.warn("[ogl-mini] PII ONNX unexpected probs shape", data);
                    return null;
                }
            }
            const rec: Record<string, number> = {};
            for (let i = 0; i < PII_LABELS.length; i++) rec[PII_LABELS[i]] = Number(probs[i] ?? 0);
            return rec as Record<PiiLabel, number>;
        } catch (e) {
            console.warn("[ogl-mini] PII ONNX failed, using regex only:", e instanceof Error ? e.message : e);
            return null;
        }
    };
}

/**
 * Binary PII scorer (pii.onnx) - P(has_pii) for fast gateway
 */
export async function createPiiBinaryScorer(modelPathOrUrl: string): Promise<OnnxScorer> {
    // pii.onnx - single output P(has_pii), same API as a guard
    return createOnnxScorer(modelPathOrUrl);
}
