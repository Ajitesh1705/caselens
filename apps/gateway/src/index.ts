import { createServer } from "node:http";
import { existsSync } from "node:fs";
import path from "node:path";
import express, { type Request } from "express";
import cors from "cors";
import { config } from "./config.js";
import { createStore } from "./store/index.js";
import { createSearchIndex } from "./search/searchIndex.js";
import { createSocketServer } from "./socket/socketServer.js";
import { caseRouter } from "./routes/cases.js";
import { evidenceRouter } from "./routes/evidence.js";
import { searchRouter } from "./routes/search.js";
import { reportRouter } from "./routes/report.js";
import { webhookRouter } from "./routes/webhooks.js";
import { bootstrapSeed } from "./seed/bootstrap.js";

async function main(): Promise<void> {
  const store = await createStore();
  const search = await createSearchIndex();

  const app = express();
  app.use(cors({ origin: config.corsOrigin }));

  // Capture the raw body so the webhook route can verify the HMAC signature.
  app.use(
    express.json({
      limit: "10mb",
      verify: (req, _res, buf) => {
        (req as Request & { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );

  const httpServer = createServer(app);
  const { emitter } = createSocketServer(httpServer, { store, search });
  const deps = { store, search, emitter };

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      store: store.kind,
      search: search.kind,
      time: new Date().toISOString(),
    });
  });

  app.use("/webhooks", webhookRouter(deps));
  app.use("/cases", caseRouter({ store }));
  app.use("/cases/:caseId/evidence", evidenceRouter(deps));
  app.use("/cases/:caseId/search", searchRouter({ search }));
  app.use("/cases/:caseId/report", reportRouter({ store }));

  // In production the gateway also serves the built web console (same origin,
  // so no CORS and WebSockets just work). Registered after the API routes.
  const webDist = process.env.WEB_DIST ?? path.resolve(process.cwd(), "web");
  if (existsSync(path.join(webDist, "index.html"))) {
    app.use(express.static(webDist));
    app.get("*", (req, res, next) => {
      if (req.method !== "GET") return next();
      res.sendFile(path.join(webDist, "index.html"));
    });
    console.log(`[gateway] serving web console from ${webDist}`);
  }

  httpServer.listen(config.port, () => {
    console.log(`[gateway] listening on :${config.port}`);
    console.log(`[gateway] store=${store.kind} search=${search.kind}`);
    // Seed after the server is accepting connections so health checks pass fast
    // and clients can watch the seed stream in over the socket.
    void bootstrapSeed(deps);
  });
}

main().catch((err) => {
  console.error("[gateway] fatal:", err);
  process.exit(1);
});
