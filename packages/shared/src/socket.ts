// WebSocket protocol contract (see design spec §5).
// Typed maps consumed by both the Socket.IO server (gateway) and client (web).

import type { Entity, Edge, CaseEvent, EvidenceCitation } from "./domain.js";

export type IngestionStage = "parsing" | "extraction" | "indexing";

// server -> client events
export interface ServerToClientEvents {
  "ingestion:started": (p: { evidenceId: string; filename: string }) => void;
  "ingestion:progress": (p: {
    evidenceId: string;
    stage: IngestionStage;
    pct: number;
  }) => void;
  "entity:discovered": (p: {
    entity: Entity;
    sourceEvidenceId: string;
  }) => void;
  "edge:discovered": (p: { edge: Edge }) => void;
  "event:discovered": (p: { event: CaseEvent }) => void;
  "ingestion:complete": (p: { evidenceId: string; summary: string }) => void;
  "chat:token": (p: { token: string }) => void;
  "chat:done": (p: { answer: string; citations: EvidenceCitation[] }) => void;
  "chat:error": (p: { message: string }) => void;
}

// client -> server events
export interface ClientToServerEvents {
  "case:join": (p: { caseId: string }) => void;
  "chat:ask": (p: { caseId: string; question: string }) => void;
}

export const SOCKET_EVENTS = {
  caseJoin: "case:join",
  ingestionStarted: "ingestion:started",
  ingestionProgress: "ingestion:progress",
  entityDiscovered: "entity:discovered",
  edgeDiscovered: "edge:discovered",
  eventDiscovered: "event:discovered",
  ingestionComplete: "ingestion:complete",
  chatAsk: "chat:ask",
  chatToken: "chat:token",
  chatDone: "chat:done",
  chatError: "chat:error",
} as const;
