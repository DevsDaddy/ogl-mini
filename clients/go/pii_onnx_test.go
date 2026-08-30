/*
    OGL-Mini (Open Guard Layer for GO)
    ONNX Model Based PII Checker

    @developer                  Elijah Rastorguev
    @version                    1.1.0
    @git                        https://github.com/devsdaddy/ogl-mini
    @license                    MIT
    @build                      1005
    @data                       29 aug 2026
*/
package oglmini

import (
	"os"
	"testing"
)

func TestPIIOnnxReranking(t *testing.T) {
	model := "../../models/ogl-mini/ogl-mini-pii.onnx"
	if _, err := os.Stat(model); err != nil {
		model = "../../models/ogl-mini/ogl-mini-pii.int8.onnx"
		if _, err2 := os.Stat(model); err2 != nil {
			t.Skip("PII ONNX model not found, skipping")
		}
	}
	// Try to create scorer - without -tags onnx it will fail and fallback
	scorer, err := tryLoadPiiOnnx(model)
	if err != nil {
		t.Logf("PII ONNX not enabled (expected without -tags onnx): %v", err)
		// Fallback should still work
		pii := NewPIIDetector()
		ents := pii.Detect("Иван Петров ivan@mail.ru +7 999 123-45-67")
		if len(ents) < 3 {
			t.Fatalf("fallback PII should find >=3, got %d", len(ents))
		}
		return
	}
	// With ONNX (requires -tags onnx + lib)
	pii := NewPIIDetector()
	pii.SetOnnxScorer(scorer)
	ents := pii.Detect("Иван Петров ivan@mail.ru +7 999 123-45-67 ул. Тверская, д. 10")
	types := map[string]bool{}
	for _, e := range ents {
		types[e.Type] = true
	}
	if !types["PERSON"] || !types["EMAIL"] {
		t.Fatalf("PII ONNX hybrid should find PERSON and EMAIL, got %v", types)
	}
	for _, e := range ents {
		if e.Score < 0.35 || e.Score > 0.99 {
			t.Fatalf("score out of range %.2f", e.Score)
		}
	}
}

func TestHybridGuardWithPiiOnnx(t *testing.T) {
	model := "../../models/ogl-mini/ogl-mini-pii.onnx"
	if _, err := os.Stat(model); err != nil {
		t.Skip("model not found")
	}
	guard := New(WithPiiONNXModel(model))
	// Even without native lib, guard should fallback and still detect PII
	res := guard.CheckOutput("Contact john@example.com phone +7 999 123-45-67", true)
	if len(res.PIIEntities) == 0 {
		t.Fatal("should detect PII")
	}
	if res.RedactedText != nil && contains(*res.RedactedText, "john@example.com") {
		t.Fatal("should redact")
	}
}
