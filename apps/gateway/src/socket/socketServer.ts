import { Server } from "socket.io";
import type { Server as HttpServer } from "node:http";
import type { EvidenceCitation } from "@caselens/shared";
import type { Store } from "../store/index.js";
import type { SearchIndex } from "../search/searchIndex.js";
import { streamAsk } from "../ai/aiClient.js";
import { config } from "../config.js";
import { roomFor, SocketEmitter, type IoServer } from "./emitter.js";

// Sets up the Socket.IO server: case rooms (join to subscribe) and the
// streamed Ask-the-Case handler. Retrieval happens here so citations are built
// from the exact chunks fed to the model.
export function createSocketServer(
  httpServer: HttpServer,
  deps: { store: Store; search: SearchIndex },
): { io: IoServer; emitter: SocketEmitter } {
  const io: IoServer = new Server(httpServer, {
    cors: { origin: config.corsOrigin },
  });

  io.on("connection", (socket) => {
    socket.on("case:join", ({ caseId }) => {
      socket.join(roomFor(caseId));
    });

    socket.on("chat:ask", async ({ caseId, question }) => {
      try {
        const chunks = await deps.search.retrieve(caseId, question, 6);
        const citations: EvidenceCitation[] = dedupeCitations(chunks);

        let answer = "";
        for await (const token of streamAsk({
          question,
          chunks: chunks.map((c) => ({
            evidenceId: c.evidenceId,
            filename: c.filename,
            text: c.text,
          })),
        })) {
          answer += token;
          socket.emit("chat:token", { token });
        }
        socket.emit("chat:done", { answer, citations });
      } catch (err) {
        socket.emit("chat:error", { message: (err as Error).message });
      }
    });
  });

  return { io, emitter: new SocketEmitter(io) };
}

function dedupeCitations(
  chunks: { evidenceId: string; filename: string; text: string }[],
): EvidenceCitation[] {
  const seen = new Set<string>();
  const out: EvidenceCitation[] = [];
  for (const c of chunks) {
    if (seen.has(c.evidenceId)) continue;
    seen.add(c.evidenceId);
    out.push({
      evidenceId: c.evidenceId,
      filename: c.filename,
      snippet: c.text.slice(0, 160).trim(),
    });
  }
  return out;
}
