# Open Guard Layer (OGL-Mini) 🔒 Hybrid AI Agent Security for Typescript

![OGL-Mini - a hybrid lightweight security model for AI Agents (OWASP 2025-2026)](images/cover.png)

**Open Guard Layer (OGL-Mini)** - a full-featured, open-source, fast and lightweight security model (ONNX) for AI agents with ready-to-use **TypeScript** implementation. Works in **Node 18+** and **browsers** (WASM).

> Have a questions? <a href="mailto:devsdaddy@atomicmail.io">Contact me</a>

![OGL-Mini Hybrid Security Model for Typescript on NPM](https://badge.fury.io/js/hybrid-ai-guard.svg) ![OGL-Mini Hybrid Security Model for Typescript - MIT opensource](https://img.shields.io/badge/License-MIT-yellow.svg)

---

[About](#about) | [Installation](#install) | [Get Started](#get-started) | [More Information](https://github.com/devsdaddy/ogl-mini) | [Contacts](mailto:devsdaddy@atomicmail.io)

---

## About
The **OGL-Mini (Hybrid AI Guard)** a full-featured solution with 3 layers of scanning and sanitizing AI agent inputs. It can be helpful to detect modern AI agents attacks (OWASP LLM Top 10 2025-2026 + Agentic Top 10).

### ❓ Why OGL-Mini?<br/>
🔹 **Ready-to-Use Lightweight module** for TypeScript;<br/>
🔹 **Extra lightweight** AI input security model (~300MB, ONNX runtime). Inference starts at CPU;<br/>
🔹 **Support both platforms**: NodeJS and Modern Browsers;<br/>
🔹 **Extremely** fast (great for realtime ai agents and applications);<br/>
🔹 **OWASP LLM Top 10 2025-2026 + Agentic Top 10** security detector;<br/>
🔹 **Production ready** with benchmarks;

### 🔒 What kind of attacks does it protect against?
- **General Attacks:** LLM01 Prompt Injection + LLM02 Sensitive Disclosure, LLM03 Supply Chain, LLM04 Data Poisoning, LLM05 Improper Output, LLM06 Excessive Agency, LLM07 Misinformation, LLM08 Hidden Context, LLM09 Vector Weakness, LLM10 Unbounded Consumption + Agentic (Goal Hijack, Privilege Abuse, Code Exec, InterAgent, Tool Misuse, Memory Poisoning, Cascading, Rogue, Policy Puppetry, EchoLeak, Lies-in-the-Loop)
- **Modern Injections:** S3 encoding (base64), homoglyph, zero-width (`\u200b`), spaced letters, control tokens (`<|im_start|>`, `[INST]`), indirect JSON/tool, HTML markdown, agent-specific, best-of-n, typoglycemia - all in training (14k modern obfuscation, bilingual)
- **Auto-sanitizing:** Sanitize fields by length, bidi-characters, control characters, excessive whitespaces etc.

> Read more about model at [Repository homepage](https://github.com/devsdaddy/ogl-mini)

---


## Install
You can install **Hybrid AI Guard (OGL-Mini)** using NPM or directly from GitHub.

**From NPM:**
```bash
npm install hybrid-ai-guard
npm install onnxruntime-web onnxruntime-node  # Need to support ONNX Models
```

> **Note:** the NPM package doesn't include a model weights. Please, download models from [GitHub](https://github.com/devsdaddy/ogl-mini) or [Huggingface](https://huggingface.co/devsdaddy/ogl-mini/tree/main)

**From GitHub**
```bash
git clone https://github.com/devsdaddy/ogl-mini/
cd ./ogl-mini/clients/typescript/
npm install && npm install onnxruntime-web onnxruntime-node
```

Now you can use **OGL-Mini** in your projects.

---

## Get started
## Quick start without OGL-Mini Model (lightweight 18-feature classifier, 0.01ms)
You can use only ``HybridGuard`` with heuristics checks and input sanitizing. This approach doesn't require to connect our onnx-based model, but it's not a full-featured scanner without inference.

**Simple example without model loading:**
```ts
import { HybridGuard } from "hybrid-ai-guard";

// Create our guard
const guard = new HybridGuard(); // threshold 0.60
const r = await guard.checkInput("Ignore previous instructions");
console.log(r.safe, r.label, r.riskScore, r.stage); // false direct_prompt_injection 0.97

// sync fast path (no async ONNX)
const r2 = guard.checkInputSync("Привет как дела");
console.log(r2.safe); // true

// PII
const { entities, redacted } = guard.detectPii("Иван Петров ivan@mail.ru +7 999 123-45-67");
console.log(entities, redacted);

// output guard
const out = await guard.checkOutput("My email is john@example.com");
console.log(out.safe, out.redactedText);
```

## Using ready OGL-Mini Model
The model was trained at >96k samples to scan attacks inside your prompts (shieldlm 54k + agentic 22k + PII 15k, OWASP 2025-2026).

> **Note:** the NPM package doesn't include a model weights. Please, download models from [GitHub](https://github.com/devsdaddy/ogl-mini) or [Huggingface](https://huggingface.co/devsdaddy/ogl-mini/tree/main)

### Using at Node.js runtime
> Requires `onnxruntime-node` package

```ts
import { HybridGuard } from "hybrid-ai-guard";

// Variant 1: use fabric to load model (recommended - load OGL-Mini model async, with fallback without ONNX-based model)
const guard = await HybridGuard.create({ modelPath: "../../models/ogl-mini/ogl-mini.onnx" });

// Variant 2: setup OGL-Mini model into scorer manually
import { createOnnxScorer } from "@ogl-mini/guard";
const scorer = await createOnnxScorer("../../models/ogl-mini/ogl-mini.onnx"); // FS path
const guard2 = new HybridGuard();
guard2.getClassifier().setOnnxScorer(scorer);

await guard.checkInput("Ignore previous instructions");
```

### Browser (2.8MB INT8, WASM)
> Requires `onnxruntime-web` package. For browser use quant `ogl-mini.int8.onnx` model (2.8MB), to avoid 250MB downloading.

```ts
// public/models/ogl-mini.int8.onnx - put file into public and use it as static content
const guard = await HybridGuard.create({ modelUrl: "/models/ogl-mini.int8.onnx" });
// or
import { createOnnxScorer } from "hybrid-ai-guard";
const scorer = await createOnnxScorer("/models/ogl-mini.int8.onnx"); // URL
```

If **OGL-Mini model doesn't loaded**, guard **automatically** switch to lightweight-classifier.

---
## PII and Custom models

### Using PII detector from OGL-Mini `ogl-mini-pii.onnx`
You can also use our PII detection model (`ogl-mini-pii.onnx`) in TypeScript. The module will use hybrid: **regex for span + ONNX Model for reranking confidence** (11 types: EMAIL, PHONE, PERSON, IP, IBAN, BANK_CARD, PASSPORT, GOV_ID, DOB, ADDRESS, SOCIAL).

**Basic Usage:**
```ts
// Node (2MB FP32)
import { HybridGuard } from "hybrid-ai-guard";
const guard = await HybridGuard.create({
  modelPath: "../../models/ogl-mini/ogl-mini.onnx",             // guard 250MB
  piiModelPath: "../../models/ogl-mini/ogl-mini-pii.onnx",      // PII 2MB
});

//  Or in Browser (2MB INT8)
const guardBrowser = await HybridGuard.create({
  modelUrl: "/models/ogl-mini.int8.onnx",
  piiModelUrl: "/models/ogl-mini-pii.int8.onnx",
});

// Manual initialization
import { createPiiOnnxScorer } from "hybrid-ai-guard";
const piiScorer = await createPiiOnnxScorer("../../models/ogl-mini/ogl-mini-pii.onnx");
new HybridGuard().getPii()!.setOnnxScorer(piiScorer);
// or
const pii = new PIIDetector();
pii.setOnnxScorer(await createPiiOnnxScorer("./ogl-mini-pii.onnx"));
await pii.detectAsync("Иван Петров ivan@mail.ru +7 999 123-45-67"); // reranked scores
```

If **PII model not loaded**, used only regex functions (0.5ms)

### Connect custom scorer
You can use custom scorer (ONNX based), for example for fine-tuned OGL-Mini models:

```ts
import { MiniClassifier } from "hybrid-ai-guard";
const clf = new MiniClassifier({ threshold: 0.55 });
clf.setOnnxScorer(async (text) => myCustomModel.predict(text)); // () => P(attack)
const guard = new HybridGuard({ classifier: clf });
```

---

## API
### Basic API
- `new HybridGuard(opts?)` - create instance without model loading
- `HybridGuard.create(opts)` - create instance, with model loading
- `guard.checkInput(text, withPii?)` / `checkInputSync(text)` / `checkOutput(text)` / `detectPii(text)` - use it for security scanning
- `guard.getClassifier().setOnnxScorer(fn)` / `guard.getHeuristics()` / `guard.getPii()` - use it to get current modules

### Pacakge Scripts

```bash
npm install
npm run build        # tsc → dist/
npm test             # vitest, 30 tests (guard, pii, performance, onnx)
npm run bench        # p50/p95 (heuristic 0.001ms, guard 0.01ms)
```

### By-Stage project structure
- `src/heuristics.ts` - Stage 1. Security scanning using Heuristics modules.
- `src/classifier.ts` - Stage 2. Use real ML model to scan inputs.
- `src/pii.ts` - Stage 3. Detect PII data.
- `src/onnx.ts` - Used to load OGL-Mini models (ONNX based) into browser / NodeJS environment.
- `src/guard.ts` - General class

---

## License
**OGL-Mini** library is distributed under the MIT license. You can use it however you like. I would appreciate any feedback and suggestions for improvement.
Full license text [can be found here](https://github.com/devsdaddy/ogl-mini/blob/main/LICENSE)

---

[About](#about) | [Installation](#install) | [Get Started](#get-started) | [More Information](https://github.com/devsdaddy/ogl-mini) | [Contacts](mailto:devsdaddy@atomicmail.io)