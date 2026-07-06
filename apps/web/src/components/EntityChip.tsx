import { entityStyle } from "../lib/entityStyle";

// The atomic unit of the taxonomy system: a glyph + label tinted by entity type.
// Reused in the graph side panel, feed, citations, and legend.
export function EntityChip({
  type,
  label,
  onClick,
  active,
}: {
  type: string;
  label: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const s = entityStyle(type);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-left text-xs transition-colors enabled:hover:bg-panel disabled:cursor-default"
      style={{
        borderColor: active ? s.color : "var(--color-line)",
        background: active ? `${s.color}18` : "transparent",
      }}
    >
      <span style={{ color: s.color }} aria-hidden>
        {s.glyph}
      </span>
      <span className="mono truncate" style={{ maxWidth: 180 }}>
        {label}
      </span>
    </button>
  );
}
