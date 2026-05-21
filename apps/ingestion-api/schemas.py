from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class InferenceStatus(str, Enum):
    pending = "pending"
    success = "success"
    error = "error"
    cancelled = "cancelled"


class InferenceLogCreate(BaseModel):
    log_id: UUID
    conversation_id: UUID | None = None
    message_id: UUID | None = None
    session_id: str | None = Field(default=None, max_length=128)
    provider: str = Field(..., min_length=1, max_length=64)
    model: str = Field(..., min_length=1, max_length=128)
    status: InferenceStatus
    latency_ms: int | None = Field(default=None, ge=0)
    prompt_tokens: int | None = Field(default=None, ge=0)
    completion_tokens: int | None = Field(default=None, ge=0)
    total_tokens: int | None = Field(default=None, ge=0)
    error_code: str | None = Field(default=None, max_length=64)
    error_message: str | None = None
    input_preview: str | None = Field(default=None, max_length=2000)
    output_preview: str | None = Field(default=None, max_length=2000)
    request_started_at: datetime
    request_completed_at: datetime | None = None
    raw_metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("request_started_at", "request_completed_at", mode="before")
    @classmethod
    def parse_datetime(cls, v: Any) -> Any:
        if v is None or isinstance(v, datetime):
            return v
        if isinstance(v, str):
            return datetime.fromisoformat(v.replace("Z", "+00:00"))
        return v


class InferenceLogResponse(BaseModel):
    id: UUID
    conversation_id: UUID | None
    status: InferenceStatus
    created_at: datetime


class InferenceLogQueuedResponse(BaseModel):
    """HTTP 202 — log accepted and queued for async persistence."""

    id: UUID
    conversation_id: UUID | None
    status: InferenceStatus
    queued: bool = True
    stream_message_id: str | None = None


class MetricsSummary(BaseModel):
    total_requests: int
    success_count: int
    error_count: int
    cancelled_count: int
    avg_latency_ms: float | None
    p50_latency_ms: float | None
    p95_latency_ms: float | None
    total_tokens: int
    requests_per_minute: float
