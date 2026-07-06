import type { Store } from "../store/index.js";
import type { SearchIndex } from "../search/searchIndex.js";
import type { CaseEmitter } from "../socket/emitter.js";
import { ingestEvidence } from "../ingest/ingestService.js";
import { MERIDIAN_CASE, BOOT_EVIDENCE } from "./data.js";

// On an empty store, create the Meridian case and ingest the boot evidence so
// the console opens with a partially-populated graph. Idempotent: skips if any
// case already exists. Exposes the created case id for the demo script.
export async function bootstrapSeed(deps: {
  store: Store;
  search: SearchIndex;
  emitter: CaseEmitter;
}): Promise<void> {
  const existing = await deps.store.listCases();
  if (existing.length > 0) {
    console.log(`[seed] ${existing.length} case(s) present; skipping bootstrap`);
    return;
  }

  const created = await deps.store.createCase(MERIDIAN_CASE);
  console.log(`[seed] created case "${created.title}" (${created.id})`);

  // Ingest sequentially so the merge-on-label logic is deterministic.
  for (const ev of BOOT_EVIDENCE) {
    await ingestEvidence(
      {
        caseId: created.id,
        filename: ev.filename,
        type: ev.type,
        content: ev.content,
        receivedVia: "upload",
      },
      deps,
    );
  }
  console.log(`[seed] ingested ${BOOT_EVIDENCE.length} boot evidence files`);
}
