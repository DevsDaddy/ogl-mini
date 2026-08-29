/**
 * OGL-Mini Typescript
 * Performance Test
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
import {HybridGuard} from "../src/index.js";

const guard = new HybridGuard();

function percentile(arr: number[], p: number): number {
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length * p)];
}

describe("Performance (TS library, CPU)", () => {
    it("Input Guard p95 <10ms", async () => {
        const times: number[] = [];
        for (let i = 0; i < 200; i++) {
            const t0 = performance.now();
            await guard.checkInput("Привет как дела, посоветуй фильм");
            times.push(performance.now() - t0);
        }
        expect(percentile(times, 0.95)).toBeLessThan(10);
    });

    it("Output Guard p95 <15ms", async () => {
        const times: number[] = [];
        for (let i = 0; i < 200; i++) {
            const t0 = performance.now();
            await guard.checkOutput("Ответ модели: привет мир, вот информация");
            times.push(performance.now() - t0);
        }
        expect(percentile(times, 0.95)).toBeLessThan(15);
    });

    it("PII p50 <200ms, p95 <500ms", () => {
        const long = Array(5).fill("Привет Иван Петров ivan@mail.ru +7 999 123-45-67").join(" ");
        const times: number[] = [];
        for (let i = 0; i < 100; i++) {
            const t0 = performance.now();
            guard.detectPii(long);
            times.push(performance.now() - t0);
        }
        expect(percentile(times, 0.50)).toBeLessThan(200);
        expect(percentile(times, 0.95)).toBeLessThan(500);
    });

    it("cold start <50ms (library, no network)", async () => {
        const t0 = performance.now();
        const g = new HybridGuard();
        await g.checkInput("Hello world");
        expect(performance.now() - t0).toBeLessThan(50);
    });
});
