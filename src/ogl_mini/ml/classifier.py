"""
Open Guard Layer Mini (OGL-Mini)
Classifier

@developer              Elijah Rastorguev
@version                1.0.0
@build                  1000
@date                   28 august 2026
@git                    https://github.com/devsdaddy/ogl-mini/
"""
import json, re, math
from pathlib import Path

try:
    import onnxruntime as ort
    import numpy as np

    HAS_ONNX = True
except Exception:
    HAS_ONNX = False

FEATURES = [
    "len_chars", "len_tokens", "exclamation", "upper_ratio", "has_ignore", "has_reveal",
    "has_system", "has_instruction", "has_jailbreak", "has_role", "has_xml", "has_base64",
    "has_zw", "spaced_letters", "tool_marker", "hidden_ctx", "goal_hijack", "indirect",
]
KEYWORDS = {
    "has_ignore": ["ignore", "disregard", "forget", "игнорируй", "забудь"],
    "has_reveal": ["reveal", "show system", "выведи промпт", "покажи инструкц"],
    "has_system": ["system prompt", "system instruction", "системный промпт"],
    "has_instruction": ["previous instruction", "предыдущие инструкции"],
    "has_jailbreak": ["dan", "jailbreak", "developer mode", "без ограничений"],
    "has_role": ["you are now", "ты теперь", "act as", "roleplay"],
    "has_xml": ["<policy", "<config", "<role", "<system"],
    "has_base64": ["base64", "decode"],
    "has_zw": ["\u200b", "\u200c"],
    "spaced_letters": [],
    "tool_marker": ["tool_output", "function result", "```json"],
    "hidden_ctx": ["list your tools", "tool schema", "системный промпт"],
    "goal_hijack": ["new goal", "новая задача", "override goal"],
    "indirect": ['{ "instruction"', '{ "role"'],
}
DEFAULT_WEIGHTS = {
    "len_chars": 0.0001, "len_tokens": 0.002, "exclamation": 0.08, "upper_ratio": 0.25,
    "has_ignore": 1.8, "has_reveal": 1.6, "has_system": 1.4, "has_instruction": 1.5,
    "has_jailbreak": 1.7, "has_role": 1.2, "has_xml": 1.3, "has_base64": 0.6,
    "has_zw": 1.0, "spaced_letters": 0.9, "tool_marker": 0.7, "hidden_ctx": 1.4,
    "goal_hijack": 1.6, "indirect": 0.9,
}
BIAS = -2.2


def sigmoid(x: float) -> float:
    return 1 / (1 + math.exp(-x))


def extract_features(text: str) -> dict:
    low = text.lower();
    tokens = text.split();
    up = sum(1 for c in text if c.isupper())
    return {
        "len_chars": len(text), "len_tokens": len(tokens), "exclamation": text.count("!"),
        "upper_ratio": up / max(1, len(text)),
        "has_ignore": float(any(k in low for k in KEYWORDS["has_ignore"])),
        "has_reveal": float(any(k in low for k in KEYWORDS["has_reveal"])),
        "has_system": float(any(k in low for k in KEYWORDS["has_system"])),
        "has_instruction": float(any(k in low for k in KEYWORDS["has_instruction"])),
        "has_jailbreak": float(any(k in low for k in KEYWORDS["has_jailbreak"])),
        "has_role": float(any(k in low for k in KEYWORDS["has_role"])),
        "has_xml": float(any(k in low for k in KEYWORDS["has_xml"])),
        "has_base64": float(bool(re.search(r"[A-Za-z0-9+/]{20,}={0,2}", text))),
        "has_zw": float(any(c in text for c in ["\u200b", "\u200c", "\u200d"])),
        "spaced_letters": float(bool(re.search(r"(?:[a-zA-Z]\s+){4,}[a-zA-Z]", text))),
        "tool_marker": float(any(k in low for k in KEYWORDS["tool_marker"])),
        "hidden_ctx": float(any(k in low for k in KEYWORDS["hidden_ctx"])),
        "goal_hijack": float(any(k in low for k in KEYWORDS["goal_hijack"])),
        "indirect": float(any(k in low for k in KEYWORDS["indirect"])),
    }


def _find_ogl_model(p: Path | None) -> Path | None:
    candidates = []
    if p:
        candidates.append(Path(p))
        candidates.append(Path(p).with_suffix(".onnx"))
    candidates.extend([
        Path("models/ogl-mini/ogl-mini.onnx"),
        Path("models/ogl-mini/ogl-mini.int8.onnx"),
        Path(__file__).parents[3] / "models/ogl-mini/ogl-mini.onnx",
    ])
    for c in candidates:
        if c.exists():
            return c
    return None


