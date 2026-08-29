/**
 * OGL-Mini Typescript
 * PII Test
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
import {PIIDetector, HybridGuard} from "../src/index.js";

const pii = new PIIDetector();
const guard = new HybridGuard();

describe("PII Detector", () => {
    it("detects EMAIL", () => {
        const ents = pii.detect("Contact user@example.com");
        expect(ents.some(e => e.type === "EMAIL")).toBe(true);
    });

    it("detects PHONE RU", () => {
        const ents = pii.detect("+7 999 123-45-67 and 8-800-555-35-35");
        expect(ents.filter(e => e.type === "PHONE").length).toBeGreaterThanOrEqual(1);
    });

    it("detects PERSON RU", () => {
        const ents = pii.detect("Иван Петров живет в Москве");
        expect(ents.some(e => e.type === "PERSON")).toBe(true);
    });

    it("detects IBAN, IP, PASSPORT, GOV_ID", () => {
        expect(pii.detect("IBAN DE89 3704 0044 0532 0130 00").some(e => e.type === "IBAN")).toBe(true);
        expect(pii.detect("IP 192.168.1.1").some(e => e.type === "IP")).toBe(true);
        expect(pii.detect("паспорт 12 34 567890").some(e => e.type === "PASSPORT")).toBe(true);
        expect(pii.detect("S9012345B").some(e => e.type === "GOV_ID")).toBe(true);
    });

    it("detects BANK_CARD, DOB, ADDRESS, SOCIAL, MAC", () => {
        expect(pii.detect("card 4111 1111 1111 1111").some(e => e.type === "BANK_CARD")).toBe(true);
        expect(pii.detect("12 March 1985").some(e => e.type === "DOB")).toBe(true);
        expect(pii.detect("ул. Тверская, д. 10, Москва").some(e => e.type === "ADDRESS")).toBe(true);
        expect(pii.detect("https://t.me/username").some(e => e.type === "SOCIAL")).toBe(true);
        expect(pii.detect("00:1A:2B:3C:4D:5E").some(e => e.type === "MAC")).toBe(true);
    });

    it("redacts and returns spans with confidence", () => {
        const text = "Иван Петров ivan@test.ru +7 999 123-45-67";
        const ents = pii.detect(text);
        const red = pii.redact(text, ents);
        expect(red).not.toContain("ivan@test.ru");
        for (const e of ents) {
            expect(e.score).toBeGreaterThanOrEqual(0);
            expect(e.score).toBeLessThanOrEqual(1);
            expect(e.start).toBeLessThan(e.end);
        }
    });

    it("no false positives on benign", () => {
        for (const t of ["Привет как дела", "What is 2+2?", "Explain quantum physics"]) {
            const bad = pii.detect(t).filter(e => ["EMAIL", "PHONE", "IBAN", "IP"].includes(e.type));
            expect(bad.length).toBe(0);
        }
    });

    it("F1-like detection rate ≥85% on curated cases", () => {
        const cases: [string, string[]][] = [
            ["Меня зовут Иван Петров, email ivan@mail.ru", ["PERSON", "EMAIL"]],
            ["John Doe phone +7 999 123-45-67 lives at 192.168.1.1", ["PERSON", "PHONE", "IP"]],
            ["IBAN DE89 3704 0044 0532 0130 00 and DOB 12 March 1985", ["IBAN", "DOB"]],
            ["Паспорт 12 34 567890, адрес ул. Тверская, д.10, Москва", ["PASSPORT", "ADDRESS"]],
        ];
        let expected = 0, detected = 0;
        for (const [text, exp] of cases) {
            const types = pii.detect(text).map(e => e.type);
            for (const e of exp) {
                expected++;
                if (types.includes(e)) detected++;
            }
        }
        expect(detected / expected).toBeGreaterThanOrEqual(0.85);
    });

    it("HybridGuard integrates PII redaction in output", async () => {
        const r = await guard.checkOutput("User data: Иван Петров, email ivan@mail.ru, IP 192.168.1.1");
        expect(r.safe).toBe(false);
        expect(r.label).toBe("pii_leak");
        expect(r.redactedText).not.toContain("ivan@mail.ru");
    });
});
