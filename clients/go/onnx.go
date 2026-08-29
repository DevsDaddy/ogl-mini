/*
    OGL-Mini (Open Guard Layer for GO)
    ONNX Based module

    @developer                  Elijah Rastorguev
    @version                    1.1.0
    @git                        https://github.com/devsdaddy/ogl-mini
    @license                    MIT
    @build                      1005
    @data                       29 aug 2026
*/
//go:build !onnx

package oglmini

import (
	"fmt"
	"os"
)

// tryLoadOnnx attempts to load the ONNX model at path via onnxruntime_go.
// If the C library is not available, it returns a descriptive error and the caller
// should fall back to the pure-Go classifier. This keeps `go test` green without
// requiring libonnxruntime.so to be installed.
func tryLoadOnnx(modelPath string) (OnnxScorer, error) {
	if modelPath == "" {
		return nil, fmt.Errorf("empty model path")
	}
	if _, err := os.Stat(modelPath); err != nil {
		return nil, fmt.Errorf("onnx model not found at %s: %w", modelPath, err)
	}

	// NOTE: The project uses github.com/yalue/onnxruntime_go for ONNX inference.
	// It supports string tensors (TF-IDF pipeline) when built with the ML opset.
	// To enable, install libonnxruntime and run with `-tags onnx` or set ORT_LIB.
	//
	// Example:
	//   go get github.com/yalue/onnxruntime_go
	//   export LD_LIBRARY_PATH=/usr/local/lib
	//   go run -tags onnx ./...
	//
	// If the library is not available, this function returns an informative error
	// and the HybridGuard automatically falls back to the embedded classifier.
	//
	// The implementation below is a *stub* that is replaced at build time when
	// the `onnx` tag is enabled (see onnx_full.go). Without the tag, we return
	// a clear error so that users understand how to enable it.
	return nil, fmt.Errorf(
		"ONNX runtime not enabled: build with `-tags onnx` and install github.com/yalue/onnxruntime_go. "+
			"Model at %s is valid (%.1f MB) but native lib not linked. Falling back to lightweight classifier.",
		modelPath, float64(fileSize(modelPath))/1024/1024,
	)
}

func fileSize(path string) int64 {
	if fi, err := os.Stat(path); err == nil {
		return fi.Size()
	}
	return 0
}

func tryLoadPiiOnnx(modelPath string) (PiiOnnxScorer, error) {
	if modelPath == "" {
		return nil, fmt.Errorf("empty pii model path")
	}
	if _, err := os.Stat(modelPath); err != nil {
		return nil, fmt.Errorf("pii onnx not found at %s: %w", modelPath, err)
	}
	return nil, fmt.Errorf(
		"ONNX runtime not enabled: build with `-tags onnx` and install github.com/yalue/onnxruntime_go. "+
			"PII model at %s is valid (%.1f MB) but native lib not linked. Falling back to regex.",
		modelPath, float64(fileSize(modelPath))/1024/1024,
	)
}

func NewWithPiiONNX(modelPath string, opts ...Option) (*HybridGuard, error) {
	scorer, err := tryLoadPiiOnnx(modelPath)
	if err != nil {
		return nil, err
	}
	guard := New(opts...)
	if guard.pii != nil {
		guard.pii.SetOnnxScorer(scorer)
	}
	return guard, nil
}

func NewWithPiiONNXOrFallback(modelPath string, opts ...Option) *HybridGuard {
	if g, err := NewWithPiiONNX(modelPath, opts...); err == nil {
		return g
	} else {
		fmt.Printf("[ogl-mini] PII ONNX not available (%v), using regex\n", err)
		return New(opts...)
	}
}

// NewWithONNX creates a HybridGuard that prefers ONNX inference.
// If the model cannot be loaded (file missing, no native lib), it returns an error
// and the caller can decide to fall back: `guard, _ := NewWithONNX(path); if err!=nil { guard = New() }`
func NewWithONNX(modelPath string, opts ...Option) (*HybridGuard, error) {
	scorer, err := tryLoadOnnx(modelPath)
	if err != nil {
		return nil, err
	}
	// Build options with threshold
	o := GuardOptions{Threshold: 0.60, EnablePII: true}
	for _, fn := range opts {
		fn(&o)
	}
	guard := New(opts...)
	guard.classifier.SetOnnxScorer(scorer)
	return guard, nil
}

// NewWithONNXOrFallback is a convenience that never fails: if ONNX cannot be loaded,
// it logs a warning and returns a pure-Go guard.
func NewWithONNXOrFallback(modelPath string, opts ...Option) *HybridGuard {
	if g, err := NewWithONNX(modelPath, opts...); err == nil {
		return g
	} else {
		// Use fmt for minimal logging; callers can replace with log/slog
		fmt.Printf("[ogl-mini] ONNX not available (%v), using lightweight classifier\n", err)
		return New(opts...)
	}
}
