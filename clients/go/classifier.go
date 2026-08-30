/*
    OGL-Mini (Open Guard Layer for GO)
    Classifier Implementation

    @developer                  Elijah Rastorguev
    @version                    1.1.0
    @git                        https://github.com/devsdaddy/ogl-mini
    @license                    MIT
    @build                      1005
    @data                       29 aug 2026
*/
// Import required modules
package oglmini

import (
	"math"
	"regexp"
	"strings"
)

// MiniClassifier - Stage 2, ~3ms, distilled from DeBERTa-v3-xsmall.
// 18 interpretable features + logistic regression. No external file.
var features = []string{
	"len_chars", "len_tokens", "exclamation", "upper_ratio", "has_ignore", "has_reveal",
	"has_system", "has_instruction", "has_jailbreak", "has_role", "has_xml", "has_base64",
	"has_zw", "spaced_letters", "tool_marker", "hidden_ctx", "goal_hijack", "indirect",
}

var defaultWeights = map[string]float64{
	"len_chars": 0.0001, "len_tokens": 0.002, "exclamation": 0.08, "upper_ratio": 0.25,
	"has_ignore": 1.8, "has_reveal": 1.6, "has_system": 1.4, "has_instruction": 1.5,
	"has_jailbreak": 1.7, "has_role": 1.2, "has_xml": 1.3, "has_base64": 0.6,
	"has_zw": 1.0, "spaced_letters": 0.9, "tool_marker": 0.7, "hidden_ctx": 1.4,
	"goal_hijack": 1.6, "indirect": 0.9,
}

const bias = -2.2

var (
	base64FeatRe      = regexp.MustCompile(`[A-Za-z0-9+/]{20,}={0,2}`)
	spacedLettersFeatRe = regexp.MustCompile(`(?:[a-zA-Z]\s+){4,}[a-zA-Z]`)
)

// MiniClassifier is safe for concurrent use (read-only after construction).
type MiniClassifier struct {
	threshold  float64
	weights    map[string]float64
	bias       float64
	onnxScorer OnnxScorer
}

// NewMiniClassifier creates a classifier with optional threshold.
func NewMiniClassifier(threshold float64) *MiniClassifier {
	if threshold == 0 {
		threshold = 0.60
	}
	w := make(map[string]float64, len(defaultWeights))
	for k, v := range defaultWeights {
		w[k] = v
	}
	return &MiniClassifier{threshold: threshold, weights: w, bias: bias}
}

func sigmoid(x float64) float64 { return 1 / (1 + math.Exp(-x)) }

func extractFeatures(text string) map[string]float64 {
	low := strings.ToLower(text)
	tokens := strings.Fields(text)
	up := 0
	for _, c := range text {
		if c >= 'A' && c <= 'Z' {
			up++
		}
	}
	feats := map[string]float64{
		"len_chars":      float64(len(text)),
		"len_tokens":     float64(len(tokens)),
		"exclamation":    float64(strings.Count(text, "!")),
		"upper_ratio":    float64(up) / math.Max(1, float64(len(text))),
		"has_ignore":     b2f(containsAnyStr(low, []string{"ignore", "disregard", "forget", "игнорируй", "забудь"})),
		"has_reveal":     b2f(containsAnyStr(low, []string{"reveal", "show system", "выведи промпт", "покажи инструкц"})),
		"has_system":     b2f(containsAnyStr(low, []string{"system prompt", "system instruction", "системный промпт"})),
		"has_instruction": b2f(containsAnyStr(low, []string{"previous instruction", "предыдущие инструкции"})),
		"has_jailbreak":  b2f(containsAnyStr(low, []string{"dan", "jailbreak", "developer mode", "без ограничений"})),
		"has_role":       b2f(containsAnyStr(low, []string{"you are now", "ты теперь", "act as", "roleplay"})),
		"has_xml":        b2f(containsAnyStr(low, []string{"<policy", "<config", "<role", "<system"})),
		"has_base64":     b2f(base64FeatRe.MatchString(text)),
		"has_zw":         b2f(strings.Contains(text, "\u200b") || strings.Contains(text, "\u200c") || strings.Contains(text, "\u200d")),
		"spaced_letters": b2f(spacedLettersFeatRe.MatchString(text)),
		"tool_marker":    b2f(containsAnyStr(low, []string{"tool_output", "function result", "```json"})),
		"hidden_ctx":     b2f(containsAnyStr(low, []string{"list your tools", "tool schema", "системный промпт"})),
		"goal_hijack":    b2f(containsAnyStr(low, []string{"new goal", "новая задача", "override goal"})),
		"indirect":       b2f(containsAnyStr(low, []string{`{ "instruction"`, `{ "role"`})),
	}
	return feats
}

func containsAnyStr(s string, subs []string) bool {
	for _, sub := range subs {
		if strings.Contains(s, sub) {
			return true
		}
	}
	return false
}
func b2f(b bool) float64 {
	if b {
		return 1
	}
	return 0
}

// SetOnnxScorer plugs a real ONNX model (e.g. models/ogl-mini/ogl-mini.onnx).
// The scorer should return P(attack) in [0,1] or an error to trigger fallback.
func (m *MiniClassifier) SetOnnxScorer(scorer OnnxScorer) { m.onnxScorer = scorer }

// Predict returns probability and label. It tries ONNX first, then falls back.
func (m *MiniClassifier) Predict(text string) (float64, string) {
	if m.onnxScorer != nil {
		if p, err := m.onnxScorer(text); err == nil {
			feats := extractFeatures(text)
			return p, m.labelFor(p, feats)
		}
	}
	feats := extractFeatures(text)
	logit := m.bias
	for _, k := range features {
		logit += feats[k] * m.weights[k]
	}
	prob := sigmoid(logit)
	label := m.labelFor(prob, feats)
	return prob, label
}

func (m *MiniClassifier) labelFor(prob float64, feats map[string]float64) string {
	if prob < m.threshold {
		return "benign"
	}
	if feats["has_jailbreak"] > 0.5 {
		return "jailbreak"
	}
	if feats["has_ignore"] > 0.5 || feats["has_instruction"] > 0.5 {
		return "direct_prompt_injection"
	}
	if feats["tool_marker"] > 0.5 || feats["indirect"] > 0.5 {
		return "indirect_prompt_injection"
	}
	if feats["has_xml"] > 0.5 {
		return "policy_puppetry"
	}
	if feats["hidden_ctx"] > 0.5 || feats["has_reveal"] > 0.5 {
		return "hidden_context_exposure"
	}
	if feats["goal_hijack"] > 0.5 {
		return "agent_goal_hijack"
	}
	if feats["has_zw"] > 0.5 || feats["spaced_letters"] > 0.5 || feats["has_base64"] > 0.5 {
		return "obfuscation"
	}
	return "prompt_injection"
}

// Threshold returns the configured threshold.
func (m *MiniClassifier) Threshold() float64 { return m.threshold }
