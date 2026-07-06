# CaseLens — Design Spec

**Date:** 2026-07-06
**Status:** Approved for implementation planning
**Source:** `plan.md` (architecture & build plan)

A Gen-AI digital forensics investigation console — a deliberately-scoped mini-version of CerebralZip's product category, built as a portfolio demo for a Full Stack Developer application. Every JD requirement (React/Tailwind/TS, Node/Express, WebSockets, Webhooks, Python/FastAPI, MongoDB, Elasticsearch, Docker, CI/CD, GCP) appears *in the context of the forensics domain*.

## 1. Scope for this build

**Full vertical slice — all 6 phases**, with the honest caveat that a one-session build trades some depth for breadth. Depth is concentrated on the demo-critical loop: **webhook → extraction → WebSocket → animated link graph**. Outer edges (GCP deploy, CI) are delivered as *correct, real config* but not executed against live cloud (no GCP creds available in the build environment).

### Environment constraints (build-time)
- node 25, pnpm 10, python 3.11, docker installed (daemon may be down), git available.
- **No LLM API keys present.** The system must run fully without keys.

## 2. Product concept

An investigator opens a **case**. Evidence arrives (chat exports, call detail records, documents, transaction logs) by upload or via an external system firing a **webhook**. A pipeline extracts **entities** (people, phones, bank accounts, locations, devices) and **events** (timestamped actions), then streams them to the browser over **WebSocket** — nodes animate into a link graph in real time. The investigator explores the graph, filters the timeline, searches evidence full-text, asks natural-language questions over the case, and generates a one-click AI case report.

All data is synthetic and clearly fictional (a mock financial-fraud investigation, the "Meridian" case) — no real PII.

## 3. System architecture

Three services + two data stores, orchestrated by docker-compose:

- **`apps/web`** — React + Vite + Tailwind + TypeScript. The single-page console.
- **`apps/gateway`** — Node.js + Express + TypeScript + Socket.IO. Owns REST API, WebSocket server (case rooms), webhook receiver (HMAC-verified), and job orchestration. Owns all state and realtime.
- **`services/ai`** — Python + FastAPI. Stateless compute: entity/event extraction, embeddings, RAG "Ask the Case", report generation. Provider-agnostic `LLMClient` with a heuristic fallback.
- **`packages/shared`** — shared TypeScript types (socket event contracts, API DTOs) consumed by web + gateway.
- **MongoDB** — cases, evidence, entities, edges, events.
- **Elasticsearch** — `evidence_chunks` index (chunked text + embedding vector + metadata) for keyword search and RAG retrieval.

**Data flow (ingestion):** webhook/upload → gateway validates (HMAC + idempotency) → returns `202` → gateway calls AI service extraction (internal HTTP) → gateway persists entities/edges/events to Mongo (upsert-merge) + indexes chunks to ES → gateway emits socket events to the case room as each artifact lands.

## 4. LLM strategy

- **Provider-agnostic `LLMClient` interface** in the AI service. **Default provider: OpenAI** when `OPENAI_API_KEY` is set.
- **Heuristic-first extraction:** regex/deterministic extractors for phone numbers, IBANs/account numbers, emails, and known-name matching run *always* and are the sole path when no key is present. LLM augments extraction when keyed.
- **RAG + report generation:** use the LLM when keyed; otherwise a deterministic template fallback (retrieval-based summary) so the demo never breaks.
- Embeddings: OpenAI embeddings when keyed; a deterministic local hashing/TF fallback vector otherwise (keeps ES vector field populated for the demo).

## 5. The two must-haves

### WebSockets — live ingestion feed (centerpiece)
Socket.IO, **rooms per case** (multi-client: two tabs both update). Documented protocol:

| Direction | Event | Payload | Purpose |
|---|---|---|---|
| client → server | `case:join` | `{ caseId }` | Subscribe to a case room |
| server → client | `ingestion:started` | `{ evidenceId, filename }` | New evidence entered pipeline |
| server → client | `ingestion:progress` | `{ evidenceId, stage, pct }` | Parsing → extraction → indexing |
| server → client | `entity:discovered` | `{ entity, sourceEvidenceId }` | Node animates into the graph |
| server → client | `edge:discovered` | `{ from, to, relation }` | Link animates into the graph |
| server → client | `event:discovered` | `{ event }` | Dot appears on the timeline |
| server → client | `ingestion:complete` | `{ evidenceId, summary }` | Feed entry finalized |
| client → server | `chat:ask` | `{ caseId, question }` | Ask-the-Case query |
| server → client | `chat:token` | `{ token }` | Streamed LLM answer token |
| server → client | `chat:done` | `{ citations }` | Answer complete + evidence citations |

Streaming the AI answer token-by-token over the same socket (not polling).

### Webhooks — evidence-uploaded contract
`POST /webhooks/evidence-uploaded`, JSON body (`caseId`, `filename`, `contentUrl` or inline base64), `X-Signature` header = HMAC-SHA256 over the raw body with a shared secret, verified before processing. Returns `202 Accepted` immediately, processes async. Idempotency via `X-Delivery-Id` dedup check (stored on evidence). README ships a copy-paste `curl`.

## 6. Frontend

