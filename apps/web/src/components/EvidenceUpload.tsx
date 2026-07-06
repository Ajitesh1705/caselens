import { useState, type ChangeEvent } from "react";
import { useCaseStore } from "../store/useCaseStore";
import { api } from "../lib/api";

const EVIDENCE_TYPES = ["chat", "call_record", "document", "transaction"];

const PLACEHOLDER = `Paste evidence text, or load a .txt file. Lines with a leading
timestamp become events, e.g.:

2026-03-07 09:12 Sofia Marino called Rohit Mehta +44 7700 900555
2026-03-07 10:40 Sofia Marino wired USD 75,000 to account GB44BARC20038412345678`;

// Lets an investigator add evidence from the browser (paste or .txt upload).
// Hits the same ingestion endpoint as the webhook, so the graph animates live.
export function EvidenceUpload() {
  const caseId = useCaseStore((s) => s.caseId);
  const [open, setOpen] = useState(false);
  const [filename, setFilename] = useState("");
  const [type, setType] = useState("document");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setFilename("");
    setContent("");
    setType("document");
    setError(null);
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    setContent(await file.text());
  }

  async function submit() {
    if (!caseId || !content.trim()) {
      setError("Add some evidence text first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.uploadEvidence(caseId, {
        filename: filename.trim() || `evidence_${Date.now()}.txt`,
        type,
        content,
      });
      setOpen(false);
      reset();
    } catch {
      setError("Upload failed. Is the gateway running?");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-sm border border-signal/60 bg-signal/10 px-2.5 py-1 text-xs text-signal hover:bg-signal/20"
      >
        + Add evidence
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-md border bg-panel p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="font-display text-sm font-bold">Add evidence</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="mono text-muted hover:text-text"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="mb-2 flex gap-2">
              <input
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                placeholder="filename.txt"
                className="mono flex-1 rounded-sm border bg-panel-2 px-2 py-1.5 text-sm text-text placeholder:text-muted focus:border-signal"
              />
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="mono rounded-sm border bg-panel-2 px-2 py-1.5 text-sm text-text focus:border-signal"
              >
                {EVIDENCE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={PLACEHOLDER}
              rows={9}
              className="mono mb-2 w-full resize-none rounded-sm border bg-panel-2 px-2 py-1.5 text-xs leading-relaxed text-text placeholder:text-muted/70 focus:border-signal"
            />

            {error && <p className="mb-2 text-xs text-ent-organization">{error}</p>}

            <div className="flex items-center justify-between">
              <label className="mono cursor-pointer text-xs text-muted hover:text-text">
                <input type="file" accept=".txt,.csv,.log,.md" onChange={onFile} className="hidden" />
                ↑ Load .txt file
              </label>
              <button
                type="button"
                onClick={submit}
                disabled={busy}
                className="rounded-sm border border-signal bg-signal/15 px-4 py-1.5 text-sm text-signal disabled:opacity-40"
              >
                {busy ? "Ingesting…" : "Ingest evidence"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
