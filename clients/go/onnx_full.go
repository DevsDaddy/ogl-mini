/*
    OGL-Mini (Open Guard Layer for GO)
    ONNX Based Full Module

    @developer                  Elijah Rastorguev
    @version                    1.1.0
    @git                        https://github.com/devsdaddy/ogl-mini
    @license                    MIT
    @build                      1005
    @data                       29 aug 2026
*/
//go:build onnx

package oglmini

import (
	"fmt"
	"os"

	"github.com/yalue/onnxruntime_go"
)

func init() {
	libPath := os.Getenv("ORT_LIB_PATH")
	if libPath == "" {
		libPath = "libonnxruntime.so"
	}
	onnxruntime_go.SetSharedLibraryPath(libPath)
	if err := onnxruntime_go.InitializeEnvironment(); err != nil {
		fmt.Printf("[ogl-mini] onnx init failed: %v\n", err)
	}
}

var piiLabels = []string{"EMAIL", "PHONE", "PERSON", "IP", "IBAN", "BANK_CARD", "PASSPORT", "GOV_ID", "DOB", "ADDRESS", "SOCIAL"}

func tryLoadOnnx(modelPath string) (OnnxScorer, error) {
	if modelPath == "" {
		return nil, fmt.Errorf("empty model path")
	}
	if _, err := os.Stat(modelPath); err != nil {
		return nil, fmt.Errorf("onnx model not found at %s: %w", modelPath, err)
	}
	session, err := onnxruntime_go.NewAdvancedSession(modelPath, []string{"input"}, []string{"label", "probabilities"})
	if err != nil {
		session, err = onnxruntime_go.NewAdvancedSession(modelPath, []string{"input"}, []string{"output_label", "output_probability"})
		if err != nil {
			return nil, fmt.Errorf("onnx session create: %w", err)
		}
	}
	return func(text string) (float64, error) {
		inputTensor, err := onnxruntime_go.NewTensor(onnxruntime_go.NewShape(1, 1), []string{text})
		if err != nil {
			return 0, err
		}
		defer inputTensor.Destroy()
		outputs, err := session.Run([]onnxruntime_go.Value{inputTensor})
		if err != nil {
			return 0, err
		}
		defer func() { for _, o := range outputs { o.Destroy() } }()
		if len(outputs) == 0 {
			return 0, fmt.Errorf("no outputs")
		}
		probTensor := outputs[len(outputs)-1]
		data := probTensor.GetData()
		switch v := data.(type) {
		case []float32:
			if len(v) >= 2 {
				return float64(v[1]), nil
			}
			if len(v) == 1 {
				return float64(v[0]), nil
			}
		case [][]float32:
			if len(v) > 0 && len(v[0]) >= 2 {
				return float64(v[0][1]), nil
			}
		case map[int64]float32:
			if p, ok := v[1]; ok {
				return float64(p), nil
			}
		case map[string]float32:
			if p, ok := v["1"]; ok {
				return float64(p), nil
			}
		}
		return 0, fmt.Errorf("unexpected probability output type %T", data)
	}, nil
}

func tryLoadPiiOnnx(modelPath string) (PiiOnnxScorer, error) {
	if modelPath == "" {
		return nil, fmt.Errorf("empty pii model path")
	}
	if _, err := os.Stat(modelPath); err != nil {
		return nil, fmt.Errorf("pii onnx not found at %s: %w", modelPath, err)
	}
	session, err := onnxruntime_go.NewAdvancedSession(modelPath, []string{"input"}, []string{"label", "probabilities"})
	if err != nil {
		session, err = onnxruntime_go.NewAdvancedSession(modelPath, []string{"input"}, []string{"output_label", "output_probability"})
		if err != nil {
			return nil, fmt.Errorf("pii onnx session: %w", err)
		}
	}
	return func(text string) (map[string]float64, error) {
		inputTensor, err := onnxruntime_go.NewTensor(onnxruntime_go.NewShape(1, 1), []string{text})
		if err != nil {
			return nil, err
		}
		defer inputTensor.Destroy()
		outputs, err := session.Run([]onnxruntime_go.Value{inputTensor})
		if err != nil {
			return nil, err
		}
		defer func() { for _, o := range outputs { o.Destroy() } }()
		if len(outputs) == 0 {
			return nil, fmt.Errorf("no outputs")
		}
		probTensor := outputs[len(outputs)-1]
		data := probTensor.GetData()
		// Expect float[1,11]
		var probs []float32
		switch v := data.(type) {
		case []float32:
			probs = v
		case [][]float32:
			if len(v) > 0 {
				probs = v[0]
			}
		default:
			return nil, fmt.Errorf("unexpected pii prob type %T", data)
		}
		if len(probs) != len(piiLabels) {
			// may be flattened
			if len(probs) < len(piiLabels) {
				return nil, fmt.Errorf("pii probs len %d != %d", len(probs), len(piiLabels))
			}
			probs = probs[:len(piiLabels)]
		}
		m := make(map[string]float64, len(piiLabels))
		for i, lab := range piiLabels {
			m[lab] = float64(probs[i])
		}
		return m, nil
	}, nil
}
