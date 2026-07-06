import type { Case } from "@caselens/shared";
import { useCaseStore } from "../store/useCaseStore";

// Top command bar: brand, case selector, and live WebSocket connection status.
export function CommandBar({
  cases,
  caseId,
  onSelectCase,
}: {
  cases: Case[];
  caseId: string | null;
  onSelectCase: (id: string) => void;
}) {
  const connected = useCaseStore((s) => s.connected);
  return (
    <header className="flex items-center gap-4 border-b bg-panel/80 px-4 py-2.5 backdrop-blur">
      <div className="flex items-baseline gap-2">
        <span className="font-display text-lg font-bold tracking-tight text-text">
          CASE<span className="text-signal">LENS</span>
        </span>
        <span className="eyebrow hidden sm:inline">Investigation Console</span>
      </div>

      <div className="mx-2 h-5 w-px bg-line" />

      <label className="flex items-center gap-2">
        <span className="eyebrow hidden md:inline">Case</span>
        <select
          value={caseId ?? ""}
          onChange={(e) => onSelectCase(e.target.value)}
          className="mono rounded-sm border bg-panel-2 px-2 py-1 text-sm text-text focus:border-signal"
        >
          {cases.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </label>

      <div className="ml-auto flex items-center gap-2">
        <span
          className={`inline-block h-2 w-2 rounded-full ${connected ? "live-dot" : ""}`}
          style={{ background: connected ? "var(--color-signal)" : "var(--color-muted)" }}
        />
        <span className="eyebrow">{connected ? "Live · WS" : "Offline"}</span>
      </div>
    </header>
  );
}
