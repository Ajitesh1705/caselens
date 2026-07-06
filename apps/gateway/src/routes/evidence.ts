import { Router } from "express";
import { z } from "zod";
import type { Store } from "../store/index.js";
import type { SearchIndex } from "../search/searchIndex.js";
import type { CaseEmitter } from "../socket/emitter.js";
import { ingestEvidence } from "../ingest/ingestService.js";

const uploadSchema = z.object({
  filename: z.string().min(1),
  type: z.string().optional(),
  content: z.string().min(1),
});

export function evidenceRouter(deps: {
  store: Store;
  search: SearchIndex;
  emitter: CaseEmitter;
}): Router {
  const router = Router({ mergeParams: true });

  // POST /cases/:caseId/evidence — direct upload (mirrors the webhook path).
  router.post("/", async (req, res) => {
    const caseId = (req.params as { caseId: string }).caseId;
    const found = await deps.store.getCase(caseId);
    if (!found) return res.status(404).json({ error: "case not found" });

    const parsed = uploadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues });
    }

    res.status(202).json({ status: "accepted" });

    void ingestEvidence(
      {
        caseId,
        filename: parsed.data.filename,
        type: parsed.data.type ?? "unknown",
        content: parsed.data.content,
        receivedVia: "upload",
      },
      deps,
    );
  });

  return router;
}
