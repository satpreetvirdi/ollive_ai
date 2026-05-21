# Ollive AI — inference logging & ingestion

This is my submission for the Ollive take-home: a small chat app, a TypeScript SDK that wraps LLM calls and emits inference metadata, and a Python service that ingests those logs into Postgres.

I split it across a React frontend, a Node chat API, the SDK package, ingestion API + worker, Postgres, and Redis for the async write path.

---

## What the brief asked for vs what I built

Quick map so you don't have to dig through the repo to check coverage.

### Core requirements

| Asked for | What I did | Where |
|-----------|------------|--------|
| Chatbot with a foundation model | Multi-provider chat (Groq default; also OpenAI, Gemini, Anthropic) | `apps/chat-api`, `apps/web` |
| Multi-turn conversations | Message history per `conversation_id`, context sent on each turn | `messages` table, `chat.ts` |
| Short conversational context | Last N turns (`MAX_CONTEXT_MESSAGES`, default 10) | `apps/chat-api` |
| Simple UI | React chat + sidebar + composer | `apps/web` |
| Lightweight SDK / wrapper | `@olliveai/inference-sdk` wraps LLM calls | `packages/inference-sdk` |
| Log: model, provider, latency, tokens, timestamps, status/errors | All fields on `InferenceLogPayload` → `inference_logs` | `logger.ts`, `schemas.py` |
| Log: conversation / session ID, input/output previews | `conversation_id`, `message_id`, `session_id`, truncated previews | SDK + DB |
| Near-real-time send to ingestion | `sendAsync` POST after each log event | `client.ts` |
| Ingestion service | FastAPI receives, validates, persists | `apps/ingestion-api` |
| Validate / parse payloads | Pydantic models on `POST /v1/inference-logs` | `schemas.py` |
| Store chat + logs + metadata | Postgres: `conversations`, `messages`, `inference_logs` (+ `raw_metadata` jsonb) | `db/init.sql` |
| Sensible schema + tradeoffs | Documented below + in this README | Schema / Tradeoffs sections |

### Deliverables

