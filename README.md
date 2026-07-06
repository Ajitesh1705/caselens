# CaseLens

**A Gen-AI digital forensics investigation console.** Evidence arrives by upload or signed webhook, a pipeline extracts entities and events, and they **stream into a live link graph over WebSockets** as they're discovered. Investigators explore the graph, cross-filter a timeline, search evidence full-text, ask natural-language questions with cited answers, and generate a one-click case report.

All data is synthetic and clearly fictional (a mock financial-fraud case, *Operation Meridian*) — no real PII.

> **Live demo:** _add your Render URL here after deploying (see [DEPLOY.md](./DEPLOY.md))_
> **Run locally:** `docker compose up --build` → http://localhost:4000

---

## What it does

An investigator opens a **case**. Evidence (chat exports, call records, transaction ledgers) enters via file upload or an external system firing a **webhook**. For each piece of evidence the pipeline:

1. parses the raw text,
2. **extracts entities** (people, phones, bank accounts, organizations, emails) and **events** (timestamped actions),
3. merges entities into the case graph (the same phone number from two files becomes one node),
4. indexes the text for search + retrieval,
5. and **emits every discovery over a WebSocket** so the browser animates it in real time.

The console then supports link analysis, a timeline↔graph cross-filter, full-text search, streamed "Ask the Case" answers with clickable citations, and report generation.

---

## Architecture

```
  External system                    ┌──────────────────────────────┐
  (curl / script)                     │        Browser (React)        │
        │                             │  Link Graph · Timeline ·      │
        │ POST /webhooks/             │  Evidence Search · Ask ·      │
        │ evidence-uploaded           │  Live Ingestion Feed          │
        │  (X-Signature HMAC)         └───────┬───────────▲──────────┘
        ▼                                     │ REST      │ WebSocket
  ┌──────────────────────────────────────────▼───────────┴──────────┐
  │            Gateway — Node.js / Express / TypeScript              │
  │  · REST API (cases, evidence, graph, search, report)            │
  │  · Socket.IO server — case rooms, ingestion events, chat stream │
  │  · Webhook receiver (HMAC-verified, idempotent, 202 async)      │
  │  · Ingestion orchestrator  · serves the built web console       │
  └───────────────┬──────────────────────────┬─────────────────────┘
                  │ HTTP (internal)           │
                  ▼                           ▼
  ┌───────────────────────────┐   ┌──────────────────────────────┐
  │  AI Service — FastAPI      │   │        Data layer             │
  │  (Python)                  │   │  MongoDB — cases, evidence,   │
  │  · Entity/event extraction │   │  entities, edges, events      │
  │    (heuristic + LLM)       │   │                               │
  │  · Ask-the-Case (RAG)      │   │  Elasticsearch — full-text    │
  │  · Report generation       │   │  + retrieval over evidence    │
  │  · Provider-agnostic LLM    │   │                               │
  └───────────────────────────┘   └──────────────────────────────┘
```

**Two backends on purpose:** the gateway (TypeScript) owns state, realtime and the product surface; the AI service (Python/FastAPI) is stateless compute. Clean boundary, and both stacks are exercised.

**Resilience:** every external dependency degrades gracefully. No MongoDB → in-memory store. No Elasticsearch → in-memory search. AI service down → the gateway's local heuristic extractor. No `OPENAI_API_KEY` → deterministic, retrieval-grounded answers/reports. The demo never hard-fails.

### Stack

| Layer | Tech |
|---|---|
| Web | React 18, Vite, TypeScript, Tailwind v4, React Query, Zustand, react-force-graph-2d |
| Gateway | Node.js, Express, Socket.IO, TypeScript, MongoDB driver, Zod |
| AI service | Python 3.11, FastAPI, OpenAI SDK (provider-agnostic) |
| Data | MongoDB, Elasticsearch |
| Shared | `@caselens/shared` — typed socket/API/domain contracts consumed by web + gateway |
| Infra | Docker (multi-stage, non-root), docker-compose, Render blueprint |

---

## Quick start

### Full stack with Docker (recommended)

```bash
OPENAI_API_KEY=sk-...  docker compose up --build   # key optional
# open http://localhost:4000
```

Starts MongoDB, Elasticsearch, the AI service, and the gateway (which serves the web console). The *Operation Meridian* case seeds automatically on first boot.

### Local dev (hot reload, no containers)

```bash
pnpm install

# terminal 1 — AI service
cd services/ai && python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/uvicorn app.main:app --port 8000

# terminal 2 — gateway (falls back to in-memory store/search if Mongo/ES aren't running)
pnpm --filter @caselens/gateway dev

# terminal 3 — web (Vite proxies API + WebSocket to the gateway)
pnpm --filter @caselens/web dev        # http://localhost:5173
```

