import { request } from "undici";
import { config } from "../config.js";
import { localExtract } from "./localExtract.js";
import type { ExtractionRequest, ExtractionResult } from "./types.js";

// Client for the FastAPI AI service. Extraction falls back to the local
// heuristic extractor if the service is unreachable, so ingestion never blocks.

async function postJson<T>(path: string, body: unknown, timeoutMs = 15000): Promise<T> {
  const res = await request(`${config.aiServiceUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    headersTimeout: timeoutMs,
    bodyTimeout: timeoutMs,
  });
  if (res.statusCode >= 400) {
    throw new Error(`AI service ${path} returned ${res.statusCode}`);
  }
  return (await res.body.json()) as T;
}

export async function extract(req: ExtractionRequest): Promise<ExtractionResult> {
  try {
    return await postJson<ExtractionResult>("/extract", req);
  } catch (err) {
    console.warn(
      `[ai] extraction service unavailable (${(err as Error).message}); using local heuristic extractor`,
    );
    return localExtract(req);
  }
}

export interface AskRequest {
  question: string;
  chunks: { evidenceId: string; filename: string; text: string }[];
}

export interface AskResult {
  answer: string;
  citedEvidenceIds: string[];
}

// Non-streaming ask used as a fallback; the streaming path lives in the socket
// handler and calls the AI service's /ask/stream directly.
export async function ask(req: AskRequest): Promise<AskResult> {
  try {
    return await postJson<AskResult>("/ask", req, 30000);
  } catch (err) {
    console.warn(`[ai] ask failed (${(err as Error).message}); using template answer`);
    return templateAnswer(req);
  }
}

// Streams the answer token-by-token. Calls the AI service's /ask/stream (which
// emits newline-delimited JSON `{"token": "..."}` lines); on failure, yields the
// deterministic template answer word-by-word so the UX is identical offline.
export async function* streamAsk(req: AskRequest): AsyncGenerator<string> {
  try {
    const res = await request(`${config.aiServiceUrl}/ask/stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
      headersTimeout: 30000,
      bodyTimeout: 60000,
    });
    if (res.statusCode >= 400) throw new Error(`status ${res.statusCode}`);
    let buffer = "";
    for await (const part of res.body) {
      buffer += part.toString();
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        try {
          const obj = JSON.parse(line) as { token?: string };
          if (obj.token) yield obj.token;
        } catch {
          /* ignore malformed line */
        }
      }
    }
  } catch (err) {
    console.warn(
      `[ai] stream ask failed (${(err as Error).message}); streaming template answer`,
    );
    const { answer } = templateAnswer(req);
    for (const word of answer.split(/(\s+)/)) {
      yield word;
      await new Promise((r) => setTimeout(r, 12));
    }
  }
}

export interface ReportRequest {
  caseTitle: string;
  entities: { type: string; label: string }[];
  events: { ts: string; description: string }[];
  evidenceCount: number;
}

export async function report(req: ReportRequest): Promise<{ markdown: string }> {
  try {
    return await postJson<{ markdown: string }>("/report", req, 40000);
  } catch (err) {
    console.warn(`[ai] report failed (${(err as Error).message}); using template report`);
    return { markdown: templateReport(req) };
  }
}

// ---- Deterministic fallbacks (no LLM) ----

function templateAnswer(req: AskRequest): AskResult {
  if (req.chunks.length === 0) {
    return {
      answer: "No evidence in this case matched the question.",
      citedEvidenceIds: [],
    };
  }
  const lines = req.chunks
    .slice(0, 4)
    .map((c) => `- From **${c.filename}**: ${c.text.slice(0, 180).trim()}…`);
  return {
    answer:
      `Based on the retrieved evidence:\n\n${lines.join("\n")}\n\n` +
      `(Generated without an LLM — set OPENAI_API_KEY for a synthesized answer.)`,
    citedEvidenceIds: [...new Set(req.chunks.map((c) => c.evidenceId))],
  };
}

function templateReport(req: ReportRequest): string {
  const byType = new Map<string, string[]>();
  for (const e of req.entities) {
    const arr = byType.get(e.type) ?? [];
    arr.push(e.label);
    byType.set(e.type, arr);
  }
  const entitySection = [...byType.entries()]
    .map(([type, labels]) => `- **${type}** (${labels.length}): ${labels.join(", ")}`)
    .join("\n");
  const chronology = [...req.events]
    .sort((a, b) => (a.ts < b.ts ? -1 : 1))
    .slice(0, 20)
    .map((e) => `- \`${e.ts}\` — ${e.description}`)
    .join("\n");
  return [
    `# Case Report: ${req.caseTitle}`,
    "",
    `_Generated ${new Date().toISOString()} from ${req.evidenceCount} pieces of evidence._`,
    "",
    "## Key entities",
    entitySection || "_No entities extracted yet._",
    "",
    "## Chronology",
    chronology || "_No events extracted yet._",
    "",
    "## Leads to pursue",
    "- Corroborate the most-connected entities across independent evidence sources.",
    "- Review transactions clustered in the flagged time window.",
    "",
    "_This report was generated without an LLM. Set OPENAI_API_KEY for a synthesized narrative._",
  ].join("\n");
}