| Asked for | Where |
|-----------|--------|
| GitHub repo with source | This repository |
| README: setup, architecture, schema, tradeoffs, future work | Below + [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Architecture notes: ingestion, logging, scaling, failures | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |


### Bonus (from the job post)

| Bonus item | Covered? | Notes |
|------------|----------|--------|
| Multi-provider support | Yes | UI dropdown; Groq, OpenAI, Gemini, Anthropic |
| Streaming responses | Yes | SSE from chat API |
| Latency / throughput / errors dashboard | Yes | Dashboard tab + `GET /v1/metrics/summary` |
| Docker Compose one-command setup | Yes | `docker compose up --build` |
| Event-based architecture | Yes | Redis Stream + `ingestion-worker` |
| PII redaction | Yes | Regex in SDK before previews are sent |
| Self-hosted Kubernetes | Yes | `k8s/` — tested on Docker Desktop K8s |
| UI: cancel conversation | Yes | Cancel button + abort + `cancelled` logs |
| UI: list conversations | Yes | Sidebar |
| UI: resume conversation | Yes | Click thread → load `messages` |

---



Add your `GROQ_API_KEY` in `.env`. I defaulted to Groq because the free tier works without a credit card; you can switch to OpenAI with `LLM_PROVIDER=openai` and `OPENAI_API_KEY` if you prefer.

```bash
docker compose up --build
```

Open http://localhost:5173

| Service | Port |
|---------|------|
| Web UI | 5173 |
| Chat API | 3001 |
| Ingestion API | 8001 |

Postgres is on `localhost:5432` — user `ollive`, password `ollive`, database `olliveai`. Handy if you want to peek at `inference_logs` in DBeaver.

### Without Docker

I usually still run Postgres via compose:

```bash
docker compose up postgres redis -d
```

Then I start four things in separate terminals:

1. `apps/ingestion-api` — venv, `pip install -r requirements.txt`, `uvicorn main:app --port 8001`
2. Same folder — `python worker.py` (needs Redis; compose brings it up)
3. Repo root — `pnpm install`, `pnpm --filter @olliveai/inference-sdk build`, `pnpm --filter @olliveai/chat-api dev`
4. `pnpm --filter @olliveai/web dev`



### Kubernetes

I also deployed this on Docker Desktop Kubernetes.  After apply, I use either `kubectl port-forward svc/web 8080:80` or http://localhost:30080 (NodePort).

---

## Architecture overview

I kept the browser dumb on purpose: it only hits the chat API. Every LLM call goes through my inference SDK, which POSTs logs to the ingestion service. Ingestion validates the payload, pushes it onto a Redis stream, and a worker persists it to `inference_logs`. Chat text lives in `messages` in the same Postgres DB.

```
Browser → chat-api → LLM (Groq / OpenAI / Gemini / Claude)
              ↓
         inference-sdk → ingestion-api → Redis → worker → inference_logs
              ↓
            messages
```

You won't see `/v1/inference-logs` in the browser network tab — that call runs server-side from the SDK. I documented the full flow in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

**Where the code lives**

- `apps/web` — chat UI, provider dropdown, metrics dashboard  
- `apps/chat-api` — conversations, streaming, provider adapters  
- `packages/inference-sdk` — the logging wrapper  
- `apps/ingestion-api` — FastAPI + `worker.py` + Redis helpers  
- `db/init.sql` — schema bootstrap  

---

## Schema design

I used three tables and tried not to over-normalize.

**`conversations`** — session container. I store `status` (`active`, `cancelled`, `archived`) so cancel in the UI maps to something real in the DB.

**`messages`** — the actual chat history (user/assistant rows). Resuming a chat is just loading this table for a `conversation_id`.

**`inference_logs`** — telemetry from the SDK. I log twice per inference when things go well (`pending`, then `success`), but I upsert on `log_id` so it collapses to one row. I store provider, model, latency, tokens, status, errors, and short previews — not full prompts.

I added `raw_metadata` as jsonb for anything I didn't want to migrate later. Previews go through basic PII redaction in the SDK before they leave the chat service.

---

## Tradeoffs

**Previews, not full bodies** — the brief asked for previews; it also keeps storage smaller and lowers the chance I accidentally persist emails/phones in a log table.

**Redis between ingestion and Postgres** — the HTTP handler returns 202 fast; a worker does the insert. Chat doesn't block on log durability. Tradeoff: you need the worker running, and logs appear slightly after the reply.

**Fire-and-forget logging** — if ingestion is down, I still return a chat response. I log a warning and move on. I'd rather lose telemetry for a request than break the user.

**Provider selection in the request body** — the UI dropdown sends `provider` per message. I didn't store the chosen provider on the conversation row; that would be an easy follow-up.

**No auth** — local assignment setup. Not something I'd ship without API keys or JWT.

---

## Beyond the base requirements

I added streaming (SSE), list/resume/cancel for conversations, a small metrics dashboard, multi-provider support (Groq, OpenAI, Gemini, Anthropic), PII redaction on previews, Docker Compose, event-based ingestion, and k8s manifests.

---

## What I'd improve with more time

- Auth on the chat and ingestion APIs  
- Automated tests for SDK → ingestion → DB (I verified with manual chat + SQL)  
- Batch ingest endpoint for high volume clients  
- Retention policy / partitioning on `inference_logs`  
- OpenTelemetry in addition to my custom table  
- CI pipeline (build images, smoke test compose)  
- Save `provider` on the conversation so resume picks up where you left off  
- A proper prod k8s overlay (ingress, TLS, resource limits)  

---

## API reference

**Chat API** (`:3001`)

- `POST /api/conversations` — new chat  
- `GET /api/conversations` — list  
- `GET /api/conversations/:id/messages` — history  
- `GET /api/providers` — which providers have keys configured  
- `POST /api/conversations/:id/chat` — `{ message, stream: true, provider?: "groq" }`  
- `POST /api/conversations/:id/cancel`  

**Ingestion API** (`:8001`)

- `POST /v1/inference-logs` — validate + enqueue (202)  
- `GET /v1/inference-logs`  
- `GET /v1/metrics/summary`  

---

## Demo

- **Architecture details:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)  
  
