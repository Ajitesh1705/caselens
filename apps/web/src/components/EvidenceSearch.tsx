import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CaseGraphResponse } from "@caselens/shared";
import { api } from "../lib/api";

const STATUS_COLOR: Record<string, string> = {
  complete: "var(--color-ent-email)",
  failed: "var(--color-ent-organization)",
  received: "var(--color-muted)",
};

// Full-text search over Elasticsearch (highlighted snippets) plus the evidence
// inventory with live processing status.
export function EvidenceSearch({ caseId, graph }: { caseId: string; graph: CaseGraphResponse }) {
  const [q, setQ] = useState("");
  const { data, isFetching } = useQuery({
    queryKey: ["search", caseId, q],
    queryFn: () => api.search(caseId, q),
    enabled: q.trim().length > 1,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b px-3 py-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search evidence…"
          className="mono w-full rounded-sm border bg-panel-2 px-2 py-1.5 text-sm text-text placeholder:text-muted focus:border-signal"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {q.trim().length > 1 ? (
          <>
            <div className="eyebrow mb-1.5">
              {isFetching ? "Searching…" : `${data?.hits.length ?? 0} hits`}
            </div>
            <ul className="space-y-2">
              {data?.hits.map((h, i) => (
                <li key={`${h.evidenceId}-${i}`} className="rounded-sm border bg-panel-2 p-2">
                  <div className="mono mb-1 text-xs text-signal">▤ {h.filename}</div>
                  <p
                    className="text-xs leading-relaxed text-text/80 [&_mark]:bg-signal/30 [&_mark]:text-text"
                    dangerouslySetInnerHTML={{ __html: h.highlight }}
                  />
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <div className="eyebrow mb-1.5">Evidence · {graph.evidence.length}</div>
            <ul className="space-y-1">
              {graph.evidence.map((ev) => (
                <li key={ev.id} className="flex items-center justify-between gap-2 rounded-sm border bg-panel-2 px-2 py-1.5">
                  <span className="mono truncate text-xs text-text/90">{ev.filename}</span>
                  <span
                    className="eyebrow shrink-0"
                    style={{ color: STATUS_COLOR[ev.status] ?? "var(--color-signal)" }}
                  >
                    {ev.status}
                  </span>
                </li>
              ))}
              {graph.evidence.length === 0 && <li className="eyebrow">No evidence yet</li>}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
