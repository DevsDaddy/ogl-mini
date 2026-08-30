/*
    OGL-Mini (Open Guard Layer for GO)
    General module types

    @developer                  Elijah Rastorguev
    @version                    1.1.0
    @git                        https://github.com/devsdaddy/ogl-mini
    @license                    MIT
    @build                      1005
    @data                       29 aug 2026
*/
// Package oglmini provides a standalone Hybrid Guard for AI agents.
// All three stages are embedded: heuristics → MiniClassifier → PII.
// No HTTP, no external model file, CPU-only, <500KB binary.
package oglmini

// HeuristicHit is a single rule match from Stage 1.
type HeuristicHit struct {
	ID       string  `json:"id"`                // e.g. "direct_injection"
	Label    string  `json:"label"`             // e.g. "direct_prompt_injection"
	Score    float64 `json:"score"`             // 0..1
	Evidence string  `json:"evidence"`          // truncated excerpt
	Start    int     `json:"start,omitempty"`
	End      int     `json:"end,omitempty"`
}

// PIIEntity is a detected personal data span.
type PIIEntity struct {
	Type  string  `json:"type"`  // EMAIL, PHONE, PERSON, ...
	Value string  `json:"value"`
	Start int     `json:"start"`
	End   int     `json:"end"`
	Score float64 `json:"score"` // confidence 0..1
}

// GuardResult is the unified output of Input/Output Guard.
type GuardResult struct {
	Safe           bool           `json:"safe"`
	RiskScore      float64        `json:"risk_score"` // 0..1
	Label          string         `json:"label"`      // benign | jailbreak | ...
	Stage          string         `json:"stage"`      // heuristic | ml | output_guard
	LatencyMs      float64        `json:"latency_ms"`
	HeuristicHits  []HeuristicHit `json:"heuristic_hits"`
	PIIEntities    []PIIEntity    `json:"pii_entities"`
	RedactedText   *string        `json:"redacted_text,omitempty"`
}

// GuardOptions configures HybridGuard. Use functional options.
type GuardOptions struct {
	Threshold float64 // risk threshold, default 0.60
	EnablePII bool    // default true
}

// OnnxScorer returns P(attack) for a text. Used to plug a real ONNX model.
type OnnxScorer func(text string) (float64, error)

// Option is a functional option for New.
type Option func(*GuardOptions)

func WithThreshold(t float64) Option { return func(o *GuardOptions) { o.Threshold = t } }
func WithoutPII() Option             { return func(o *GuardOptions) { o.EnablePII = false } }

// WithONNXModel tries to load the 250MB guard ONNX (TF-IDF 80k). Falls back silently.
func WithONNXModel(path string) Option {
	return func(o *GuardOptions) { onnxModelPath = path }
}

// WithPiiONNXModel tries to load the 2MB PII NER ONNX (TF-IDF 20k, 11 labels). Falls back to regex.
func WithPiiONNXModel(path string) Option {
	return func(o *GuardOptions) { piiOnnxPath = path }
}

var onnxModelPath string // set via WithONNXModel
var piiOnnxPath string   // set via WithPiiONNXModel

// PiiOnnxScorer is defined in pii.go (re-exported here for convenience)
// type PiiOnnxScorer func(text string) (map[string]float64, error)
