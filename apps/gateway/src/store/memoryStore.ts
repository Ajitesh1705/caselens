import { randomUUID } from "node:crypto";
import type {
  Case,
  Entity,
  Edge,
  CaseEvent,
  Evidence,
  CaseGraphResponse,
} from "@caselens/shared";
import type { Store } from "./types.js";

// In-memory implementation used when MongoDB is unreachable. Not durable —
// resets on restart — but keeps every feature working for the demo.
export class MemoryStore implements Store {
  readonly kind = "memory" as const;

  private cases = new Map<string, Case>();
  private evidence = new Map<string, Evidence>();
  private entities = new Map<string, Entity>();
  private edges = new Map<string, Edge>();
  private events = new Map<string, CaseEvent>();
  private texts = new Map<string, string>(); // evidenceId -> raw text

  async init(): Promise<void> {
    /* nothing to connect */
  }

  async listCases(): Promise<Case[]> {
    return [...this.cases.values()].sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : -1,
    );
  }

  async getCase(caseId: string): Promise<Case | null> {
    return this.cases.get(caseId) ?? null;
  }

  async createCase(input: Omit<Case, "id" | "createdAt">): Promise<Case> {
    const c: Case = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
    this.cases.set(c.id, c);
    return c;
  }

  async getGraph(caseId: string): Promise<CaseGraphResponse | null> {
    const c = this.cases.get(caseId);
    if (!c) return null;
    return {
      case: c,
      entities: [...this.entities.values()].filter((e) => e.caseId === caseId),
      edges: [...this.edges.values()].filter((e) => e.caseId === caseId),
      events: [...this.events.values()]
        .filter((e) => e.caseId === caseId)
        .sort((a, b) => (a.ts < b.ts ? -1 : 1)),
      evidence: [...this.evidence.values()].filter((e) => e.caseId === caseId),
    };
  }

  async createEvidence(
    input: Omit<Evidence, "id" | "createdAt">,
  ): Promise<Evidence> {
    const ev: Evidence = {
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.evidence.set(ev.id, ev);
    return ev;
  }

  async updateEvidence(
    evidenceId: string,
    patch: Partial<Pick<Evidence, "status" | "summary" | "type">>,
  ): Promise<void> {
    const ev = this.evidence.get(evidenceId);
    if (ev) this.evidence.set(evidenceId, { ...ev, ...patch });
  }

  async getEvidence(caseId: string, evidenceId: string): Promise<Evidence | null> {
    const ev = this.evidence.get(evidenceId);
    return ev && ev.caseId === caseId ? ev : null;
  }

  async findEvidenceByDeliveryId(
    caseId: string,
    deliveryId: string,
  ): Promise<Evidence | null> {
    return (
      [...this.evidence.values()].find(
        (e) => e.caseId === caseId && e.deliveryId === deliveryId,
      ) ?? null
    );
  }

  async upsertEntity(
    input: Omit<Entity, "id">,
  ): Promise<{ entity: Entity; created: boolean }> {
    const existing = [...this.entities.values()].find(
      (e) =>
        e.caseId === input.caseId &&
        e.type === input.type &&
        e.label.toLowerCase() === input.label.toLowerCase(),
    );
    if (existing) {
      const evidenceIds = [
        ...new Set([...existing.evidenceIds, ...input.evidenceIds]),
      ];
      const merged: Entity = {
        ...existing,
        attributes: { ...existing.attributes, ...input.attributes },
        evidenceIds,
      };
      this.entities.set(existing.id, merged);
      return { entity: merged, created: false };
    }
    const entity: Entity = { ...input, id: randomUUID() };
    this.entities.set(entity.id, entity);
    return { entity, created: true };
  }

  async upsertEdge(
    input: Omit<Edge, "id">,
  ): Promise<{ edge: Edge; created: boolean }> {
    const existing = [...this.edges.values()].find(
      (e) =>
        e.caseId === input.caseId &&
        e.from === input.from &&
        e.to === input.to &&
        e.relation === input.relation,
    );
    if (existing) {
      const evidenceIds = [
        ...new Set([...existing.evidenceIds, ...input.evidenceIds]),
      ];
      const merged: Edge = { ...existing, evidenceIds };
      this.edges.set(existing.id, merged);
      return { edge: merged, created: false };
    }
    const edge: Edge = { ...input, id: randomUUID() };
    this.edges.set(edge.id, edge);
    return { edge, created: true };
  }

  async createEvent(input: Omit<CaseEvent, "id">): Promise<CaseEvent> {
    const event: CaseEvent = { ...input, id: randomUUID() };
    this.events.set(event.id, event);
    return event;
  }

  async evidenceText(
    caseId: string,
  ): Promise<{ evidence: Evidence; text: string }[]> {
    return [...this.evidence.values()]
      .filter((e) => e.caseId === caseId)
      .map((e) => ({ evidence: e, text: this.texts.get(e.id) ?? "" }));
  }

  async saveEvidenceText(evidenceId: string, text: string): Promise<void> {
    this.texts.set(evidenceId, text);
  }
}
