import { Router, type Request } from "express";
import { z } from "zod";
import { request as httpRequest } from "undici";
import type { Store } from "../store/index.js";
import type { SearchIndex } from "../search/searchIndex.js";
import type { CaseEmitter } from "../socket/emitter.js";
import { verifySignature } from "../webhook/signature.js";
import { ingestEvidence } from "../ingest/ingestService.js";
import { config } from "../config.js";

const payloadSchema = z.object({
  caseId: z.string().min(1),
  filename: z.string().min(1),
  type: z.string().optional(),
  content: z.string().optional(),
  contentBase64: z.string().optional(),
  contentUrl: z.string().url().optional(),
});

// Resolves the evidence text from inline content, base64, or a fetchable URL.
async function resolveContent(
  p: z.infer<typeof payloadSchema>,
): Promise<string> {
  if (p.content) return p.content;
  if (p.contentBase64) return Buffer.from(p.contentBase64, "base64").toString("utf8");
  if (p.contentUrl) {
    const res = await httpRequest(p.contentUrl);
    return res.body.text();
  }
  throw new Error("no content provided");
}

export function webhookRouter(deps: {
  store: Store;
  search: SearchIndex;
  emitter: CaseEmitter;
}): Router {
  const router = Router();

  // POST /webhooks/evidence-uploaded
  router.post("/evidence-uploaded", async (req: Request, res) => {
    const raw = (req as Request & { rawBody?: Buffer }).rawBody ?? Buffer.from("");

    // 1. Verify HMAC signature over the raw body before doing any work.
    if (!verifySignature(raw, req.header("X-Signature"), config.webhookSecret)) {
      return res.status(401).json({ error: "invalid signature" });
    }

    // 2. Validate payload shape.
    const parsed = payloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid payload", details: parsed.error.issues });
    }
    const payload = parsed.data;

    // 3. Confirm the case exists.
    const found = await deps.store.getCase(payload.caseId);
    if (!found) return res.status(404).json({ error: "case not found" });

    // 4. Idempotency: dedupe on X-Delivery-Id.
    const deliveryId = req.header("X-Delivery-Id");
    if (deliveryId) {
      const existing = await deps.store.findEvidenceByDeliveryId(
        payload.caseId,
        deliveryId,
      );
      if (existing) {
        return res
          .status(200)
          .json({ status: "duplicate", evidenceId: existing.id });
      }
    }

    let content: string;
    try {
      content = await resolveContent(payload);
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }

    // 5. Accept immediately, process async (correct webhook semantics).
    res.status(202).json({ status: "accepted" });

    void ingestEvidence(
      {
        caseId: payload.caseId,
        filename: payload.filename,
        type: payload.type ?? "unknown",
        content,
        receivedVia: "webhook",
        deliveryId,
      },
      deps,
    );
  });

  return router;
}
