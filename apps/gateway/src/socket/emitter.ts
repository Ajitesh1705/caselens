import type { Server } from "socket.io";
import type {
  ServerToClientEvents,
  ClientToServerEvents,
} from "@caselens/shared";

export type IoServer = Server<ClientToServerEvents, ServerToClientEvents>;

export function roomFor(caseId: string): string {
  return `case:${caseId}`;
}

// Narrow interface the ingestion pipeline depends on, so it never touches
// Socket.IO directly (keeps it unit-testable with a fake emitter).
export interface CaseEmitter {
  emit<K extends keyof ServerToClientEvents>(
    caseId: string,
    event: K,
    payload: Parameters<ServerToClientEvents[K]>[0],
  ): void;
}

export class SocketEmitter implements CaseEmitter {
  constructor(private io: IoServer) {}

  emit<K extends keyof ServerToClientEvents>(
    caseId: string,
    event: K,
    payload: Parameters<ServerToClientEvents[K]>[0],
  ): void {
    // Socket.IO's typed emit signature is awkward to satisfy generically.
    (this.io.to(roomFor(caseId)).emit as (e: K, p: unknown) => void)(
      event,
      payload,
    );
  }
}
