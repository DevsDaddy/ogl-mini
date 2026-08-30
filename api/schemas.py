"""
Open Guard Layer Mini (OGL-Mini)
API Schemas

@developer              Elijah Rastorguev
@version                1.0.0
@build                  1000
@date                   28 august 2026
@git                    https://github.com/devsdaddy/ogl-mini/
"""
# Import required modules
from pydantic import BaseModel, Field
from typing import Literal

"""
Guard Request
"""


class GuardRequest(BaseModel):
    text: str = Field(..., max_length=20000, description="Scanning text (prompt)")
    with_pii: bool = Field(False, description="Enable PII detection")


"""
Heuristic Hit Schema
"""


class HeuristicHitSchema(BaseModel):
    id: str
    label: str
    score: float
    evidence: str


"""
PII Entity Schema
"""


class PIIEntitySchema(BaseModel):
    type: str
    value: str
    start: int
    end: int
    score: float


"""
Guard Response Schema
"""


class GuardResponse(BaseModel):
    safe: bool
    risk_score: float = Field(..., ge=0, le=1)
    label: str
    stage: str
    latency_ms: float
    heuristic_hits: list[HeuristicHitSchema] = []
    pii_entities: list[PIIEntitySchema] = []
    redacted_text: str | None = None


"""
PII Request Schema
"""


class PIIRequest(BaseModel):
    text: str = Field(..., max_length=20000)


"""
PII Response Schema
"""


class PIIResponse(BaseModel):
    entities: list[PIIEntitySchema]
    redacted_text: str
    latency_ms: float


"""
Health Response Schema
"""


class HealthResponse(BaseModel):
    status: Literal["ok"]
    version: str
    model_loaded: bool
