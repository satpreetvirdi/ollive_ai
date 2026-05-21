import os
from uuid import UUID

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from database import get_metrics_summary, list_inference_logs
from events.redis_queue import (
    pending_count,
    ping_redis,
    publish_inference_log,
    stream_length,
)
from payload_builder import log_body_to_storage_payload
from schemas import InferenceLogCreate, InferenceLogQueuedResponse, MetricsSummary

load_dotenv()

USE_EVENT_QUEUE = os.getenv("USE_EVENT_QUEUE", "true").lower() in ("1", "true", "yes")

app = FastAPI(
    title="Ollive Inference Ingestion API",
    description="Receives inference logs via HTTP and enqueues to Redis for async persistence",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "ingestion-api",
        "event_queue_enabled": USE_EVENT_QUEUE,
        "redis": "up" if ping_redis() else "down",
        "stream_length": stream_length() if ping_redis() else None,
        "pending_messages": pending_count() if ping_redis() else None,
    }


@app.post(
    "/v1/inference-logs",
    response_model=InferenceLogQueuedResponse,
    status_code=202,
)
def enqueue_inference_log(body: InferenceLogCreate):
    """
    Validate log payload and enqueue to Redis Stream.
    A separate worker persists to PostgreSQL (event-driven ingestion).
    """
    if not USE_EVENT_QUEUE:
        from database import upsert_inference_log

        try:
            payload = log_body_to_storage_payload(body)
            log_id = upsert_inference_log(payload)
            return JSONResponse(
                status_code=201,
                content={
                    "id": str(log_id),
                    "conversation_id": str(body.conversation_id)
                    if body.conversation_id
                    else None,
                    "status": body.status.value,
                    "queued": False,
                    "stream_message_id": None,
                },
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e)) from e

    if not ping_redis():
        raise HTTPException(status_code=503, detail="Event queue (Redis) unavailable")

    try:
        payload = log_body_to_storage_payload(body)
        stream_message_id = publish_inference_log(payload)
        return InferenceLogQueuedResponse(
            id=body.log_id,
            conversation_id=body.conversation_id,
            status=body.status,
            queued=True,
            stream_message_id=stream_message_id,
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Failed to enqueue log: {e}") from e


@app.get("/v1/inference-logs")
def get_inference_logs(
    conversation_id: UUID | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    logs = list_inference_logs(conversation_id=conversation_id, limit=limit, offset=offset)
    return {"items": logs, "count": len(logs)}


@app.get("/v1/metrics/summary", response_model=MetricsSummary)
def metrics_summary(hours: int = Query(default=24, ge=1, le=168)):
    data = get_metrics_summary(hours=hours)
    return MetricsSummary(
        total_requests=data.get("total_requests") or 0,
        success_count=data.get("success_count") or 0,
        error_count=data.get("error_count") or 0,
        cancelled_count=data.get("cancelled_count") or 0,
        avg_latency_ms=float(data["avg_latency_ms"]) if data.get("avg_latency_ms") else None,
        p50_latency_ms=float(data["p50_latency_ms"]) if data.get("p50_latency_ms") else None,
        p95_latency_ms=float(data["p95_latency_ms"]) if data.get("p95_latency_ms") else None,
        total_tokens=int(data.get("total_tokens") or 0),
        requests_per_minute=float(data.get("requests_per_minute") or 0),
    )


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8001"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
