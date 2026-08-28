"""
Open Guard Layer Mini (OGL-Mini)
Guards Pipeline

@developer              Elijah Rastorguev
@version                1.0.0
@build                  1000
@date                   28 august 2026
@git                    https://github.com/devsdaddy/ogl-mini/
"""
import time
from dataclasses import dataclass, field
from pathlib import Path
from ogl_mini.heuristics.detector import HeuristicDetector
from ogl_mini.ml.classifier import MiniClassifier
from ogl_mini.pii.detector import PIIDetector, PIIEntity


@dataclass
class GuardResult:
    safe: bool
    risk_score: float
    label: str
    heuristic_hits: list = field(default_factory=list)
    pii_entities: list[PIIEntity] = field(default_factory=list)
    redacted_text: str | None = None
    latency_ms: float = 0.0
    stage: str = ""


class HybridGuard:
    def __init__(self, model_path: Path | None = None, threshold: float = 0.60, enable_pii: bool = True):
        self.heuristics = HeuristicDetector()
        self.classifier = MiniClassifier(model_path, threshold=threshold)
        self.pii = PIIDetector() if enable_pii else None
        self.threshold = threshold

    def check_input(self, text: str, with_pii: bool = False) -> GuardResult:
        t0 = time.perf_counter()
        hits = self.heuristics.scan(text)
        h_score = self.heuristics.risk_score(hits)
        if hits and h_score >= 0.85:
            top = max(hits, key=lambda h: h.score)
            pii_entities, redacted = self._pii_if_needed(text, with_pii)
            latency = (time.perf_counter() - t0) * 1000
            return GuardResult(False, round(h_score, 4), top.label, hits, pii_entities, redacted, round(latency, 2),
                               "heuristic")

        prob, label = self.classifier.predict(text)
        combined = max(prob, h_score * 0.9) if hits else prob
        if hits and combined < self.threshold:
            combined = max(combined, h_score * 0.85)
        safe = combined < self.threshold
        pii_entities, redacted = self._pii_if_needed(text, with_pii)
        latency = (time.perf_counter() - t0) * 1000
        final_label = label if not safe else "benign"
        if hits and not safe and h_score > prob:
            final_label = max(hits, key=lambda h: h.score).label
        return GuardResult(safe, round(combined, 4), final_label, hits, pii_entities, redacted, round(latency, 2),
                           "ml" if not hits or h_score < 0.85 else "heuristic+ml")

    def check_output(self, text: str, with_pii: bool = True) -> GuardResult:
        t0 = time.perf_counter()
        pii_entities = self.pii.detect(text) if self.pii else []
        has_pii_leak = len(pii_entities) > 0
        redacted = self.pii.redact(text, pii_entities) if self.pii else None

        leak_markers = ["system prompt", "internal instruction", "api_key", "secret", "token:", "BEGIN PRIVATE"]
        has_leak = any(k.lower() in text.lower() for k in leak_markers)

        hits = self.heuristics.scan(text)
        h_score = self.heuristics.risk_score(hits)

        risk = 0.0
        label = "benign"
        if has_pii_leak:
            risk = max(risk, 0.88)
            label = "pii_leak"
        if has_leak:
            risk = max(risk, 0.92)
            label = "system_prompt_leak"
        if hits:
            risk = max(risk, h_score)
            if h_score > risk - 0.05:
                label = max(hits, key=lambda h: h.score).label

        prob, ml_label = self.classifier.predict(text)
        risk = max(risk, prob * 0.7)

        safe = risk < self.threshold and not has_pii_leak and not has_leak
        if not safe and risk < self.threshold:
            risk = self.threshold + 0.05
        latency = (time.perf_counter() - t0) * 1000
        if safe:
            label = "benign"
        return GuardResult(safe, round(risk, 4), label, hits, pii_entities, redacted, round(latency, 2), "output_guard")

    def detect_pii(self, text: str) -> tuple[list[PIIEntity], str]:
        if not self.pii:
            return [], text
        ents = self.pii.detect(text)
        return ents, self.pii.redact(text, ents)

    def _pii_if_needed(self, text: str, with_pii: bool):
        if with_pii and self.pii:
            ents = self.pii.detect(text)
            return ents, self.pii.redact(text, ents)
        return [], None
