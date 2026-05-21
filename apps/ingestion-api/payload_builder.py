from typing import Any

from schemas import InferenceLogCreate


def log_body_to_storage_payload(body: InferenceLogCreate) -> dict[str, Any]:
    """Map validated API body to DB upsert dict (JSON-serializable values)."""
    return {
        "id": str(body.log_id),
        "conversation_id": str(body.conversation_id) if body.conversation_id else None,
        "message_id": str(body.message_id) if body.message_id else None,
        "session_id": body.session_id,
        "provider": body.provider,
        "model": body.model,
        "status": body.status.value,
        "latency_ms": body.latency_ms,
        "prompt_tokens": body.prompt_tokens,
        "completion_tokens": body.completion_tokens,
        "total_tokens": body.total_tokens,
        "error_code": body.error_code,
        "error_message": body.error_message,
        "input_preview": body.input_preview,
        "output_preview": body.output_preview,
        "request_started_at": body.request_started_at.isoformat(),
        "request_completed_at": (
            body.request_completed_at.isoformat() if body.request_completed_at else None
        ),
        "raw_metadata": body.raw_metadata,
    }
