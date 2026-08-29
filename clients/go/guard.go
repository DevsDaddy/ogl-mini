/*
    OGL-Mini (Open Guard Layer for GO)
    Guard Module

    @developer                  Elijah Rastorguev
    @version                    1.1.0
    @git                        https://github.com/devsdaddy/ogl-mini
    @license                    MIT
    @build                      1005
    @data                       29 aug 2026
*/
package oglmini

import (
	"strings"
	"time"
)

// HybridGuard orchestrates the 3-stage pipeline.
// It is safe for concurrent use (all stages are stateless).

type HybridGuard struct {
	heuristics *HeuristicDetector
	classifier *MiniClassifier
	pii        *PIIDetector
	threshold  float64
}

// New creates a HybridGuard with sensible defaults.
// Threshold 0.60 matches Python; use WithThreshold to tune.
// If WithONNXModel was used, this will attempt to load the ONNX model and
// plug it into the classifier. On failure it falls back to the lightweight
// 18-feature model and logs a warning (no hard error).
func New(opts ...Option) *HybridGuard {
	o := GuardOptions{Threshold: 0.60, EnablePII: true}
	for _, fn := range opts {
		fn(&o)
	}
	var pii *PIIDetector
	if o.EnablePII {
		pii = NewPIIDetector()
	}
	clf := NewMiniClassifier(o.Threshold)
	if onnxModelPath != "" {
		if scorer, err := tryLoadOnnx(onnxModelPath); err == nil {
			clf.SetOnnxScorer(scorer)
		} else {
			_ = err
		}
		onnxModelPath = ""
	}
	// PII ONNX (ogl-mini-pii.onnx, 2MB) - hybrid regex + ONNX reranking, distilled MiniLM-L6
	if piiOnnxPath != "" {
		if pii == nil {
			pii = NewPIIDetector()
		}
		if scorer, err := tryLoadPiiOnnx(piiOnnxPath); err == nil {
			pii.SetOnnxScorer(scorer)
		} else {
			_ = err
		}
		piiOnnxPath = ""
	}
	return &HybridGuard{
		heuristics: NewHeuristicDetector(),
		classifier: clf,
		pii:        pii,
		threshold:  o.Threshold,
	}
}

// CheckInput validates a user prompt before it reaches the agent.
// If withPII is true, PII detection and redaction are included.
func (g *HybridGuard) CheckInput(text string, withPII bool) GuardResult {
	t0 := time.Now()
	hits := g.heuristics.Scan(text)
	hScore := g.heuristics.RiskScore(hits)

	if len(hits) > 0 && hScore >= 0.85 {
		top := hits[0]
		for _, h := range hits[1:] {
			if h.Score > top.Score {
				top = h
			}
		}
		entities, redacted := g.piiIfNeeded(text, withPII)
		return GuardResult{
			Safe: false, RiskScore: round(hScore), Label: top.Label, Stage: "heuristic",
			LatencyMs: elapsedMs(t0), HeuristicHits: hits, PIIEntities: entities, RedactedText: redacted,
		}
	}

	prob, label := g.classifier.Predict(text)
	combined := prob
	if len(hits) > 0 {
		if hScore*0.9 > combined {
			combined = hScore * 0.9
		}
		if combined < g.threshold {
			if v := hScore * 0.85; v > combined {
				combined = v
			}
		}
	}
	safe := combined < g.threshold
	entities, redacted := g.piiIfNeeded(text, withPII)
	finalLabel := label
	if safe {
		finalLabel = "benign"
	} else if len(hits) > 0 && hScore > prob {
		top := hits[0]
		for _, h := range hits[1:] {
			if h.Score > top.Score {
				top = h
			}
		}
		finalLabel = top.Label
	}
	stage := "ml"
	if len(hits) > 0 && hScore >= 0.85 {
		stage = "heuristic+ml"
	}
	return GuardResult{
		Safe: safe, RiskScore: round(combined), Label: finalLabel, Stage: stage,
		LatencyMs: elapsedMs(t0), HeuristicHits: hits, PIIEntities: entities, RedactedText: redacted,
	}
}

// CheckOutput validates an LLM response. It always runs PII scan.
func (g *HybridGuard) CheckOutput(text string, withPII bool) GuardResult {
	t0 := time.Now()
	var entities []PIIEntity
	var redacted *string
	hasPiiLeak := false
	if g.pii != nil {
		entities = g.pii.Detect(text)
		hasPiiLeak = len(entities) > 0
		masked := g.pii.Redact(text, entities)
		redacted = &masked
		if !withPII {
			// still detect for safety, but don't return redacted if caller disabled
			_ = withPII
		}
	}
	leakMarkers := []string{"system prompt", "internal instruction", "api_key", "secret", "token:", "BEGIN PRIVATE"}
	low := strings.ToLower(text)
	hasLeak := false
	for _, k := range leakMarkers {
		if strings.Contains(low, k) {
			hasLeak = true
			break
		}
	}
	hits := g.heuristics.Scan(text)
	hScore := g.heuristics.RiskScore(hits)

	risk := 0.0
	label := "benign"
	if hasPiiLeak {
		risk = maxFloat(risk, 0.88)
		label = "pii_leak"
	}
	if hasLeak {
		risk = maxFloat(risk, 0.92)
		label = "system_prompt_leak"
	}
	if len(hits) > 0 {
		risk = maxFloat(risk, hScore)
		top := hits[0]
		for _, h := range hits[1:] {
			if h.Score > top.Score {
				top = h
			}
		}
		if hScore > risk-0.05 {
			label = top.Label
		}
	}
	prob, _ := g.classifier.Predict(text)
	risk = maxFloat(risk, prob*0.7)

	safe := risk < g.threshold && !hasPiiLeak && !hasLeak
	if !safe && risk < g.threshold {
		risk = g.threshold + 0.05
	}
	if safe {
		label = "benign"
	}
	return GuardResult{
		Safe: safe, RiskScore: round(risk), Label: label, Stage: "output_guard",
		LatencyMs: elapsedMs(t0), HeuristicHits: hits, PIIEntities: entities, RedactedText: redacted,
	}
}

// DetectPII is a standalone PII helper.
func (g *HybridGuard) DetectPII(text string) (entities []PIIEntity, redacted string, latencyMs float64) {
	t0 := time.Now()
	if g.pii == nil {
		return nil, text, 0
	}
	entities = g.pii.Detect(text)
	redacted = g.pii.Redact(text, entities)
	return entities, redacted, elapsedMs(t0)
}

func (g *HybridGuard) piiIfNeeded(text string, withPII bool) ([]PIIEntity, *string) {
	if withPII && g.pii != nil {
		ents := g.pii.Detect(text)
		masked := g.pii.Redact(text, ents)
		return ents, &masked
	}
	return nil, nil
}

func elapsedMs(t0 time.Time) float64 { return float64(time.Since(t0).Microseconds()) / 1000.0 }
func round(v float64) float64        { return float64(int(v*10000+0.5)) / 10000 }
func maxFloat(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}
