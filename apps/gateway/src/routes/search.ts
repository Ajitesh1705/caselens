import { Router } from "express";
import type { SearchIndex } from "../search/searchIndex.js";
import type { SearchResponse } from "@caselens/shared";

export function searchRouter(deps: { search: SearchIndex }): Router {
  const router = Router({ mergeParams: true });

  // GET /cases/:caseId/search?q=...
  router.get("/", async (req, res) => {
    const caseId = (req.params as { caseId: string }).caseId;
    const q = String(req.query.q ?? "").trim();
    if (!q) {
      const empty: SearchResponse = { query: "", hits: [] };
      return res.json(empty);
    }
    const hits = await deps.search.search(caseId, q, 15);
    const response: SearchResponse = { query: q, hits };
    res.json(response);
  });

  return router;
}
