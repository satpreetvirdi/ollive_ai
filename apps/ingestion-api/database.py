import json
import os
from contextlib import contextmanager
from typing import Any
from uuid import UUID

import psycopg2
from psycopg2.extras import RealDictCursor, Json


def get_database_url() -> str:
    return os.getenv(
        "DATABASE_URL",
        "postgresql://ollive:ollive@localhost:5432/olliveai",
    )


@contextmanager
def get_connection():
    conn = psycopg2.connect(get_database_url())
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _uuid_param(value: Any) -> str | None:
    """psycopg2 cannot bind uuid.UUID directly; use strings for UUID columns."""
    if value is None:
        return None
    if isinstance(value, UUID):
        return str(value)
    return str(value)


def upsert_inference_log(payload: dict[str, Any]) -> UUID:
    """Insert or update inference log by log_id (idempotent retries)."""
    query = """
        INSERT INTO inference_logs (
            id, conversation_id, message_id, session_id,
            provider, model, status, latency_ms,
            prompt_tokens, completion_tokens, total_tokens,
            error_code, error_message,
            input_preview, output_preview,
            request_started_at, request_completed_at, raw_metadata
        ) VALUES (
            %(id)s, %(conversation_id)s, %(message_id)s, %(session_id)s,
            %(provider)s, %(model)s, %(status)s, %(latency_ms)s,
            %(prompt_tokens)s, %(completion_tokens)s, %(total_tokens)s,
            %(error_code)s, %(error_message)s,
            %(input_preview)s, %(output_preview)s,
            %(request_started_at)s, %(request_completed_at)s, %(raw_metadata)s
        )
        ON CONFLICT (id) DO UPDATE SET
            status = EXCLUDED.status,
            latency_ms = COALESCE(EXCLUDED.latency_ms, inference_logs.latency_ms),
            prompt_tokens = COALESCE(EXCLUDED.prompt_tokens, inference_logs.prompt_tokens),
            completion_tokens = COALESCE(EXCLUDED.completion_tokens, inference_logs.completion_tokens),
            total_tokens = COALESCE(EXCLUDED.total_tokens, inference_logs.total_tokens),
            error_code = EXCLUDED.error_code,
            error_message = EXCLUDED.error_message,
            output_preview = COALESCE(EXCLUDED.output_preview, inference_logs.output_preview),
            request_completed_at = COALESCE(EXCLUDED.request_completed_at, inference_logs.request_completed_at),
            raw_metadata = inference_logs.raw_metadata || EXCLUDED.raw_metadata
        RETURNING id
    """
    params = {
        **payload,
        "id": _uuid_param(payload.get("id")),
        "conversation_id": _uuid_param(payload.get("conversation_id")),
        "message_id": _uuid_param(payload.get("message_id")),
        "raw_metadata": Json(payload.get("raw_metadata") or {}),
    }
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)
            row = cur.fetchone()
            return row[0]


def list_inference_logs(
    conversation_id: UUID | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict[str, Any]]:
    query = """
        SELECT id, conversation_id, message_id, session_id,
               provider, model, status, latency_ms,
               prompt_tokens, completion_tokens, total_tokens,
               error_code, error_message,
               input_preview, output_preview,
               request_started_at, request_completed_at,
               raw_metadata, created_at
        FROM inference_logs
        WHERE (%(conversation_id)s IS NULL OR conversation_id = %(conversation_id)s)
        ORDER BY created_at DESC
        LIMIT %(limit)s OFFSET %(offset)s
    """
    with get_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                query,
                {
                    "conversation_id": str(conversation_id) if conversation_id else None,
                    "limit": limit,
                    "offset": offset,
                },
            )
            rows = cur.fetchall()
            for row in rows:
                if row.get("raw_metadata") and isinstance(row["raw_metadata"], str):
                    row["raw_metadata"] = json.loads(row["raw_metadata"])
            return [dict(r) for r in rows]


def get_metrics_summary(hours: int = 24) -> dict[str, Any]:
    interval = f"{int(hours)} hours"
    query = """
        WITH recent AS (
            SELECT * FROM inference_logs
            WHERE created_at >= NOW() - %s::interval
              AND status IN ('success', 'error', 'cancelled')
        )
        SELECT
            COUNT(*) AS total_requests,
            COUNT(*) FILTER (WHERE status = 'success') AS success_count,
            COUNT(*) FILTER (WHERE status = 'error') AS error_count,
            COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled_count,
            AVG(latency_ms) AS avg_latency_ms,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms) AS p50_latency_ms,
            PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_latency_ms,
            COALESCE(SUM(total_tokens), 0) AS total_tokens
        FROM recent
    """
    rpm_query = """
        SELECT COUNT(*)::float / GREATEST(
            EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) / 60.0,
            1.0
        ) AS rpm
        FROM inference_logs
        WHERE created_at >= NOW() - %s::interval
    """
    with get_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, (interval,))
            summary = dict(cur.fetchone())
            cur.execute(rpm_query, (interval,))
            rpm_row = cur.fetchone()
            summary["requests_per_minute"] = float(rpm_row["rpm"] or 0)
            return summary
