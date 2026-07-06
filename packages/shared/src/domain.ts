// Core domain model shared across the gateway and web console.
// These shapes mirror the MongoDB collections (see design spec §7).

export type EntityType =
  | "person"
  | "phone"
  | "account"
  | "location"
  | "device"
  | "organization"
  | "email";

export type EvidenceType =
  | "chat"
  | "call_record"
  | "document"
  | "transaction"
  | "unknown";

export type EvidenceStatus =
  | "received"
  | "parsing"
  | "extracting"
  | "indexing"
  | "complete"
  | "failed";

export type ReceivedVia = "upload" | "webhook";

export type CaseStatus = "open" | "active" | "closed";

export interface Case {
  id: string;
  title: string;
  description: string;
  status: CaseStatus;
  createdAt: string;
}

export interface Evidence {
  id: string;
  caseId: string;
  filename: string;
  type: EvidenceType;
  status: EvidenceStatus;
  receivedVia: ReceivedVia;
  deliveryId?: string;
  summary?: string;
  createdAt: string;
}

export interface Entity {
  id: string;
  caseId: string;
  type: EntityType;
  label: string;
  attributes: Record<string, string>;
  evidenceIds: string[];
}

export interface Edge {
  id: string;
  caseId: string;
  from: string; // entity id
  to: string; // entity id
  relation: string;
  evidenceIds: string[];
}

export interface CaseEvent {
  id: string;
  caseId: string;
  ts: string; // ISO timestamp of when the event occurred
  actorEntityId?: string;
  description: string;
  evidenceId: string;
}

export interface EvidenceCitation {
  evidenceId: string;
  filename: string;
  snippet: string;
}
