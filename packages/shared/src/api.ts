// REST API DTOs for the gateway (see design spec §3, §8).

import type {
  Case,
  Entity,
  Edge,
  CaseEvent,
  Evidence,
  EvidenceCitation,
} from "./domain.js";

export interface CaseGraphResponse {
  case: Case;
  entities: Entity[];
  edges: Edge[];
  events: CaseEvent[];
  evidence: Evidence[];
}

export interface SearchHit {
  evidenceId: string;
  filename: string;
  score: number;
  highlight: string;
}

export interface SearchResponse {
  query: string;
  hits: SearchHit[];
}

export interface UploadEvidenceRequest {
  caseId: string;
  filename: string;
  type?: string;
  content: string; // raw text of the evidence
}

export interface WebhookEvidencePayload {
  caseId: string;
  filename: string;
  type?: string;
  content?: string; // inline text
  contentBase64?: string; // base64-encoded text
  contentUrl?: string; // fetchable url
}

export interface ReportResponse {
  caseId: string;
  markdown: string;
  generatedAt: string;
}

export interface AskResponse {
  answer: string;
  citations: EvidenceCitation[];
}
