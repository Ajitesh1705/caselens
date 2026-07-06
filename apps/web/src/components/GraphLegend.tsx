import { ENTITY_TYPES, entityStyle } from "../lib/entityStyle";

// Compact legend anchoring the taxonomy so the node colors are self-explaining.
export function GraphLegend() {
  return (
    <div className="pointer-events-none absolute bottom-2 left-2 flex flex-wrap gap-x-3 gap-y-1 rounded-sm border bg-panel/80 px-2 py-1.5 backdrop-blur">
      {ENTITY_TYPES.map((t) => {
        const s = entityStyle(t);
        return (
          <span key={t} className="mono flex items-center gap-1 text-[10px] text-muted">
            <span style={{ color: s.color }}>{s.glyph}</span>
            {s.label}
          </span>
        );
      })}
    </div>
  );
}
