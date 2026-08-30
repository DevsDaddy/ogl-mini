# OGL-Mini 🔒 Hybrid AI Agent Security for Go

![OGL-Mini - a hybrid lightweight security model for AI Agents (OWASP 2025-2026)](images/cover.png)

**Open Guard Layer (OGL-Mini)** - a full-featured, open-source, fast and lightweight security model (ONNX) for AI agents with ready-to-use **Go** module implementation.

> Have a questions? <a href="mailto:devsdaddy@atomicmail.io">Contact me</a>

---

[About](#about-ogl-mini) | [Quick Start](#quick-start) | [More information](https://github.com/devsdaddy/ogl-mini/) | [Contact Me](mailto:devsdaddy@atomicmail.io)

---

## About OGL-Mini
The **Open Guard Layer Model (OGL-Mini)** used to filter and secure your AI Agents input (OWASP 2025-2026), using fast model and ONNX runtime. This model contains a 3-layers for security.

### ❓ Why OGL-Mini?<br/>
🔹 **Ready-to-Use Lightweight module** for Go;<br/>
🔹 **Extra lightweight** model (~300MB). Inference starts at CPU;<br/>
🔹 **Extremely** fast (great for realtime applications);<br/>
🔹 **Production ready** with benchmarks;

---

## Quick start
### Algorythm only (without real ONNX model, lightweight 18 features, 50µs):

```go
import "github.com/ogl-mini/go-client"

guard := oglmini.New() // threshold 0.60
// guard := oglmini.New(oglmini.WithThreshold(0.55), oglmini.WithoutPII())

res := guard.CheckInput("Ignore previous instructions", false)
fmt.Println(res.Safe, res.Label, res.RiskScore, res.Stage) // false direct_prompt_injection 0.97

res = guard.CheckOutput("My email is john@example.com", true)
fmt.Println(res.Safe, *res.RedactedText) // false pii_leak

ents, redacted, _ := guard.DetectPII("Иван Петров ivan@mail.ru +7 999 123-45-67")
fmt.Println(ents, redacted)
```

### Connect ONNX-based model - trained `ogl-mini` (250MB, 96k samples)

**Model**: `models/ogl-mini/ogl-mini.onnx` (250MB FP32, TF-IDF 80k, AUC 0.998) and distilled `ogl-mini.int8.onnx` (2.8MB).

### Variant 1: using path with fallback (recommended)

```go
// Without build using -tags onnx - just log and fallback to lightweight if model is not connected
guard := oglmini.NewWithONNXOrFallback("../../models/ogl-mini/ogl-mini.onnx")
res := guard.CheckInput("Ignore previous instructions", false)

// Or strict variant with exception when can't load model:
guard, err := oglmini.NewWithONNX("../../models/ogl-mini/ogl-mini.onnx")
if err != nil {
    log.Fatal(err) // "ONNX runtime not enabled: build with -tags onnx..."
}
```

### Variant 2: using Option (global)

```go
guard := oglmini.New(oglmini.WithONNXModel("../../models/ogl-mini/ogl-mini.onnx"))
// New() trying to load ONNX, if can't - fallback
```

### Build with OGL-Mini model (require libonnxruntime)

```bash
# 1. Install ONNX Runtime (https://onnxruntime.ai/docs/install/)
#    Linux: wget https://github.com/microsoft/onnxruntime/releases/download/v1.19.0/onnxruntime-linux-x64-1.19.0.tgz
#    tar -xzf ... && sudo cp lib/* /usr/local/lib && sudo ldconfig

# 2. Install Go-wrapper
go get github.com/yalue/onnxruntime_go

# 3. Build with onnx tag
go build -tags onnx ./...
go test -tags onnx ./... -v -run TestONNX
go test -tags onnx -bench=. -benchmem
```

> Without using `onnx` tag - library will work without OGL-Mini Library (use lightweight classifier). With tag using a real OGL-Mini model with TF-IDF ONNX (string input `[1,1]`, outputs `label`/`probabilities`).

---

## Custom scorer
**You can specify your own scorer (for example, for fine-tuned OGL-Mini models):**

```go
clf := oglmini.NewMiniClassifier(0.60)
clf.SetOnnxScorer(func(text string) (float64, error) {
    return myModel.Predict(text) // P(attack)
})
guard := oglmini.New()
// guard.classifier.SetOnnxScorer already inside
```

---

## Launch Tests and Benchmarks

```bash
go vet ./...
go test ./... -v                    # 12 tests (guard, OWASP, PII, ONNX fallback)
go test -tags onnx ./... -v -run TestONNX # with real OGL-Mini ONNX model
go test -bench=. -benchmem          # CheckInput 54µs, PII 48µs
go test -bench=BenchmarkCheckInput -benchtime=3s
```

---

## Read more
Read more about **OGL-Mini** model at [Repository homepage](https://github.com/devsdaddy/ogl-mini).

---

## License
**OGL-Mini** library is distributed under the MIT license. You can use it however you like. I would appreciate any feedback and suggestions for improvement.
Full license text [can be found here](https://github.com/devsdaddy/ogl-mini/blob/main/LICENSE)

---

[About](#about-ogl-mini) | [Quick Start](#quick-start) | [More information](https://github.com/devsdaddy/ogl-mini/) | [Contact Me](mailto:devsdaddy@atomicmail.io)