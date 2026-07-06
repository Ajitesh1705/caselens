# CaseLens — Architecture & Build Plan
### A Gen-AI Digital Forensics Investigation Console (demo for CerebralZip Full Stack Developer role)

---

## 1. Why this demo

CerebralZip builds AI-powered data analytics software for the forensics industry: a platform that ingests large datasets, lets investigators analyze linkages and identify leads, search across documents and images, walk through timelines of events, and generate AI insights and reports. Their JD asks for React, Tailwind, TypeScript, Node/Express, Python/FastAPI, Docker, Git workflows, WebSockets and Webhooks (explicitly flagged as must-haves), Elasticsearch/MongoDB, CI/CD, and GCP.

CaseLens is a deliberately scoped mini-version of that exact product category. Instead of proving each skill in isolation, every JD requirement appears **in the context of their own domain** — which signals product understanding, not just stack familiarity.

**The one-line pitch in your application:** *"I built a working slice of your product — live demo on Cloud Run, `docker-compose up` to run locally, README documents the WebSocket protocol and webhook contract."*

---

## 2. Product concept

An investigator opens a **case**. Evidence arrives (chat exports, call detail records, documents, transaction logs) either by upload or via an external system firing a **webhook**. A processing pipeline extracts **entities** (people, phone numbers, bank accounts, locations, devices) and **events** (timestamped actions), then streams them to the investigator's browser over **WebSocket** — nodes animate into a link graph in real time as evidence is processed. The investigator explores the graph, filters the timeline, searches evidence full-text, asks natural-language questions over the case ("who contacted the suspect between March 3–5?"), and generates a one-click AI case report.

Everything runs on synthetic, clearly-fictional case data (e.g., a mock financial fraud investigation) — no real PII, no real forensic material. This matters: it shows judgment, and it keeps the demo shareable.

---

## 3. System architecture

```
                                  ┌──────────────────────────────┐
  External system                 │        Browser (React)        │
  (simulated w/ curl │            │  Link Graph · Timeline ·      │
   or a small script)│            │  Evidence Search · AI Chat ·  │
          │          │            │  Live Ingestion Feed          │
          │ POST /webhooks/       └───────┬───────────▲──────────┘
          │ evidence-uploaded             │ REST      │ WebSocket
          ▼                               ▼           │ (Socket.IO / ws)
  ┌──────────────────────────────────────────────────────────────┐
  │              API Gateway — Node.js / Express (TypeScript)    │
  │  · REST API (cases, evidence, entities, events, search)      │
  │  · WebSocket server (case rooms, ingestion progress events)  │
  │  · Webhook receiver (HMAC-signature verified)                │
  │  · Job orchestration (enqueue evidence for processing)       │
  └───────────────┬──────────────────────────┬───────────────────┘
                  │ HTTP (internal)          │
                  ▼                          ▼
  ┌───────────────────────────┐   ┌──────────────────────────────┐
  │  AI Service — FastAPI     │   │        Data layer             │
  │  (Python)                 │   │  MongoDB — cases, evidence,   │
  │  · Entity extraction      │   │  entities, events, edges      │
  │  · Event extraction       │   │                               │
  │  · Embeddings for RAG     │   │  Elasticsearch — full-text +  │
  │  · "Ask the Case" (RAG)   │   │  vector search over evidence  │
  │  · Report generation      │   │  (option: Mongo Atlas Search  │
  │    (LLM API)              │   │   to cut one container)       │
  └───────────────────────────┘   └──────────────────────────────┘
```

**Why two backends:** the JD lists Node/Express as the primary backend skill *and* "basic working knowledge of Python and FastAPI." Splitting the AI workload into a FastAPI microservice demonstrates both, plus a clean service boundary — the gateway owns state and realtime, the AI service is stateless compute. This is also how their real product almost certainly works (JS product surface + Python ML core).

**LLM choice:** call a hosted LLM API (Claude/OpenAI/Gemini) for extraction, Q&A and report generation. Keep the provider behind a thin interface in the FastAPI service so the README can say "provider-agnostic." For entity extraction you can add a regex/heuristic fallback (phone numbers, IBANs, emails) so the demo works even with no API key — a nice resilience touch to mention.

