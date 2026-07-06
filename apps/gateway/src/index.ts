import { createServer } from "node:http";
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

  await bootstrapSeed(deps);

  httpServer.listen(config.port, () => {
    console.log(`[gateway] listening on :${config.port}`);
    console.log(`[gateway] store=${store.kind} search=${search.kind}`);
  });
}

main().catch((err) => {
  console.error("[gateway] fatal:", err);
  process.exit(1);
});
