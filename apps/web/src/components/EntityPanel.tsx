import { useMemo } from "react";
import type { CaseGraphResponse } from "@caselens/shared";
import { entityStyle } from "../lib/entityStyle";
import { EntityChip } from "./EntityChip";
import { useCaseStore } from "../store/useCaseStore";

// Slides in when a node is selected: the entity's attributes, the evidence it
// came from, and its connected entities (click a connection to walk the graph).
export function EntityPanel({ graph }: { graph: CaseGraphResponse }) {
  const { selectedEntityId, selectEntity } = useCaseStore();

  const entity = useMemo(
    () => graph.entities.find((e) => e.id === selectedEntityId) ?? null,
    [graph.entities, selectedEntityId],
  );

  const connections = useMemo(() => {
    if (!entity) return [];
    const out: { relation: string; other: (typeof graph.entities)[number] }[] = [];
    for (const edge of graph.edges) {
      const otherId = edge.from === entity.id ? edge.to : edge.to === entity.id ? edge.from : null;
      if (!otherId) continue;
      const other = graph.entities.find((e) => e.id === otherId);
      if (other) out.push({ relation: edge.relation, other });
    }
    return out;
  }, [entity, graph.edges, graph.entities]);

  const evidence = useMemo(() => {
    if (!entity) return [];
    return graph.evidence.filter((ev) => entity.evidenceIds.includes(ev.id));
  }, [entity, graph.evidence]);

  if (!entity) return null;
  const s = entityStyle(entity.type);

  return (
    <aside className="absolute right-0 top-0 z-10 flex h-full w-72 flex-col border-l bg-panel/95 backdrop-blur">
      <div className="flex items-start justify-between border-b px-3 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg" style={{ color: s.color }} aria-hidden>
            {s.glyph}
          </span>
          <div>
            <div className="eyebrow" style={{ color: s.color }}>
              {s.label}
            </div>
            <div className="mono text-sm text-text">{entity.label}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => selectEntity(null)}
          className="mono text-muted hover:text-text"
          aria-label="Close panel"
        >
          ✕
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {Object.keys(entity.attributes).length > 0 && (
          <section className="mb-4">
            <div className="eyebrow mb-1.5">Attributes</div>
            <dl className="mono space-y-0.5 text-xs">
              {Object.entries(entity.attributes).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-text">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <section className="mb-4">
          <div className="eyebrow mb-1.5">Connections · {connections.length}</div>
          <div className="flex flex-wrap gap-1.5">
            {connections.map(({ other, relation }, i) => (
              <div key={`${other.id}-${i}`} className="flex flex-col gap-0.5">
                <span className="eyebrow lowercase">{relation}</span>
                <EntityChip
                  type={other.type}
                  label={other.label}
                  onClick={() => selectEntity(other.id)}
                />
              </div>
            ))}
            {connections.length === 0 && <span className="eyebrow">No links</span>}
          </div>
        </section>

        <section>
          <div className="eyebrow mb-1.5">Evidence · {evidence.length}</div>
          <ul className="space-y-1">
            {evidence.map((ev) => (
              <li key={ev.id} className="mono text-xs text-text/90">
                <span style={{ color: "var(--color-signal)" }}>▤</span> {ev.filename}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </aside>
  );
}