---

## 4. The two must-haves, done properly

### WebSockets — live ingestion feed
This is the centerpiece because they flagged it as non-negotiable.

Protocol (documented in the README as a mini-spec):

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
| server → client | `chat:token` | `{ token }` | **Streamed** LLM answer |

Two details that make it look senior: **rooms per case** (bi-directional, multi-client — open two browser tabs during the interview demo and watch both update), and **streaming the AI answer token-by-token over the same socket** rather than polling.

### Webhooks — evidence-uploaded contract
`POST /webhooks/evidence-uploaded` with a JSON body (`caseId`, `filename`, `contentUrl` or inline base64) and an `X-Signature` header — HMAC-SHA256 over the raw body with a shared secret, verified before processing. Return `202 Accepted` immediately and process async (correct webhook semantics). Include idempotency via an `X-Delivery-Id` dedup check.

The README ships a copy-paste `curl` that fires the webhook and tells the reader to watch entities stream into the open browser. That 10-second loop — curl → graph animates — **is** the demo.

---

## 5. Frontend (React + Tailwind + TypeScript)

Single-page console, dark "operations room" aesthetic (matches the forensics/intel vibe of their brand). Four working areas plus a persistent feed:

**Link graph** — force-directed graph (d3-force or react-force-graph) of entities. Node shape/color by type (person, phone, account, location, device). Click a node → side panel with its evidence citations and connected entities. New nodes pulse in when discovered over the socket. This is the direct analogue of their "analyze linkages and identify leads" dashboard.

**Timeline** — horizontal zoomable event timeline (calls, transactions, messages). Brushing a time range filters the graph to entities active in that window — the graph↔timeline cross-filter is the "wow" interaction.

**Evidence & search** — evidence list with processing status, plus a search bar hitting Elasticsearch (full-text with highlighted snippets; add semantic/vector search if time allows).

**Ask the Case + Report** — chat panel with streamed answers that cite evidence IDs (each citation clickable → opens the evidence). A "Generate Case Report" button producing a structured markdown report (summary, key entities, chronology, leads to pursue) rendered in-app with export.

**Live ingestion feed** — slim right-rail ticker of `ingestion:*` events, giving the whole app a "system is alive" feel.

State management with React Query (server state) + Zustand or Context (UI state) — covers the JD's "Hooks, Context API, state management" line explicitly. Fully responsive per their "responsiveness across devices" bullet.

---

## 6. Data model (MongoDB)

Five collections, kept deliberately simple:

- `cases` — `{ _id, title, description, status, createdAt }`
- `evidence` — `{ _id, caseId, filename, type, status, rawTextRef, receivedVia: 'upload'|'webhook', deliveryId }`
- `entities` — `{ _id, caseId, type, label, attributes, evidenceIds[] }` (upsert on `caseId+type+label` so the same phone number from two files merges into one node)
- `edges` — `{ _id, caseId, from, to, relation, evidenceIds[] }`
- `events` — `{ _id, caseId, ts, actorEntityId, description, evidenceId }`

Elasticsearch holds one `evidence_chunks` index (chunked text + embedding vector + metadata) powering both keyword search and RAG retrieval.

---

## 7. Repo, Docker, CI/CD, GCP

```
caselens/
├── apps/
│   ├── web/          # React + Vite + Tailwind + TS
│   └── gateway/      # Express + TS + Socket.IO
├── services/
│   └── ai/           # FastAPI + Python
├── packages/
│   └── shared/       # shared TS types (socket events, API DTOs)
├── seed/             # synthetic case data + webhook-firing script
├── docker-compose.yml
├── .github/workflows/ci.yml
└── README.md         # architecture diagram, socket spec, webhook contract, demo script
```

**Docker:** multi-stage Dockerfiles for all three apps (build → slim runtime, non-root user). `docker-compose up` starts web, gateway, ai, mongo, elasticsearch with healthchecks and a seed step. One command to a running investigation — that alone answers the entire Docker section of the JD.

**Git hygiene as a portfolio artifact:** since they call out branching strategies and PRs, work in feature branches, open real PRs against your own repo with descriptive bodies, and use conventional commits. Reviewers *will* look at the commit history.

