"""
Open Guard Layer Mini (OGL-Mini)
This is a simple API Layer example for OGL-Mini Model

@developer              Elijah Rastorguev
@version                1.0.0
@build                  1000
@date                   28 august 2026
@git                    https://github.com/devsdaddy/ogl-mini/
"""
# Import required modules
import time
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter
from slowapi.util import get_remote_address
from api.schemas import GuardRequest, GuardResponse, PIIRequest, PIIResponse, HealthResponse, HeuristicHitSchema, \
    PIIEntitySchema
from src.ogl_mini.guards.pipeline import HybridGuard

# API Limiter and Description
limiter = Limiter(key_func=get_remote_address, default_limits=["100/minute", "1000/hour"])
app = FastAPI(
    title="OGL-Mini Hybrid Guard",
    description="Full-featured hybrid model for AI Agents security: Input / Output Guard + PII Detection",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)
app.state.limiter = limiter
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

API_KEY = None

guard = HybridGuard()


# Add Security Headers
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


# Health Route
@app.get("/health", response_model=HealthResponse, tags=["system"])
def health():
    return HealthResponse(status="ok", version="0.1.0", model_loaded=True)


# Input guard
@app.post("/v1/guard/input", response_model=GuardResponse, tags=["guard"])
@limiter.limit("60/minute")
def guard_input(req: GuardRequest, request: Request):
    res = guard.check_input(req.text, with_pii=req.with_pii)
    return _to_response(res)


# Output guard
@app.post("/v1/guard/output", response_model=GuardResponse, tags=["guard"])
@limiter.limit("60/minute")
def guard_output(req: GuardRequest, request: Request):
    res = guard.check_output(req.text, with_pii=req.with_pii)
    return _to_response(res)


# PII Detector
@app.post("/v1/pii/detect", response_model=PIIResponse, tags=["pii"])
@limiter.limit("60/minute")
def pii_detect(req: PIIRequest, request: Request):
    t0 = time.perf_counter()
    entities, redacted = guard.detect_pii(req.text)
    latency = (time.perf_counter() - t0) * 1000
    return PIIResponse(
        entities=[PIIEntitySchema(type=e.type, value=e.value, start=e.start, end=e.end, score=e.score) for e in
                  entities],
        redacted_text=redacted,
        latency_ms=round(latency, 2),
    )


def _to_response(res):
    return GuardResponse(
        safe=res.safe,
        risk_score=res.risk_score,
        label=res.label,
        stage=res.stage,
        latency_ms=res.latency_ms,
        heuristic_hits=[HeuristicHitSchema(id=h.id, label=h.label, score=h.score, evidence=h.evidence) for h in
                        res.heuristic_hits],
        pii_entities=[PIIEntitySchema(type=e.type, value=e.value, start=e.start, end=e.end, score=e.score) for e in
                      res.pii_entities],
        redacted_text=res.redacted_text,
    )
