import type {
  Case,
  CaseGraphResponse,
  SearchResponse,
  ReportResponse,
} from "@caselens/shared";

// All requests go to same-origin /api, which Vite proxies to the gateway in dev
// and nginx routes in production.
const BASE = "/api";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  listCases: () => get<Case[]>("/cases"),
  getGraph: (caseId: string) => get<CaseGraphResponse>(`/cases/${caseId}/graph`),
  search: (caseId: string, q: string) =>
    get<SearchResponse>(`/cases/${caseId}/search?q=${encodeURIComponent(q)}`),
  generateReport: (caseId: string) =>
    post<ReportResponse>(`/cases/${caseId}/report`),
  uploadEvidence: (caseId: string, body: { filename: string; type: string; content: string }) =>
    post<{ status: string }>(`/cases/${caseId}/evidence`, body),
};
