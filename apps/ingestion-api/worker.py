"""
Background consumer: Redis Stream -> PostgreSQL inference_logs.
Run: python worker.py
"""
import logging
import os
import signal
import sys
import time

from dotenv import load_dotenv

from database import upsert_inference_log
from events.redis_queue import (
    CONSUMER_NAME,
    ack_message,
    ensure_consumer_group,
    ping_redis,
    read_pending_logs,
)

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [ingestion-worker] %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)

_running = True


def _shutdown(*_args: object) -> None:
    global _running
    _running = False
    logger.info("Shutdown requested, finishing current batch…")


def process_batch() -> int:
    processed = 0
    messages = read_pending_logs(count=20, block_ms=2000)
    for message_id, payload in messages:
        try:
            upsert_inference_log(payload)
            ack_message(message_id)
            processed += 1
            logger.debug("Persisted log %s (stream %s)", payload.get("id"), message_id)
        except Exception:
            logger.exception(
                "Failed to persist log %s (stream %s); leaving in pending for retry",
                payload.get("id"),
                message_id,
            )
    return processed


def main() -> None:
    signal.signal(signal.SIGINT, _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)

    if not ping_redis():
        logger.error("Cannot connect to Redis at %s", os.getenv("REDIS_URL"))
        sys.exit(1)

    ensure_consumer_group()
    logger.info("Consumer %s started (group ingestion-workers)", CONSUMER_NAME)

    while _running:
        try:
            n = process_batch()
            if n == 0 and _running:
                time.sleep(0.1)
        except Exception:
            logger.exception("Worker loop error")
            time.sleep(2)

    logger.info("Worker stopped")


if __name__ == "__main__":
    main()