Set the OpenAI key for the AI service by copying `services/ai/.env.example` → `services/ai/.env`.

---

## The two must-haves

### WebSockets — live ingestion feed

Socket.IO, **one room per case** (open two tabs — both update). The protocol is a typed contract in [`packages/shared/src/socket.ts`](./packages/shared/src/socket.ts):

| Direction | Event | Payload | Purpose |
|---|---|---|---|
| client → server | `case:join` | `{ caseId }` | Subscribe to a case room |
| server → client | `ingestion:started` | `{ evidenceId, filename }` | New evidence entered the pipeline |
| server → client | `ingestion:progress` | `{ evidenceId, stage, pct }` | parsing → extraction → indexing |
| server → client | `entity:discovered` | `{ entity, sourceEvidenceId }` | Node animates into the graph |
| server → client | `edge:discovered` | `{ edge }` | Link animates in |
| server → client | `event:discovered` | `{ event }` | Dot drops onto the timeline |
| server → client | `ingestion:complete` | `{ evidenceId, summary }` | Feed entry finalized |
| client → server | `chat:ask` | `{ caseId, question }` | Ask-the-Case query |
| server → client | `chat:token` | `{ token }` | **Streamed** answer token |
| server → client | `chat:done` | `{ answer, citations }` | Answer complete + evidence citations |

The AI answer streams token-by-token over the same socket rather than being polled.

### Webhooks — evidence-uploaded contract

```
POST /webhooks/evidence-uploaded
Content-Type: application/json
X-Signature:   sha256=<HMAC-SHA256 of the raw body, keyed with WEBHOOK_SECRET>
X-Delivery-Id: <unique id>        # optional — enables idempotent redelivery

{ "caseId": "...", "filename": "wire.txt", "type": "transaction",
  "content": "..." }              # or "contentBase64" / "contentUrl"
```

- The signature is verified (constant-time) over the **raw** body **before** any work.
- Returns **`202 Accepted`** immediately and processes **asynchronously** (correct webhook semantics).
- A repeated `X-Delivery-Id` is deduped and returns `{ "status": "duplicate" }` — no reprocessing.

See [`DEPLOY.md`](./DEPLOY.md) for a copy-paste `curl` that signs and fires the webhook against a live deployment.

---

## REST API (gateway)

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Liveness + which store/search backends are active |
| `GET` | `/cases` | List cases |
| `POST` | `/cases` | Create a case |
| `GET` | `/cases/:id/graph` | Full graph: entities, edges, events, evidence |
| `POST` | `/cases/:id/evidence` | Upload evidence (same pipeline as the webhook) |
| `GET` | `/cases/:id/search?q=` | Full-text search with highlighted snippets |
| `POST` | `/cases/:id/report` | Generate a structured markdown case report |

AI service (internal): `POST /extract`, `POST /ask`, `POST /ask/stream` (NDJSON), `POST /report`, `GET /health`.

---

## Data model

MongoDB collections:

- `cases` — `{ id, title, description, status, createdAt }`
- `evidence` — `{ id, caseId, filename, type, status, receivedVia, deliveryId, summary }`
- `entities` — `{ id, caseId, type, label, attributes, evidenceIds[] }` — **upserted on `caseId + type + label`**, so the same entity from two files merges into one node and accumulates its evidence.
- `edges` — `{ id, caseId, from, to, relation, evidenceIds[] }`
- `events` — `{ id, caseId, ts, actorEntityId, description, evidenceId }`

Elasticsearch holds one `evidence_chunks` index (chunked text + metadata) powering keyword search and RAG retrieval.

Entity types (each has a consistent color + glyph across the whole UI): `person`, `phone`, `account`, `organization`, `email`, `location`, `device`.

---

## How extraction works

Extraction is **heuristic-first**, so it runs with no API key. Each line of evidence is read as:

- a leading `YYYY-MM-DD HH:MM` timestamp → a **timeline event**;
- the **first capitalized name** on the line → the **actor**, linked to everything else on that line;
- other names → `person` (or `organization` if the second word is Holdings / Bank / Trust / Ltd / …);
- `+…` digit runs → `phone`; IBANs or `account NNNNNN` → `account`; `x@y.z` → `email`.

When `OPENAI_API_KEY` is set, the LLM enriches evidence summaries and powers Ask-the-Case + reports; otherwise a deterministic, retrieval-grounded fallback is used. The provider sits behind a thin interface in [`services/ai/app/llm.py`](./services/ai/app/llm.py).

**Try it:** in the console click **+ Add evidence** and paste [`seed/sample_evidence.txt`](./seed/sample_evidence.txt) — watch new nodes pulse into the graph and events land on the timeline.

---

