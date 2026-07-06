import type { Entity } from "@caselens/shared";
import type { Store } from "../store/index.js";
import type { SearchIndex } from "../search/searchIndex.js";
import { extract } from "../ai/aiClient.js";
import type { CaseEmitter } from "../socket/emitter.js";

export interface IngestInput {
  caseId: string;
  filename: string;
  type: string;
  content: string;
  receivedVia: "upload" | "webhook";
  deliveryId?: string;
}

function chunk(text: string, size = 500): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks.length ? chunks : [text];
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Orchestrates a single piece of evidence through the pipeline, emitting socket
// events at each stage so the browser animates in real time. Runs async after
// the HTTP handler has already returned 202/200.
export async function ingestEvidence(
  input: IngestInput,
  deps: { store: Store; search: SearchIndex; emitter: CaseEmitter },
): Promise<void> {
  const { store, search, emitter } = deps;

  const evidence = await store.createEvidence({
    caseId: input.caseId,
    filename: input.filename,
    type: (input.type as never) ?? "unknown",
    status: "received",
    receivedVia: input.receivedVia,
    deliveryId: input.deliveryId,
  });

  emitter.emit(input.caseId, "ingestion:started", {
    evidenceId: evidence.id,
    filename: evidence.filename,
  });

  try {
    // ---- parsing ----
    await store.updateEvidence(evidence.id, { status: "parsing" });
    emitter.emit(input.caseId, "ingestion:progress", {
      evidenceId: evidence.id,
      stage: "parsing",
      pct: 20,
    });
    await store.saveEvidenceText(evidence.id, input.content);
    await sleep(150);

    // ---- extraction ----
    await store.updateEvidence(evidence.id, { status: "extracting" });
    emitter.emit(input.caseId, "ingestion:progress", {
      evidenceId: evidence.id,
      stage: "extraction",
      pct: 50,
    });
    const result = await extract({
      caseId: input.caseId,
      filename: input.filename,
      type: input.type,
      content: input.content,
    });

    // Persist entities (upsert-merge). Track label -> id for edge/event linking.
    const idByLabel = new Map<string, Entity>();
    for (const e of result.entities) {
      const { entity, created } = await store.upsertEntity({
        caseId: input.caseId,
        type: e.type,
        label: e.label,
        attributes: e.attributes,
        evidenceIds: [evidence.id],
      });
      idByLabel.set(`${e.type}:${e.label.toLowerCase()}`, entity);
      if (created) {
        emitter.emit(input.caseId, "entity:discovered", {
          entity,
          sourceEvidenceId: evidence.id,
        });
        await sleep(60); // pace the animation so nodes visibly pulse in
      }
    }

    for (const ed of result.edges) {
      const from = idByLabel.get(`${ed.fromType}:${ed.fromLabel.toLowerCase()}`);
      const to = idByLabel.get(`${ed.toType}:${ed.toLabel.toLowerCase()}`);
      if (!from || !to) continue;
      const { edge, created } = await store.upsertEdge({
        caseId: input.caseId,
        from: from.id,
        to: to.id,
        relation: ed.relation,
        evidenceIds: [evidence.id],
      });
      if (created) {
        emitter.emit(input.caseId, "edge:discovered", { edge });
        await sleep(40);
      }
    }

    for (const ev of result.events) {
      const actor = ev.actorLabel
        ? idByLabel.get(`person:${ev.actorLabel.toLowerCase()}`)
        : undefined;
      const event = await store.createEvent({
        caseId: input.caseId,
        ts: ev.ts,
        actorEntityId: actor?.id,
        description: ev.description,
        evidenceId: evidence.id,
      });
      emitter.emit(input.caseId, "event:discovered", { event });
      await sleep(40);
    }

    // ---- indexing ----
    await store.updateEvidence(evidence.id, { status: "indexing" });
    emitter.emit(input.caseId, "ingestion:progress", {
      evidenceId: evidence.id,
      stage: "indexing",
      pct: 80,
    });
    for (const c of chunk(input.content)) {
      await search.indexChunk({
        evidenceId: evidence.id,
        caseId: input.caseId,
        filename: input.filename,
        text: c,
      });
    }

    // ---- complete ----
    await store.updateEvidence(evidence.id, {
      status: "complete",
      summary: result.summary,
    });
    emitter.emit(input.caseId, "ingestion:complete", {
      evidenceId: evidence.id,
      summary: result.summary,
    });
  } catch (err) {
    console.error(`[ingest] failed for ${evidence.id}:`, err);
    await store.updateEvidence(evidence.id, { status: "failed" });
    emitter.emit(input.caseId, "ingestion:complete", {
      evidenceId: evidence.id,
      summary: `Ingestion failed: ${(err as Error).message}`,
    });
  }
}
