/**
 * OGL-Mini Typescript
 *
 * Shared types for Hybrid Guard based on OGL-Mini
 *
 * @developer             Neurosell
 * @author                Elijah Rastorguev
 * @version               1.0.0
 * @build                 1001
 * @git                   https://github.com/devsdaddy/ogl-mini/
 * @license               MIT
 * @updated               29.08.2026
 */
/**
 * Heuristic Hit
 */
export type HeuristicHit = {
    /** Stable identifier, e.g. "direct_injection" */
    id: string;
    /** Human-readable label, e.g. "direct_prompt_injection" */
    label: string;
    /** Confidence of this hit (0..1) */
    score: number;
    /** Evidence excerpt (truncated) */
    evidence: string;
    /** Optional character span */
    span?: [number, number];
};

/**
 * PII Entity
 */
export type PIIEntity = {
    type: string;
    value: string;
    start: number;
    end: number;
    score: number;
};

/**
 * Guard Result
 */
export type GuardResult = {
    /** True if input is considered safe */
    safe: boolean;
    /** Aggregated risk score 0..1 */
    riskScore: number;
    /** Final label (benign | direct_prompt_injection | jailbreak | ...) */
    label: string;
    /** Which stage produced the decision */
    stage: "heuristic" | "ml" | "heuristic+ml" | "output_guard";
    /** Latency in milliseconds */
    latencyMs: number;
    /** All heuristic hits (empty if none) */
    heuristicHits: HeuristicHit[];
    /** Detected PII entities (empty if disabled or none) */
    piiEntities: PIIEntity[];
    /** Redacted text if PII was requested, else null */
    redactedText: string | null;
};

/**
 * Guard Options
 */
export type GuardOptions = {
    /** Risk threshold (default 0.60) */
    threshold?: number;
    /** Enable PII layer (default true) */
    enablePii?: boolean;
};
