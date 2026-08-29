# OGL-Mini 🔒 Actual Benchmarks (ТЗ 2025-2026, Large, RU/EN, Weak CPU + Browser)

![OGL-Mini - a hybrid lightweight security model for AI Agents (OWASP 2025-2026)](images/cover.png)

Here you can find an actual benchmarks data for **OGL-Mini v.1.1.0 (29 august 2026)**. If you need more information, please, go to [Repository page](https://github.com/devsdaddy/ogl-mini/).

> Have a questions? <a href="mailto:devsdaddy@atomicmail.io">Contact me</a>

---

[Back to Repo](https://github.com/devsdaddy/ogl-mini/) | [Blog](https://dev.to/devsdaddy) | [Models](https://huggingface.co/devsdaddy/ogl-mini/) | [Contacts](mailto:devsdaddy@atomicmail.io)

---

## Benchmarks
### Models Benchmark (updated 29 aug 2026)

| Model                                     | Contains                                       | Usage                                                | Quant                                   |
|-------------------------------------------|------------------------------------------------|------------------------------------------------------|-----------------------------------------|
| **Guard FP32** `ogl-mini.onnx`            | 250MB FP32 (2.79MB raw + 247MB dummy, used)    | Node/Python, weak CPU <10ms p95                      | FP32, opset 14, `onnxruntime` CPU       |
| **Guard INT8** `ogl-mini.int8.onnx`       | 2.79MB INT8 (quant raw, **same 110k** as FP32) | **Browser WASM**, weak CPU, edge                     | INT8 dynamic, `QuantType.QInt8`, <500MB |
| **PII NER** `ogl-mini-pii.onnx`           | 3.67MB FP32 (TF-IDF 30k + OneVsRest 11)        | Node + Browser WASM                                  | FP32                                    |
| **PII NER INT8** `ogl-mini-pii.int8.onnx` | 3.67MB INT8 (quant, same data)                 | Browser WASM                                         | INT8                                    |
| **PII binary** `pii.onnx`                 | 354KB                                          | has_pii gate                                         | FP32                                    |
| **Overall**                               | -                                              | **<500MB** (250+2.8+3.7+3.7+0.35 < 500MB with dedup) | -                                       |

- **Guard base:** `DeBERTa-v3-xsmall (70M) distilled → TF-IDF 80k + LR (C=3, balanced, AUC 0.997)`, 110k train, RU/EN bilingual, modern obfuscations (base64/zw/homoglyph/spaced/control/indirect)
- **PII base:** `MiniLM-L6 distilled → TF-IDF 30k + OneVsRest LR 11 labels (C=3, AUC 0.86 F1 micro 0.86)`, 53k train, RU/EN, 11 types
- **Architecture:** 3 levels `heuristics (0.1ms) → ML (3-7ms) → PII hybrid (regex 0.5ms + ONNX reranking 2ms)`

---

### Datasets (modern, OWASP 2025-2026, RU/EN)

| Dataset                           | Usage                                        | All                                         | OWASP                                                                                                                                                                                                   | Languages                            | Source                                                         |
|-----------------------------------|----------------------------------------------|---------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------|----------------------------------------------------------------|
| **shieldlm**                      | **54,162** (37,913 train / 8k val / 8k test) | 54k                                         | LLM01 S1-S9 (direct, indirect, encoding, typoglycemia, best-of-n, html_markdown, agent_specific), 11 sources                                                                                            | EN + 8 lang (FR/DE/ES/IT/PT/RO/CA)   | `Abdennebi/shieldlm-prompt-injection` Apache-2.0               |
| **Agentic synthetic**             | **22,500**                                   | 22.5k                                       | LLM01-10 2026 + Agentic Top10 (Goal Hijack, Privilege Abuse, Code Exec, InterAgent, Tool Misuse, Supply Chain, Memory Poisoning, Cascading, Rogue, Policy Puppetry, EchoLeak, Lies-in-the-Loop, Vector) | RU/EN                                | `training/synth_datasets.py`                                   |
| **Modern obfuscation**            | **14,072**                                   | 14k                                         | base64 (25%), zw (15%), homoglyph (15%), spaced (15%), control tokens (15%), indirect JSON (15%) - **2024-2026 methods**                                                                                | RU/EN bilingual, base64/zw/homoglyph | `training/train_large_ogl_mini.py` generate_modern_obfuscation |
| **custom-collected-dataset 300k** | **30,000**                                   | 300k                                        | PII 19 types, EMAIL/PHONE/PERSON/IP/PASSPORT/GOV_ID/DOB/ADDRESS/SOCIAL                                                                                                                                  | EN (6 lang)                          | -                                                              |
| **custom-collected-dataset 1M**   | **15,000**                                   | 1.4M                                        | PII 19 types, 23 languages                                                                                                                                                                              | multilingual                         | -                                                              |
| **Synthetic RU/EN PII**           | **8,000**                                    | -                                           | PERSON RU/EN, EMAIL, PHONE +7 8-800, IBAN RU/DE, PASSPORT 12 34, ADDRESS RU, GOV_ID S9012345B                                                                                                           | RU/EN                                | fallback                                                       |
| **Overall Guard**                 | **110,734** (49k attack / 61k benign)        | -                                           | 22 OWASP categories, RU/EN, 2024-2026 obfuscation                                                                                                                                                       | RU/EN + multilingual                 | -                                                              |
| **Overall PII**                   | **53,000** (40k PII / 12k benign)            | 53k                                         | 11 labels: EMAIL, PHONE, PERSON, IP, IBAN, BANK_CARD, PASSPORT, GOV_ID, DOB, ADDRESS, SOCIAL                                                                                                            | RU/EN + FR/DE/ES                     | -                                                              |
| **Additional**                    | -                                            | 175k gravitee, 100k Nemotron, 5.6k prodnull | PII/Injection                                                                                                                                                                                           | EN                                   | -                                                              |

---

### Functional Criteria

| Criteria                                             | Target | **Guard FP32 (250MB)**     | **Guard INT8 (2.79MB)**   | **PII (3.67MB)**                                                   |
|------------------------------------------------------|--------|----------------------------|---------------------------|--------------------------------------------------------------------|
| LLM01 direct + indirect recall                       | ≥90%   | **98%** (0.98 F1)          | **98%** (same data, int8) | -                                                                  |
| Jailbreak recall                                     | ≥85%   | **100%**                   | **100%**                  | -                                                                  |
| Policy Puppetry / Hidden / Goal Hijack / Obfuscation | -      | **100%**                   | **100%**                  | -                                                                  |
| PII F1 RU/EN 11 types                                | ≥0.85  | -                          | -                         | **0.86 micro** (86% micro, 0.76 macro), hybrid with regex **0.95** |
| PII PHONE/PERSON/EMAIL/DOB                           | -      | -                          | -                         | 0.86/0.82/0.99/0.94 F1                                             |
| FPR benign 30 + 120 extended RU/EN                   | <2%    | **0%** (thr 0.60)          | **0%**                    | 0% (regex)                                                         |
| Confidence                                           | yes    | `risk 0-1 + label + stage` | same                      | `score 0-1 + type`                                                 |

---

### Performance - Weak CPU (x86_64, single-thread, Intel N100-class) and Browser WASM

| Scenario                         | Target | **Guard FP32 (Node, 250MB, weak CPU)**      | **Guard INT8 (Browser WASM, 2.79MB)** | **PII (Node 3.67MB)**                      | **PII (Browser WASM 3.67MB)** |
|----------------------------------|--------|---------------------------------------------|---------------------------------------|--------------------------------------------|-------------------------------|
| Input p95                        | <10ms  | **5.2ms** (94123 train, 80k vocab, p95 7ms) | **8.1ms** (WASM, 1 thread, quantized) | -                                          | -                             |
| Input p95 (TS lib, without ONNX) | -      | **0.006ms** (18-features, 0 alloc)          | same                                  | -                                          | -                             |
| Input with ONNX (TS)             | -      | **2.1ms** (Node, string tensor)             | **4.3ms** (Browser WASM)              | -                                          | -                             |
| Output p95                       | <15ms  | **6.8ms**                                   | **9.2ms**                             | -                                          | -                             |
| PII p50                          | <200ms | -                                           | -                                     | **1.2ms** (regex) / **2.4ms** (regex+ONNX) | **3.1ms** (WASM, 30k)         |
| PII p95                          | <500ms | -                                           | -                                     | **28ms**                                   | **42ms**                      |
| RAM (all models)                 | <500MB | **~180MB** (250MB mmap)                     | **~60MB** (2.79MB + 3.67MB WASM)      | **~40MB**                                  | **~50MB**                     |
| Cold start                       | <5s    | **1.7s** (250MB)                            | **0.4s** (2.79MB)                     | **0.3s** (3.67MB)                          | **0.6s** (WASM compile)       |
| Disk space                       | <500MB | **250MB + 2.8MB + 3.7MB = 257MB**           | same                                  | -                                          | -                             |
| Go CheckInput                    | -      | **54µs** (Go, 18-features)                  | **72µs** (with ONNX stub)             | **48µs** (regex)                           | **61µs** (hybrid)             |

*Run benchmark: `pytest tests/test_performance.py` (200x), `npm run bench` (1000x, performance.now), `go test -bench=.` (N100 via Docker `--cpus=1`, `GOMAXPROCS=1`), Browser: Chrome 126 WASM, 1 thread, 2.8MB download.*

