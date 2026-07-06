import { useEffect } from "react";
import { ClassificationBanner } from "./components/ClassificationBanner";
import { CommandBar } from "./components/CommandBar";
import { LinkGraph } from "./components/LinkGraph";
import { Timeline } from "./components/Timeline";
import { RightRail } from "./components/RightRail";
import { EntityPanel } from "./components/EntityPanel";
import { GraphLegend } from "./components/GraphLegend";
import { useCases, useCaseGraph, useLiveIngestion } from "./hooks/useCaseData";
import { useCaseStore } from "./store/useCaseStore";

export default function App() {
  const { data: cases } = useCases();
  const { caseId, setCaseId } = useCaseStore();

  // Default to the first case once loaded.
  useEffect(() => {
    if (!caseId && cases && cases.length > 0) setCaseId(cases[0].id);
  }, [cases, caseId, setCaseId]);

  useLiveIngestion(caseId);
  const { data: graph } = useCaseGraph(caseId);

  return (
    <div className="flex h-full flex-col">
      <ClassificationBanner />
      <CommandBar cases={cases ?? []} caseId={caseId} onSelectCase={setCaseId} />

      <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section className="flex min-h-0 flex-1 flex-col">
          <div className="relative min-h-[340px] flex-1">
            {graph ? <LinkGraph graph={graph} /> : <Loading />}
            <GraphLegend />
            {graph && <EntityPanel graph={graph} />}
          </div>
          {graph && <Timeline graph={graph} />}
        </section>

        <div className="h-[520px] w-full shrink-0 lg:h-auto lg:w-[360px]">
          {caseId && graph && <RightRail caseId={caseId} graph={graph} />}
        </div>
      </main>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex h-full items-center justify-center">
      <span className="eyebrow">Loading case…</span>
    </div>
  );
}
