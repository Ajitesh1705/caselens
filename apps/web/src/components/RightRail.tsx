import type { CaseGraphResponse } from "@caselens/shared";
import { useCaseStore, type RightTab } from "../store/useCaseStore";
import { IngestionFeed } from "./IngestionFeed";
import { EvidenceSearch } from "./EvidenceSearch";
import { AskPanel } from "./AskPanel";
import { ReportPanel } from "./ReportPanel";

const TABS: { id: RightTab; label: string }[] = [
  { id: "ask", label: "Ask" },
  { id: "search", label: "Search" },
  { id: "report", label: "Report" },
];

// Right rail: the live feed on top, a tabbed analysis panel below.
export function RightRail({ caseId, graph }: { caseId: string; graph: CaseGraphResponse }) {
  const { activeTab, setTab } = useCaseStore();
  return (
    <div className="flex h-full min-h-0 flex-col border-l bg-panel/50">
      <div className="flex min-h-0 basis-1/2 flex-col border-b">
        <IngestionFeed />
      </div>
      <div className="flex min-h-0 basis-1/2 flex-col">
        <div className="flex border-b">
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
        </div>
        {activeTab === "ask" && <AskPanel caseId={caseId} />}
        {activeTab === "search" && <EvidenceSearch caseId={caseId} graph={graph} />}
        {activeTab === "report" && <ReportPanel caseId={caseId} caseTitle={graph.case.title} />}
      </div>
    </div>
  );
}