class MiniClassifier:
    def __init__(self, model_path: Path | None = None, threshold: float = 0.60):
        self.threshold = threshold;
        self.weights = DEFAULT_WEIGHTS.copy();
        self.bias = BIAS
        self.onnx_session = None;
        self.onnx_is_tfidf = False
        self.sklearn_model = None
        self._load(model_path)

    def _load(self, p: Path | None):
        if p and Path(p).exists() and Path(p).suffix == ".json":
            try:
                data = json.loads(Path(p).read_text())
                self.weights.update(data.get("weights", {}));
                self.bias = data.get("bias", self.bias)
            except Exception:
                pass
        onnx_path = _find_ogl_model(p)
        if HAS_ONNX and onnx_path and onnx_path.exists():
            try:
                self.onnx_session = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
                inp = self.onnx_session.get_inputs()[0]
                self.onnx_is_tfidf = ("string" in str(inp.type).lower() or inp.type == "tensor(string)")
            except Exception as e:
                self.onnx_session = None
        # fallback sklearn pkl (distilled DeBERTa)
        pkl_candidates = [Path("models/ogl-mini/ogl-mini.pkl"),
                          Path(__file__).parents[3] / "models/ogl-mini/ogl-mini.pkl"]
        for cand in pkl_candidates:
            if cand.exists():
                try:
                    import pickle
                    self.sklearn_model = pickle.loads(cand.read_bytes())
                    break
                except Exception:
                    pass

    def _score_linear(self, feats: dict) -> float:
        logit = self.bias + sum(feats[k] * self.weights.get(k, 0) for k in FEATURES)
        return sigmoid(logit)

    def _score_onnx_tfidf(self, text: str) -> float | None:
        if self.onnx_session is None or not self.onnx_is_tfidf:
            return None
        try:
            inp_name = self.onnx_session.get_inputs()[0].name
            arr = np.array([[text]], dtype=object)
            out = self.onnx_session.run(None, {inp_name: arr})
            # out[0]=labels, out[1]=probs
            probs = out[1] if len(out) > 1 else out[0]
            if isinstance(probs, list): probs = np.array(probs)
            if probs.ndim == 2 and probs.shape[1] == 2:
                return float(probs[0][1])
            if probs.ndim == 1: return float(probs[0])
            # dict format
            if isinstance(probs, dict): return float(list(probs.values())[0])
            return float(probs[0][1]) if hasattr(probs[0], '__len__') else float(probs[0])
        except Exception:
            return None

    def _score_sklearn(self, text: str) -> float | None:
        if self.sklearn_model is None:
            return None
        try:
            prob = self.sklearn_model.predict_proba([text])[0][1]
            return float(prob)
        except Exception:
            return None

    def predict(self, text: str) -> tuple[float, str]:
        feats = extract_features(text)
        prob = None
        prob = self._score_sklearn(text)
        if prob is None:
            prob = self._score_onnx_tfidf(text)
        if prob is None and self.onnx_session is not None and not self.onnx_is_tfidf:
            try:
                import numpy as np  # type: ignore
                arr = np.array([[feats[k] for k in FEATURES]], dtype=np.float32)
                out = self.onnx_session.run(None, {"input": arr})[0]
                prob = float(out[0][1] if out.shape[-1] == 2 else out[0][0])
            except Exception:
                prob = None
        if prob is None:
            prob = self._score_linear(feats)
        label = self._label_for_prob(prob, feats)
        return prob, label

    def _label_for_prob(self, prob: float, feats: dict) -> str:
        if prob < self.threshold: return "benign"
        if feats["has_jailbreak"] > 0.5: return "jailbreak"
        if feats["has_ignore"] > 0.5 or feats["has_instruction"] > 0.5: return "direct_prompt_injection"
        if feats["tool_marker"] > 0.5 or feats["indirect"] > 0.5: return "indirect_prompt_injection"
        if feats["has_xml"] > 0.5: return "policy_puppetry"
        if feats["hidden_ctx"] > 0.5 or feats["has_reveal"] > 0.5: return "hidden_context_exposure"
        if feats["goal_hijack"] > 0.5: return "agent_goal_hijack"
        if feats["has_zw"] > 0.5 or feats["spaced_letters"] > 0.5 or feats["has_base64"] > 0.5: return "obfuscation"
        return "prompt_injection"

    def predict_batch(self, texts: list[str]) -> list[tuple[float, str]]:
        return [self.predict(t) for t in texts]
