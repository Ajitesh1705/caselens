import { useEffect, useMemo, useRef, useState } from "react";
import type { CaseGraphResponse } from "@caselens/shared";
import { entityStyle } from "../lib/entityStyle";
import { useCaseStore } from "../store/useCaseStore";

// Horizontal event timeline. Drag to brush a time window — the graph filters to
// entities active in that window. Click to clear. This cross-filter is the
// console's key analytical interaction.
export function Timeline({ graph }: { graph: CaseGraphResponse }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(800);
  const { brush, setBrush } = useCaseStore();
  const drag = useRef<{ startX: number } | null>(null);
  const [preview, setPreview] = useState<{ a: number; b: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const typeById = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of graph.entities) m.set(e.id, e.type);
    return m;
  }, [graph.entities]);

  const { min, max, points } = useMemo(() => {
    const times = graph.events.map((e) => new Date(e.ts).getTime()).filter((t) => !isNaN(t));
    if (times.length === 0) return { min: 0, max: 1, points: [] as { t: number; type: string; desc: string }[] };
    const lo = Math.min(...times);
    const hi = Math.max(...times);
    const pad = Math.max((hi - lo) * 0.04, 3600_000);
    return {
      min: lo - pad,
      max: hi + pad,
      points: graph.events.map((e) => ({
        t: new Date(e.ts).getTime(),
        type: e.actorEntityId ? (typeById.get(e.actorEntityId) ?? "device") : "device",
        desc: e.description,
      })),
    };
  }, [graph.events, typeById]);

  const H = 64;
  const xOf = (t: number) => ((t - min) / (max - min)) * w;
  const tOf = (x: number) => min + (x / w) * (max - min);
  const fmt = (t: number) =>
    new Date(t).toLocaleString(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });

  function onDown(e: React.PointerEvent) {
    const x = e.clientX - (ref.current?.getBoundingClientRect().left ?? 0);
    drag.current = { startX: x };
    setPreview({ a: x, b: x });
    (e.target as Element).setPointerCapture(e.pointerId);
  }
  function onMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const x = e.clientX - (ref.current?.getBoundingClientRect().left ?? 0);
    setPreview({ a: drag.current.startX, b: x });
  }
  function onUp() {
    if (drag.current && preview) {
      const a = Math.min(preview.a, preview.b);
      const b = Math.max(preview.a, preview.b);
      if (b - a < 4) setBrush(null); // treat as click → clear
      else setBrush({ start: tOf(a), end: tOf(b) });
    }
    drag.current = null;
    setPreview(null);
  }

  const sel = preview ?? (brush ? { a: xOf(brush.start), b: xOf(brush.end) } : null);

  return (
    <div className="border-t bg-panel/60 px-4 py-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="eyebrow">Timeline</span>
        <span className="eyebrow">
          {brush ? `${fmt(brush.start)} → ${fmt(brush.end)} · drag to change` : "drag to filter the graph by time"}
        </span>
      </div>
      <div ref={ref} className="relative h-16 w-full cursor-crosshair select-none">
        <svg
          width={w}
          height={H}
          className="absolute inset-0"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
        >
          <line x1={0} y1={H / 2} x2={w} y2={H / 2} stroke="var(--color-line-bright)" strokeWidth={1} />
          {sel && (
            <rect
              x={Math.min(sel.a, sel.b)}
              y={0}
              width={Math.abs(sel.b - sel.a)}
              height={H}
              fill="rgba(232,163,61,0.14)"
              stroke="var(--color-signal)"
              strokeDasharray="3 3"
            />
          )}
          {points.map((p, i) => {
            const inBrush = brush ? p.t >= brush.start && p.t <= brush.end : true;
            return (
              <circle
                key={i}
                cx={xOf(p.t)}
                cy={H / 2}
                r={inBrush ? 4 : 3}
                fill={entityStyle(p.type).color}
                opacity={inBrush ? 1 : 0.3}
              >
                <title>{`${fmt(p.t)} — ${p.desc}`}</title>
              </circle>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
