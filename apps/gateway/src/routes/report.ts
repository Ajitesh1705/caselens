import { Router } from "express";
import type { Store } from "../store/index.js";
import { report } from "../ai/aiClient.js";
import type { ReportResponse } from "@caselens/shared";

export function reportRouter(deps: { store: Store }): Router {
  const router = Router({ mergeParams: true });

  // POST /cases/:caseId/report — generate a structured markdown case report.
  router.post("/", async (req, res) => {
    const caseId = (req.params as { caseId: string }).caseId;
    const graph = await deps.store.getGraph(caseId);
    if (!graph) return res.status(404).json({ error: "case not found" });

    const { markdown } = await report({
      caseTitle: graph.case.title,
      entities: graph.entities.map((e) => ({ type: e.type, label: e.label })),
      events: graph.events.map((e) => ({ ts: e.ts, description: e.description })),
      evidenceCount: graph.evidence.length,
    });

    const response: ReportResponse = {
      caseId,
      markdown,
      generatedAt: new Date().toISOString(),
    };
    res.json(response);
  });

  return router;
}
