import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { CaseGraphResponse } from "@caselens/shared";
import { useCaseStore, type RightTab } from "../store/useCaseStore";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { IngestionFeed } from "./IngestionFeed";
import { EvidenceSearch } from "./EvidenceSearch";
import { AskPanel } from "./AskPanel";
import { ReportPanel } from "./ReportPanel";

const TABS: { id: RightTab; label: string }[] = [
  { id: "ask", label: "Ask" },
  { id: "search", label: "Search" },
  { id: "report", label: "Report" },
];

type Expanded = null | "feed" | "panel";

// Right rail: live feed over a tabbed analysis panel. The rail width is
// draggable (desktop), the feed↔panel split is draggable, and either section
// can be expanded to fill the rail.
export function RightRail({ caseId, graph }: { caseId: string; graph: CaseGraphResponse }) {
  const { activeTab, setTab } = useCaseStore();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [width, setWidth] = useState(384);
  const [splitPct, setSplitPct] = useState(50);
  const [expanded, setExpanded] = useState<Expanded>(null);
  const stackRef = useRef<HTMLDivElement>(null);

  function startWidthDrag(e: ReactPointerEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const move = (ev: PointerEvent) => {
      // Always leave at least 360px for the graph so nothing overflows.
      const maxW = Math.max(320, window.innerWidth - 360);
      setWidth(Math.min(maxW, Math.max(320, startW + (startX - ev.clientX))));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function startSplitDrag(e: ReactPointerEvent) {
    e.preventDefault();
    const rect = stackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const move = (ev: PointerEvent) => {
      const pct = ((ev.clientY - rect.top) / rect.height) * 100;
      setSplitPct(Math.min(85, Math.max(15, pct)));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const toggle = (which: "feed" | "panel") =>
    setExpanded((cur) => (cur === which ? null : which));

  // flex-basis for each section given the expand state
  const feedBasis = expanded === "feed" ? "100%" : expanded === "panel" ? "auto" : `${splitPct}%`;
  const panelBasis = expanded === "panel" ? "100%" : expanded === "feed" ? "auto" : `${100 - splitPct}%`;

  return (
    <div
      className="relative flex h-full w-full min-h-0 flex-col border-l bg-panel shadow-[-1px_0_0_rgba(0,0,0,0.03)] lg:w-auto"
      style={isDesktop ? { width } : undefined}
    >
      {/* width drag handle (desktop only) */}
      {isDesktop && (
        <div
          onPointerDown={startWidthDrag}
          className="absolute left-0 top-0 z-20 h-full w-1.5 -translate-x-1/2 cursor-col-resize hover:bg-signal/40"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panel width"
        />
      )}

      <div ref={stackRef} className="flex min-h-0 flex-1 flex-col">
        {/* Feed */}
        <div
          className="flex min-h-0 flex-col overflow-hidden border-b"
          style={{ flex: expanded === "panel" ? "0 0 auto" : "1 1 " + feedBasis }}
        >
          <IngestionFeed
            collapsed={expanded === "panel"}
            expanded={expanded === "feed"}
            onToggleExpand={() => toggle("feed")}
          />
        </div>

        {/* Split drag handle (hidden when a section is expanded) */}
        {expanded === null && (
          <div
            onPointerDown={startSplitDrag}
            className="group flex h-1.5 cursor-row-resize items-center justify-center hover:bg-signal/40"
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize feed and panel"
          >
            <span className="h-0.5 w-8 rounded bg-line-bright group-hover:bg-signal" />
          </div>
        )}

        {/* Tabbed analysis panel */}
        <div
          className="flex min-h-0 flex-col overflow-hidden"
          style={{ flex: expanded === "feed" ? "0 0 auto" : "1 1 " + panelBasis }}
        >
          <div className="flex items-stretch border-b">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex-1 border-b-2 px-2 py-2 text-xs transition-colors ${
                  activeTab === t.id
                    ? "border-signal text-signal"
                    : "border-transparent text-muted hover:text-text"
                }`}
              >
                {t.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => toggle("panel")}
              className="mono border-b-2 border-transparent px-2.5 text-muted hover:text-signal"
              title={expanded === "panel" ? "Restore" : "Expand"}
              aria-label={expanded === "panel" ? "Restore panel" : "Expand panel"}
            >
              {expanded === "panel" ? "⤡" : "⤢"}
            </button>
          </div>
          {expanded !== "feed" && (
            <>
              {activeTab === "ask" && <AskPanel caseId={caseId} />}
              {activeTab === "search" && <EvidenceSearch caseId={caseId} graph={graph} />}
              {activeTab === "report" && <ReportPanel caseId={caseId} caseTitle={graph.case.title} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