**CI (GitHub Actions):** on PR — lint (eslint + ruff), typecheck, unit tests (Vitest for web/gateway, pytest for ai), and Docker builds. On merge to main — build images, push to Artifact Registry, deploy to Cloud Run.

**GCP deploy (the killer touch):** gateway + ai on **Cloud Run** (min-instances=1 on the gateway so WebSockets stay warm; Cloud Run supports WebSockets natively), web as static hosting (Firebase Hosting or Cloud Run), MongoDB Atlas free tier + Elastic Cloud trial (or Mongo Atlas Search to consolidate). Total cost ≈ free tier. The live URL goes at the top of the application email.

**Testing scope (be strategic, not exhaustive):** unit tests for the webhook signature/idempotency logic, the entity-merge upsert, and one socket integration test (emit → assert client receives). Quality over coverage.

---

## 8. Build phases

| Phase | Scope | Est. effort |
|---|---|---|
| **1. Skeleton** | Monorepo, all three apps hello-world, docker-compose with Mongo+ES, CI green | 1 day |
| **2. Ingestion core** | Webhook endpoint (HMAC + idempotency), upload endpoint, FastAPI extraction (LLM + regex fallback), persistence, ES indexing | 1–2 days |
| **3. Realtime** | Socket rooms, full event protocol, live ingestion feed UI | 1 day |
| **4. Console UI** | Link graph, timeline, cross-filtering, evidence search, polish pass with Tailwind | 2–3 days |
| **5. AI layer** | Ask-the-Case RAG with streamed cited answers, report generation | 1–2 days |
| **6. Ship** | Cloud Run deploy, seed data + demo script, README with diagrams, screen recording | 1 day |

Roughly **7–10 focused days** end-to-end. If time is short, the minimum lovable demo is Phases 1–4 + report generation — realtime graph + webhook loop is what makes jaws drop; RAG chat is the upgrade.

**De-scoped on purpose** (mention in README as "production next steps" — shows maturity): auth/RBAC (their product has access control — stub a role switcher at most), image evidence OCR, Kubernetes (compose is enough; mention GKE as the scaling path), message queue (in-process job queue is fine at demo scale).

---

## 9. The 3-minute demo script (for the interview / video)

1. Open the deployed URL — case dashboard with partially-populated fraud case.
2. Open a second browser window side-by-side (proves multi-client realtime).
3. Fire the webhook `curl` from a terminal — narrate the HMAC signature.
4. Both windows: ingestion feed ticks, entities and edges animate into the graph, events drop onto the timeline.
5. Brush the timeline to a suspicious 48-hour window — graph filters to the active entities; point at the new lead.
6. Ask the Case: "Summarize all contact between R. Mehta and the offshore account" — answer streams in with clickable evidence citations.
7. Click "Generate Report" — structured case report appears.
8. Close: "docker-compose up runs all of this locally; CI deploys it to Cloud Run on merge."

---

## 10. JD coverage map

| JD requirement | Where it lives in CaseLens |
|---|---|
| React (Hooks, Context, state mgmt) | Entire console; React Query + Context/Zustand |
| Tailwind CSS | Full UI, responsive |
| JavaScript/TypeScript | Web + gateway in strict TS; shared types package |
| Node.js/Express backend | API gateway |
| **WebSockets (must-have)** | Live ingestion protocol, case rooms, streamed AI answers |
| **Webhooks (must-have)** | Signed, idempotent evidence-uploaded endpoint |
| Python + FastAPI | AI microservice |
| MongoDB / Elasticsearch | Case store + search/RAG index |
| Docker / docker-compose | Multi-stage builds, one-command stack |
| Git workflows | Feature branches, real PRs, conventional commits |
| REST API design | Documented gateway API |
| CI/CD | GitHub Actions → Cloud Run |
| GCP (plus) | Cloud Run, Artifact Registry |
| Testing | Vitest + pytest + socket integration test |
| Debugging/production mindset | Healthchecks, idempotency, LLM fallback path |
| Web security (good-to-have) | HMAC webhook auth, input validation, non-root containers |
| Gen AI (their actual product) | Extraction, RAG Q&A with citations, report generation |