Single-page console, dark "operations room" aesthetic (frontend-design skill to be applied during implementation). Four working areas + persistent feed:

- **Link graph** — `react-force-graph-2d`; node shape/color by type; click → side panel with evidence citations + connected entities; new nodes pulse in over the socket.
- **Timeline** — horizontal zoomable event timeline; brushing a time range cross-filters the graph to entities active in that window (the "wow" interaction).
- **Evidence & search** — evidence list with processing status + search bar hitting ES (full-text, highlighted snippets; semantic/vector if time allows).
- **Ask the Case + Report** — chat panel with streamed, evidence-citing answers (citations clickable → open evidence); "Generate Case Report" button → structured markdown report rendered in-app with export.
- **Live ingestion feed** — right-rail ticker of `ingestion:*` events.

State: **React Query (server state) + Zustand (UI/selection state)**. Fully responsive.

## 7. Data model (MongoDB)

- `cases` — `{ _id, title, description, status, createdAt }`
- `evidence` — `{ _id, caseId, filename, type, status, rawTextRef, receivedVia: 'upload'|'webhook', deliveryId }`
- `entities` — `{ _id, caseId, type, label, attributes, evidenceIds[] }` — **upsert on `caseId+type+label`** so the same phone/account from two files merges into one node.
- `edges` — `{ _id, caseId, from, to, relation, evidenceIds[] }`
- `events` — `{ _id, caseId, ts, actorEntityId, description, evidenceId }`

Elasticsearch: one `evidence_chunks` index (chunked text + embedding vector + metadata).

## 8. Repo, Docker, CI/CD, GCP

```
caselens/
├── apps/
│   ├── web/          # React + Vite + Tailwind + TS
│   └── gateway/      # Express + TS + Socket.IO
├── services/
│   └── ai/           # FastAPI + Python
├── packages/
│   └── shared/       # shared TS types
├── seed/             # synthetic Meridian case data + webhook-firing script
├── docker-compose.yml
├── .github/workflows/ci.yml
├── deploy/           # Cloud Run + Artifact Registry config
└── README.md         # arch diagram, socket spec, webhook contract, demo script
```

- **Docker:** multi-stage Dockerfiles (build → slim runtime, non-root user) for all three apps. `docker-compose up` starts web, gateway, ai, mongo, elasticsearch with healthchecks + a seed step.
- **Git hygiene:** feature branches, conventional commits, real PR-style history (portfolio artifact).
- **CI (GitHub Actions):** PR → lint (eslint + ruff), typecheck, unit tests (Vitest for web/gateway, pytest for ai), Docker builds. Merge → build/push images to Artifact Registry, deploy to Cloud Run. (Config authored; live deploy not executed in build env.)
- **GCP:** gateway + ai on Cloud Run (gateway `min-instances=1` to keep WebSockets warm), web as static/Cloud Run. Config only.
- **Testing (strategic):** unit tests for webhook signature + idempotency, the entity-merge upsert, and one socket integration test (emit → assert client receives). Quality over coverage.

## 9. Build phases (sequencing)

1. **Skeleton** — monorepo, all three apps boot, docker-compose (mongo+es+3 services), CI config, `git init`.
2. **Ingestion core** — webhook (HMAC + idempotency) + upload → FastAPI extraction (heuristic + LLM) → Mongo persist (upsert-merge) + ES index.
3. **Realtime** — socket rooms, full event protocol, live ingestion feed UI.
4. **Console UI** — link graph, timeline, graph↔timeline cross-filter, evidence search, dark-theme polish.
5. **AI layer** — Ask-the-Case RAG with streamed cited answers, report generation.
6. **Ship** — Cloud Run/Artifact Registry deploy config, seed data + demo script, README with diagrams.

Each phase ends at a runnable/committable state.

## 10. De-scoped on purpose (README "production next steps")

Auth/RBAC (stub a role switcher at most), image evidence OCR, Kubernetes/GKE, message queue (in-process job queue is fine at demo scale).

## 11. JD coverage map

| JD requirement | Where in CaseLens |
|---|---|
| React (Hooks, Context, state mgmt) | Console; React Query + Zustand |
| Tailwind CSS | Full UI, responsive |
| JS/TypeScript | Web + gateway strict TS; shared types package |
| Node.js/Express | API gateway |
| **WebSockets (must-have)** | Live ingestion protocol, case rooms, streamed AI answers |
| **Webhooks (must-have)** | Signed, idempotent evidence-uploaded endpoint |
| Python + FastAPI | AI microservice |
| MongoDB / Elasticsearch | Case store + search/RAG index |
| Docker / docker-compose | Multi-stage builds, one-command stack |
| Git workflows | Feature branches, real PRs, conventional commits |
| REST API design | Documented gateway API |
| CI/CD | GitHub Actions → Cloud Run |
| GCP (plus) | Cloud Run, Artifact Registry (config) |
| Testing | Vitest + pytest + socket integration test |
| Debugging/production mindset | Healthchecks, idempotency, LLM fallback path |
| Web security (good-to-have) | HMAC webhook auth, input validation, non-root containers |
| Gen AI (their product) | Extraction, RAG Q&A with citations, report generation |
