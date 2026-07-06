import { useCaseStore, type FeedKind } from "../store/useCaseStore";
import { entityStyle } from "../lib/entityStyle";

const KIND_MARK: Record<FeedKind, { mark: string; color: string }> = {
  started: { mark: "▸", color: "var(--color-signal)" },
  progress: { mark: "·", color: "var(--color-muted)" },
  entity: { mark: "◆", color: "var(--color-ent-person)" },
  edge: { mark: "─", color: "var(--color-muted)" },
  event: { mark: "•", color: "var(--color-ent-account)" },
  complete: { mark: "✓", color: "var(--color-ent-email)" },
};

// Right-rail teletype of the ingestion protocol — makes the system feel alive.
export function IngestionFeed() {
  const feed = useCaseStore((s) => s.feed);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="eyebrow">Live Ingestion Feed</span>
        <span className="eyebrow">{feed.length}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {feed.length === 0 ? (
          <p className="eyebrow mt-2">Awaiting evidence…</p>
        ) : (
          <ul className="space-y-1">
            {feed.map((f) => {
              const km = KIND_MARK[f.kind];
              const color = f.entityType ? entityStyle(f.entityType).color : km.color;
              return (
                <li key={f.id} className="feed-in mono flex items-start gap-2 text-xs leading-relaxed">
                  <span style={{ color }} aria-hidden>
                    {f.entityType ? entityStyle(f.entityType).glyph : km.mark}
                  </span>
                  <span className="text-muted">
                    {new Date(f.ts).toLocaleTimeString(undefined, { hour12: false })}
                  </span>
                  <span className="flex-1 text-text/90">{f.text}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
