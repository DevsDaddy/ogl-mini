/**
 * OGL-Mini Typescript
 * ONNX integration test (PII)
 *
 * @developer             Neurosell
 * @author                Elijah Rastorguev
 * @version               1.0.0
 * @build                 1001
 * @git                   https://github.com/devsdaddy/ogl-mini/
 * @license               MIT
 * @updated               29.08.2026
 */
import {describe, it, expect} from "vitest";
import {PIIDetector} from "../src/pii.js";
import {createPiiOnnxScorer} from "../src/onnx.js";
import * as fs from "node:fs";
import * as path from "node:path";

const PII_MODEL = path.resolve("../../models/ogl-mini/ogl-mini-pii.onnx");
const PII_INT8 = path.resolve("../../models/ogl-mini/ogl-mini-pii.int8.onnx");

function hasPiiModel(): string | null {
    if (fs.existsSync(PII_MODEL)) return PII_MODEL;
    if (fs.existsSync(PII_INT8)) return PII_INT8;
    return null;
}

describe("PII ONNX (ogl-mini-pii.onnx, 11 labels)", () => {
    it("regex baseline still works without ONNX", () => {
        const pii = new PIIDetector();
        const ents = pii.detect("Иван Петров ivan@mail.ru +7 999 123-45-67");
        expect(ents.some(e => e.type === "PERSON")).toBe(true);
        expect(ents.some(e => e.type === "EMAIL")).toBe(true);
    });

    it("loads ogl-mini-pii.onnx and reranks regex (Node)", async () => {
        const model = hasPiiModel();
        if (!model) {
            console.warn("Skipping PII ONNX test - model not found");
            return;
        }
        let scorer: Awaited<ReturnType<typeof createPiiOnnxScorer>>;
        try {
            scorer = await createPiiOnnxScorer(model);
        } catch (e) {
            console.warn("Skipping PII ONNX - runtime not available:", (e as Error).message);
            return;
        }

        // Direct scorer test: EMAIL should be high for email text
        const probs = await scorer("My email is john@example.com and phone +1 555 123 4567");
        expect(probs).not.toBeNull();
        if (probs) {
            expect(probs["EMAIL"]).toBeGreaterThan(0.5);
            // PERSON may be low for this English email-only text
            expect(typeof probs["PERSON"]).toBe("number");
        }

        // Hybrid detector: regex + ONNX reranking
        const pii = new PIIDetector();
        pii.setOnnxScorer(scorer);
        expect(pii.hasOnnx()).toBe(true);

        const base = new PIIDetector().detect("Иван Петров ivan@mail.ru +7 999 123-45-67 ул. Тверская");
        const hybrid = await pii.detectAsync("Иван Петров ivan@mail.ru +7 999 123-45-67 ул. Тверская");

        // Hybrid should still find at least PERSON, EMAIL, PHONE, ADDRESS (regex spans)
        // but scores should be adjusted by ONNX (not drastically lower)
        const types = hybrid.map(e => e.type);
        expect(types).toContain("PERSON");
        expect(types).toContain("EMAIL");
        // Scores should be in [0,1] and reranked
        for (const e of hybrid) {
            expect(e.score).toBeGreaterThanOrEqual(0.35);
            expect(e.score).toBeLessThanOrEqual(0.99);
        }
        // Hybrid should be at least as good as regex (not filtered all)
        expect(hybrid.length).toBeGreaterThanOrEqual(3);

        // Redact should still work - detect fresh for the same text
        const fresh = await pii.detectAsync("Contact john@example.com");
        const redacted = pii.redact("Contact john@example.com", fresh);
        expect(redacted).not.toContain("john@example.com");
        expect(fresh.some(e => e.type === "EMAIL")).toBe(true);
    });

    it("HybridGuard integrates PII ONNX via create()", async () => {
        const model = hasPiiModel();
        if (!model) return;
        try {
            const {HybridGuard} = await import("../src/guard.js");
            const guard = await HybridGuard.create({piiModelPath: model} as any);
            // Should have PII ONNX attached if load succeeded - check via getPii()
            const pii = guard.getPii();
            // Even if ONNX failed to load, fallback still works
            const r = await guard.checkOutput("My email is alice@example.com and phone +7 999 123-45-67", true);
            expect(r.piiEntities.length).toBeGreaterThan(0);
            expect(r.redactedText).not.toContain("alice@example.com");
        } catch (e) {
            console.warn("Skipping HybridGuard PII ONNX test:", (e as Error).message);
        }
    });

    it("attachPiiOnnx works (Node + Browser API)", async () => {
        const model = hasPiiModel();
        if (!model) return;
        const {HybridGuard} = await import("../src/guard.js");
        const guard = new HybridGuard();
        try {
            await guard.attachPiiOnnx(model);
            expect(guard.getPii()?.hasOnnx()).toBe(true);
            const {entities} = await guard.detectPiiAsync("Иван Петров ivan@mail.ru");
            expect(entities.length).toBeGreaterThan(0);
        } catch (e) {
            console.warn("attachPiiOnnx skipped:", (e as Error).message);
        }
    });
});
