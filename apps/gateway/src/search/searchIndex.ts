import { request } from "undici";
import type { SearchHit } from "@caselens/shared";
import { config } from "../config.js";

export interface IndexedChunk {
  evidenceId: string;
  caseId: string;
  filename: string;
  text: string;
}

// Search abstraction over Elasticsearch with an in-memory keyword fallback.
// Both index chunked evidence text and answer keyword queries with highlights.
export interface SearchIndex {
  readonly kind: "elasticsearch" | "memory";
  init(): Promise<void>;
  indexChunk(chunk: IndexedChunk): Promise<void>;
  search(caseId: string, query: string, limit?: number): Promise<SearchHit[]>;
  // Retrieval for RAG: returns the most relevant chunks as plain text.
  retrieve(
    caseId: string,
    query: string,
    limit?: number,
  ): Promise<IndexedChunk[]>;
}

const ES_INDEX = "evidence_chunks";

function highlight(text: string, terms: string[]): string {
  const idx = text.length > 240 ? findBestWindow(text, terms) : 0;
  let snippet = text.slice(idx, idx + 240).trim();
  for (const t of terms) {
    if (!t) continue;
    snippet = snippet.replace(
      new RegExp(`(${escapeRegExp(t)})`, "gi"),
      "<mark>$1</mark>",
    );
  }
  return snippet;
}

function findBestWindow(text: string, terms: string[]): number {
  const lower = text.toLowerCase();
  for (const t of terms) {
    const i = lower.indexOf(t.toLowerCase());
    if (i >= 0) return Math.max(0, i - 60);
  }
  return 0;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tokenize(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[^a-z0-9@+._-]+/i)
    .filter((t) => t.length > 1);
}

// ---- In-memory fallback ----
class MemorySearchIndex implements SearchIndex {
  readonly kind = "memory" as const;
  private chunks: IndexedChunk[] = [];

  async init(): Promise<void> {}

  async indexChunk(chunk: IndexedChunk): Promise<void> {
    this.chunks.push(chunk);
  }

  private scored(caseId: string, query: string): { c: IndexedChunk; score: number }[] {
    const terms = tokenize(query);
    return this.chunks
      .filter((c) => c.caseId === caseId)
      .map((c) => {
        const lower = c.text.toLowerCase();
        const score = terms.reduce(
          (acc, t) => acc + (lower.split(t).length - 1),
          0,
        );
        return { c, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  async search(caseId: string, query: string, limit = 10): Promise<SearchHit[]> {
    const terms = tokenize(query);
    return this.scored(caseId, query)
      .slice(0, limit)
      .map(({ c, score }) => ({
        evidenceId: c.evidenceId,
        filename: c.filename,
        score,
        highlight: highlight(c.text, terms),
      }));
  }

  async retrieve(
    caseId: string,
    query: string,
    limit = 6,
  ): Promise<IndexedChunk[]> {
    return this.scored(caseId, query).slice(0, limit).map((x) => x.c);
  }
}

// ---- Elasticsearch implementation ----
class ElasticSearchIndex implements SearchIndex {
  readonly kind = "elasticsearch" as const;
  constructor(private baseUrl: string) {}

  async init(): Promise<void> {
    // Create the index if missing (ignore 400 "already exists").
    await request(`${this.baseUrl}/${ES_INDEX}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mappings: {
          properties: {
            evidenceId: { type: "keyword" },
            caseId: { type: "keyword" },
            filename: { type: "keyword" },
            text: { type: "text" },
          },
        },
      }),
    }).catch(() => undefined);
  }

  async indexChunk(chunk: IndexedChunk): Promise<void> {
    await request(`${this.baseUrl}/${ES_INDEX}/_doc`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(chunk),
    });
  }

  private async query(
    caseId: string,
    query: string,
    limit: number,
  ): Promise<{ evidenceId: string; filename: string; text: string; score: number; highlight?: string }[]> {
    const res = await request(`${this.baseUrl}/${ES_INDEX}/_search`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        size: limit,
        query: {
          bool: {
            must: [{ match: { text: query } }],
            filter: [{ term: { caseId } }],
          },
        },
        highlight: { fields: { text: {} } },
      }),
    });
    const json = (await res.body.json()) as {
      hits?: { hits?: Array<{ _score: number; _source: IndexedChunk; highlight?: { text?: string[] } }> };
    };
    return (json.hits?.hits ?? []).map((h) => ({
      evidenceId: h._source.evidenceId,
      filename: h._source.filename,
      text: h._source.text,
      score: h._score,
      highlight: h.highlight?.text?.[0],
    }));
  }

  async search(caseId: string, query: string, limit = 10): Promise<SearchHit[]> {
    const terms = tokenize(query);
    const rows = await this.query(caseId, query, limit);
    return rows.map((r) => ({
      evidenceId: r.evidenceId,
      filename: r.filename,
      score: r.score,
      highlight: r.highlight ?? highlight(r.text, terms),
    }));
  }

  async retrieve(
    caseId: string,
    query: string,
    limit = 6,
  ): Promise<IndexedChunk[]> {
    const rows = await this.query(caseId, query, limit);
    return rows.map((r) => ({
      evidenceId: r.evidenceId,
      caseId,
      filename: r.filename,
      text: r.text,
    }));
  }
}

export async function createSearchIndex(): Promise<SearchIndex> {
  try {
    const res = await request(config.esUrl, {
      method: "GET",
      headersTimeout: 2000,
      bodyTimeout: 2000,
    });
    if (res.statusCode >= 400) throw new Error(`ES status ${res.statusCode}`);
    const es = new ElasticSearchIndex(config.esUrl);
    await es.init();
    console.log(`[search] connected to Elasticsearch at ${config.esUrl}`);
    return es;
  } catch (err) {
    if (!config.degradeGracefully) {
      throw new Error(
        `Elasticsearch unreachable at ${config.esUrl}: ${(err as Error).message}`,
      );
    }
    console.warn(
      `[search] Elasticsearch unreachable (${(err as Error).message}); using in-memory search`,
    );
    const mem = new MemorySearchIndex();
    await mem.init();
    return mem;
  }
}
