# Deploying CaseLens to Render

CaseLens deploys as **two always-on Docker services** defined in [`render.yaml`](./render.yaml):

| Service | What it is | Public? |
|---|---|---|
| `caselens` | Gateway — serves the web console + REST API + WebSocket | ✅ this is the URL you share |
| `caselens-ai` | FastAPI extraction / RAG / report service | ✅ (gateway calls it) |

The gateway serves the built React console itself, so everything the browser needs is **same-origin** — no CORS, and WebSockets work out of the box. Data runs in the gateway's in-memory mode (the Meridian case re-seeds on boot); see [Persistent data](#optional-persistent-data) to add MongoDB.

## 1. Push the repo to GitHub

Render deploys from a Git repo.

```bash
git add -A
git commit -m "chore: add Render deploy config"
gh repo create caselens --public --source=. --push   # or create a repo in the UI and push
```

## 2. Create the Blueprint on Render

1. Go to **dashboard.render.com → New → Blueprint**.
2. Connect your GitHub and pick the `caselens` repo.
3. Render reads `render.yaml` and shows both services. Click **Apply**.

## 3. Set your OpenAI key

On the **caselens-ai** service → **Environment** → set:

- `OPENAI_API_KEY` = your key

(Without it, Ask/Report still work using the deterministic fallback — the demo never breaks.) `WEBHOOK_SECRET` is pre-set to `caselens-demo-secret`; change it in the **caselens** service env if you like.

## 4. Open it

When both services go green, open the **caselens** service URL, e.g. `https://caselens.onrender.com`. The Meridian case loads with a partially-populated graph.

> Free instances sleep after ~15 min idle; the first request cold-starts (~30 s).

## 5. Run the live webhook demo

From your terminal (uses the deployed URL + secret). This signs the body with HMAC-SHA256 and fires the webhook; watch entities stream into the open browser graph:

```bash
BASE="https://caselens.onrender.com"        # your caselens URL
SECRET="caselens-demo-secret"                # WEBHOOK_SECRET
CASE=$(curl -s "$BASE/cases" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d)[0].id))")
BODY=$(node -e "console.log(JSON.stringify({caseId:process.argv[1],filename:'wire_transfers.txt',type:'transaction',content:'2026-03-09 10:15 Rohit Mehta wired USD 180,000 to account KW81CBKU0000000000007777\n2026-03-09 10:40 Elena Roy called Rohit Mehta +44 7700 900733'}))" "$CASE")
SIG=$(node -e "console.log(require('crypto').createHmac('sha256',process.argv[2]).update(process.argv[1]).digest('hex'))" "$BODY" "$SECRET")
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/webhooks/evidence-uploaded" \
  -H "content-type: application/json" -H "X-Signature: sha256=$SIG" \
  -H "X-Delivery-Id: demo-$(date +%s)" -d "$BODY"
```

You can also click **+ Add evidence** in the console to paste/upload a document.

## Optional: persistent data (MongoDB Atlas)

In-memory mode resets on redeploy. To persist across deploys:

1. Create a free **MongoDB Atlas** cluster; copy its connection string.
2. On the **caselens** service, add env `MONGO_URL=<your srv connection string>`.
3. Redeploy. The gateway auto-detects Mongo and uses it (falls back to memory if unreachable).

Elasticsearch is optional — search falls back to an in-memory index when `ES_URL` is unset. Point `ES_URL` at an Elastic Cloud deployment to enable it.

## Local full stack (Mongo + Elasticsearch)

To run the complete stack locally with real Mongo + ES:

```bash
OPENAI_API_KEY=sk-... docker compose up --build
# open http://localhost:4000
```
