import json
import os
from typing import Any

import redis

STREAM_KEY = os.getenv("INFERENCE_STREAM_KEY", "inference:logs")
CONSUMER_GROUP = os.getenv("INFERENCE_CONSUMER_GROUP", "ingestion-workers")
CONSUMER_NAME = os.getenv("INFERENCE_CONSUMER_NAME", "worker-1")


def get_redis_url() -> str:
    return os.getenv("REDIS_URL", "redis://localhost:6379/0")


def get_redis_client() -> redis.Redis:
    return redis.from_url(get_redis_url(), decode_responses=True)


def ensure_consumer_group(client: redis.Redis | None = None) -> None:
    r = client or get_redis_client()
    try:
        r.xgroup_create(STREAM_KEY, CONSUMER_GROUP, id="0", mkstream=True)
    except redis.ResponseError as exc:
        if "BUSYGROUP" not in str(exc):
            raise


def publish_inference_log(payload: dict[str, Any]) -> str:
    """Enqueue log payload on Redis Stream. Returns stream message id."""
    r = get_redis_client()
    message_id = r.xadd(STREAM_KEY, {"payload": json.dumps(payload)})
    return message_id


def read_pending_logs(
    count: int = 10,
    block_ms: int = 5000,
    consumer_name: str = CONSUMER_NAME,
) -> list[tuple[str, dict[str, Any]]]:
    """
    Read new messages from the consumer group.
    Returns list of (stream_message_id, storage_payload).
    """
    r = get_redis_client()
    ensure_consumer_group(r)

    entries = r.xreadgroup(
        CONSUMER_GROUP,
        consumer_name,
        {STREAM_KEY: ">"},
        count=count,
        block=block_ms,
    )

    results: list[tuple[str, dict[str, Any]]] = []
    for _stream, messages in entries or []:
        for message_id, fields in messages:
            raw = fields.get("payload")
            if not raw:
                continue
            results.append((message_id, json.loads(raw)))
    return results


def ack_message(message_id: str) -> int:
    r = get_redis_client()
    return r.xack(STREAM_KEY, CONSUMER_GROUP, message_id)


def stream_length() -> int:
    r = get_redis_client()
    return r.xlen(STREAM_KEY)


def pending_count() -> int:
    """Approximate count of messages not yet acknowledged by the group."""
    r = get_redis_client()
    ensure_consumer_group(r)
    info = r.xpending(STREAM_KEY, CONSUMER_GROUP)
    if not info:
        return 0
    if isinstance(info, dict):
        return int(info.get("pending", 0))
    return int(info[0])


def ping_redis() -> bool:
    try:
        return get_redis_client().ping()
    except redis.RedisError:
        return False
