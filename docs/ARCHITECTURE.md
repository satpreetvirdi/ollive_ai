# Architecture notes

This document explains how I wired the system together — ingestion path, logging choices, how I'd scale it, and what happens when things break.

---

## Ingestion flow

Here's what happens when you send a message in my UI.

The chat API saves your message to `messages` first. Then it loads recent history (I cap it with `MAX_CONTEXT_MESSAGES`), picks the provider from the dropdown, and calls the model.

Right before the LLM runs, my SDK fires a log with `status: pending`. That HTTP call goes to `POST /v1/inference-logs` on the ingestion service. I validate the body with Pydantic, push JSON onto a Redis stream (`inference:logs`), and return **202**. I deliberately do **not** touch Postgres in that request — it keeps the handler fast.

A separate process (`worker.py`) reads the stream and upserts into `inference_logs`. When the model finishes, the SDK sends a second log (`success`, `error`, or `cancelled`) with the same `log_id`, so the row gets updated instead of duplicated.

Streaming works the same way: chunks go to the browser over SSE, and the final log lands after the stream completes.

Chat content and inference logs are separate tables. If logging fails, you still get a normal conversation in `messages` — I cared more about chat working than perfect observability.

The frontend never talks to ingestion directly. Only the chat API → SDK → ingestion path runs inside the backend.

---

## Logging strategy

I wrapped every LLM call in `packages/inference-sdk` (`InferenceLogger`).

Each inference gets a UUID (`log_id`). I emit two events when possible: one at start (`pending`), one at the end. That way I can compute latency even if something dies mid-request.

I send logs with `sendAsync` — the chat handler doesn't await Postgres. The client retries a couple of times, then logs `[inference-sdk] log delivery failed` and continues. I chose that so a slow or broken ingestion service wouldn't block replies.

I only persist **previews** (truncated text), with regex redaction for emails, phone-like numbers, etc. in `redact.ts`. Full prompts would be more useful for debugging but worse for privacy and storage; the assignment spec pointed at previews anyway.

Fields I capture: provider, model, token usage, timestamps, conversation/message/session ids, status, error info, plus optional `raw_metadata` jsonb for extras.

---

## Scaling considerations

**Chat API** and **ingestion HTTP** are stateless — I'd scale them behind a load balancer and point them at the same Postgres + Redis.

**Ingestion workers** can run multiple replicas. They share one Redis consumer group (`ingestion-workers`), so each message goes to one worker. I'd watch DB connection count if I scaled workers hard.

**Redis** absorbs write spikes. If workers lag, the stream grows — I'd monitor length and pending entries. For production I'd use managed Redis, not a single container like in my compose file.

**Postgres** is the long-term limit. I'd add pooling (PgBouncer) with many chat replicas, maybe a read replica for dashboard queries, and eventually partition `inference_logs` by time.

I skipped a batch ingest API. Fine for interactive chat; I'd add it if a client needed to ship offline logs in bulk.

---

## Failure handling assumptions

These are the behaviors I implemented and expect in this demo setup.

**Ingestion or Redis unavailable** — SDK retries, then stops. Chat still responds. Those turns won't show up in `inference_logs`.

**Worker stopped** — ingestion still accepts logs into Redis. They sit in the stream until the worker comes back.

**Worker can't write to Postgres** — I don't ACK the Redis message, so it can be retried. I didn't build a dead-letter queue.

**Invalid JSON / validation error** — 4xx from ingestion, nothing enqueued.

**Duplicate `log_id`** — upsert, so SDK retries are safe.

**Cancel in the UI** — I abort the in-flight LLM request, log `cancelled`, and mark the conversation cancelled in the API.

**Missing provider API key** — 400 from chat with a readable error.

**Security** — I assumed a trusted dev network. Internal traffic isn't TLS-terminated in compose, and there's no rate limiting.

---

## Multi-provider

I put Groq, OpenAI, Gemini, and Anthropic behind one `LLMProvider` interface in `apps/chat-api/src/providers/`. Groq and OpenAI share an OpenAI-compatible client; Gemini and Anthropic use their own SDKs.

The UI calls `GET /api/providers` to show which keys I actually configured in env. Each inference log row records the real `provider` and `model` for that request so I can compare them in SQL or on the dashboard.

---

## Code map

| Piece | Path |
|-------|------|
| SDK | `packages/inference-sdk` |
| Chat + providers | `apps/chat-api` |
| Ingestion + worker | `apps/ingestion-api` |
| UI | `apps/web` |
| Schema | `db/init.sql` |
| Kubernetes | `k8s/base`, `k8s/overlays/local` |

If you want synchronous ingestion (no Redis/worker) for debugging, set `USE_EVENT_QUEUE=false` on the ingestion API — it writes Postgres directly in the POST handler.
