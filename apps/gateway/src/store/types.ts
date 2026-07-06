import type {
  Case,
  Entity,
  Edge,
  CaseEvent,
  Evidence,
  CaseGraphResponse,
} from "@caselens/shared";

// Storage abstraction. Two implementations exist: MongoStore (production path)
// and MemoryStore (fallback so the demo runs with no database). Consumers depend
// only on this interface.
export interface Store {
  readonly kind: "mongo" | "memory";

  init(): Promise<void>;

  listCases(): Promise<Case[]>;
  getCase(caseId: string): Promise<Case | null>;
  createCase(input: Omit<Case, "id" | "createdAt">): Promise<Case>;

  getGraph(caseId: string): Promise<CaseGraphResponse | null>;

  createEvidence(input: Omit<Evidence, "id" | "createdAt">): Promise<Evidence>;
  updateEvidence(
    evidenceId: string,
    patch: Partial<Pick<Evidence, "status" | "summary" | "type">>,
  ): Promise<void>;
  getEvidence(caseId: string, evidenceId: string): Promise<Evidence | null>;
  findEvidenceByDeliveryId(
    caseId: string,
    deliveryId: string,
  ): Promise<Evidence | null>;

  // Upsert-merge on (caseId, type, label): appends the source evidence id.
  upsertEntity(
    input: Omit<Entity, "id">,
  ): Promise<{ entity: Entity; created: boolean }>;

  // Merge on (caseId, from, to, relation).
  upsertEdge(
    input: Omit<Edge, "id">,
  ): Promise<{ edge: Edge; created: boolean }>;

  createEvent(input: Omit<CaseEvent, "id">): Promise<CaseEvent>;

  // Full-text-ish retrieval used by RAG when ES is unavailable.
  evidenceText(caseId: string): Promise<{ evidence: Evidence; text: string }[]>;
  saveEvidenceText(evidenceId: string, text: string): Promise<void>;
}
