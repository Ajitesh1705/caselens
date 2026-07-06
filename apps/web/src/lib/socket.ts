import { io, type Socket } from "socket.io-client";
import type {
  ServerToClientEvents,
  ClientToServerEvents,
} from "@caselens/shared";

export type CaseSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// Single shared socket to the gateway (same-origin; Vite proxies /socket.io).
let socket: CaseSocket | null = null;

export function getSocket(): CaseSocket {
  if (!socket) {
    socket = io({ path: "/socket.io", transports: ["websocket", "polling"] });
  }
  return socket;
}
