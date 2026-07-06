import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { api } from "../lib/api";

// One-click structured case report, rendered in-app with a markdown export.
export function ReportPanel({ caseId, caseTitle }: { caseId: string; caseTitle: string }) {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const gen = useMutation({
    mutationFn: () => api.generateReport(caseId),
    onSuccess: (r) => setMarkdown(r.markdown),
  });

  function download() {
    if (!markdown) return;
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${caseTitle.replace(/\s+/g, "_")}_report.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="eyebrow">Case Report</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => gen.mutate()}
            disabled={gen.isPending}
            className="rounded-sm border border-signal bg-signal/15 px-2 py-0.5 text-xs text-signal disabled:opacity-40"
          >
            {gen.isPending ? "Generating…" : "Generate"}
          </button>
          {markdown && (
            <button type="button" onClick={download} className="rounded-sm border px-2 py-0.5 text-xs text-text/80 hover:border-signal">
              Export
            </button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {gen.isError && <p className="text-xs text-ent-organization">Failed to generate report.</p>}
        {markdown ? (
          <div className="rounded-md border border-l-2 border-l-signal bg-panel-2/60 shadow-sm">
            <div className="flex items-center gap-1.5 border-b border-line/60 px-3 py-1.5">
              <span className="text-signal" aria-hidden>◆</span>
              <span className="serif text-xs italic text-muted">Generated analysis</span>
            </div>
            <div className="space-y-2 px-3 py-3 text-xs leading-relaxed text-text/90 [&_code]:mono [&_code]:rounded-sm [&_code]:bg-panel [&_code]:px-1 [&_code]:text-signal [&_h1]:serif [&_h1]:mb-2 [&_h1]:text-base [&_h1]:font-semibold [&_h1]:text-text [&_h2]:serif [&_h2]:mt-3 [&_h2]:text-sm [&_h2]:text-signal [&_li]:ml-4 [&_li]:list-disc [&_li]:marker:text-signal [&_strong]:font-semibold">
              <ReactMarkdown>{markdown}</ReactMarkdown>
            </div>
          </div>
        ) : (
          <p className="eyebrow">Generate a structured report: summary, key entities, chronology, and leads.</p>
        )}
      </div>
    </div>
  );
}
