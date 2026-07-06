import type { EntityType } from "@caselens/shared";

// Contract between the gateway and the FastAPI AI service. Extraction returns
// entities/edges/events keyed by label (not id); the gateway resolves labels to
// persisted entity ids when it writes to the store.

export interface ExtractedEntity {
  type: EntityType;
  label: string;
  attributes: Record<string, string>;
}

export interface ExtractedEdge {
  fromType: EntityType;
  fromLabel: string;
  toType: EntityType;
  toLabel: string;
  relation: string;
}

export interface ExtractedEvent {
  ts: string; // ISO timestamp
  actorLabel?: string;
  description: string;
}

export interface ExtractionResult {
  entities: ExtractedEntity[];
  edges: ExtractedEdge[];
  events: ExtractedEvent[];
  summary: string;
}

export interface ExtractionRequest {
  caseId: string;
  filename: string;
  type: string;
  content: string;
}
