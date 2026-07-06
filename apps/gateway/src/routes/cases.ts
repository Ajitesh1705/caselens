import { Router } from "express";
import { z } from "zod";
import type { Store } from "../store/index.js";

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().default(""),
  status: z.enum(["open", "active", "closed"]).default("active"),
});

export function caseRouter(deps: { store: Store }): Router {
  const router = Router();

  // GET /cases
  router.get("/", async (_req, res) => {
    res.json(await deps.store.listCases());
  });

  // POST /cases
  router.post("/", async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues });
    }
    const created = await deps.store.createCase(parsed.data);
    res.status(201).json(created);
  });

  // GET /cases/:id/graph — entities, edges, events, evidence for the console.
  router.get("/:id/graph", async (req, res) => {
    const graph = await deps.store.getGraph(req.params.id);
    if (!graph) return res.status(404).json({ error: "case not found" });
    res.json(graph);
  });

  return router;
}
