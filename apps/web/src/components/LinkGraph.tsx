import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";
import type { CaseGraphResponse } from "@caselens/shared";
import { entityStyle } from "../lib/entityStyle";
import { useCaseStore } from "../store/useCaseStore";

interface GNode {
  id: string;
  type: string;
  label: string;
  active: boolean;
}
interface GLink {
  source: string;
  target: string;
  relation: string;
}

// Force-directed graph of entities. The direct analogue of the product's
// "analyze linkages" board: nodes are typed entities, links are relations.
// New nodes pulse in; the timeline brush dims entities inactive in the window.
export function LinkGraph({ graph }: { graph: CaseGraphResponse }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods<GNode, GLink> | undefined>(undefined);
  const [size, setSize] = useState({ w: 800, h: 500 });
  const seenAt = useRef<Map<string, number>>(new Map());
  const { selectedEntityId, selectEntity, brush } = useCaseStore();

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) =>
      setSize({ w: e.contentRect.width, h: e.contentRect.height }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Spread nodes out so labels don't collide.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.d3Force("charge")?.strength(-180);
    const link = fg.d3Force("link") as unknown as { distance?: (d: number) => void } | undefined;
    link?.distance?.(60);
  }, [size]);

  // Entities active in the brush window (have an event in range). No brush → all.
  const activeIds = useMemo(() => {
    if (!brush) return null;
    const ids = new Set<string>();
    for (const ev of graph.events) {
      const t = new Date(ev.ts).getTime();
      if (t >= brush.start && t <= brush.end && ev.actorEntityId) ids.add(ev.actorEntityId);
    }
    return ids;
  }, [brush, graph.events]);

  const data = useMemo(() => {
    const nodes: GNode[] = graph.entities.map((e) => ({
      id: e.id,
      type: e.type,
      label: e.label,
      active: !activeIds || activeIds.has(e.id),
    }));
    const links: GLink[] = graph.edges.map((e) => ({
      source: e.from,
      target: e.to,
      relation: e.relation,
    }));
    return { nodes, links };
  }, [graph.entities, graph.edges, activeIds]);

  // Record first-seen time for pulse-in animation.
  useEffect(() => {
    const now = performance.now();
    for (const n of data.nodes) if (!seenAt.current.has(n.id)) seenAt.current.set(n.id, now);
  }, [data.nodes]);

  const neighborIds = useMemo(() => {
    if (!selectedEntityId) return null;
    const set = new Set<string>([selectedEntityId]);
    for (const e of graph.edges) {
      if (e.from === selectedEntityId) set.add(e.to);
      if (e.to === selectedEntityId) set.add(e.from);
    }
    return set;
  }, [selectedEntityId, graph.edges]);

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden">
      <ForceGraph2D
        ref={fgRef}
        width={size.w}
        height={size.h}
        graphData={data}
        backgroundColor="rgba(0,0,0,0)"
        cooldownTicks={120}
        nodeRelSize={5}
        onEngineStop={() => fgRef.current?.zoomToFit(400, 70)}
        linkColor={(l) => {
          const src = typeof l.source === "object" ? (l.source as GNode).id : l.source;
          const tgt = typeof l.target === "object" ? (l.target as GNode).id : l.target;
          if (neighborIds && (neighborIds.has(src as string) && neighborIds.has(tgt as string)))
            return "rgba(232,163,61,0.55)";
          return "rgba(120,140,160,0.18)";
        }}
        linkWidth={(l) => {
          const src = typeof l.source === "object" ? (l.source as GNode).id : l.source;
          const tgt = typeof l.target === "object" ? (l.target as GNode).id : l.target;
          return neighborIds && neighborIds.has(src as string) && neighborIds.has(tgt as string) ? 1.5 : 0.6;
        }}
        onNodeClick={(n) => selectEntity((n as GNode).id === selectedEntityId ? null : (n as GNode).id)}
        onBackgroundClick={() => selectEntity(null)}
        nodeCanvasObject={(node, ctx, scale) => {
          const n = node as GNode & { x: number; y: number };
          const s = entityStyle(n.type);
          const dimmed = !n.active || (neighborIds ? !neighborIds.has(n.id) : false);
          const r = 5;
          const alpha = dimmed ? 0.22 : 1;

          // pulse ring for freshly discovered nodes (~2s)
          const born = seenAt.current.get(n.id);
          if (born !== undefined) {
            const age = performance.now() - born;
            if (age < 2000 && !dimmed) {
              const p = age / 2000;
              ctx.beginPath();
              ctx.arc(n.x, n.y, r + p * 10, 0, Math.PI * 2);
              ctx.strokeStyle = `rgba(232,163,61,${0.5 * (1 - p)})`;
              ctx.lineWidth = 1.5 / scale;
              ctx.stroke();
            }
          }

          ctx.globalAlpha = alpha;
          ctx.beginPath();
          ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
          ctx.fillStyle = s.color;
          ctx.fill();
          if (n.id === selectedEntityId) {
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 1.5 / scale;
            ctx.stroke();
          }

          // label
          if (scale > 1.3 || n.id === selectedEntityId || (neighborIds?.has(n.id) && !dimmed)) {
            ctx.font = `${10 / scale}px "IBM Plex Mono", monospace`;
            ctx.fillStyle = dimmed ? "rgba(230,237,243,0.3)" : "#c9d4de";
            ctx.textAlign = "center";
            ctx.fillText(n.label.slice(0, 22), n.x, n.y + r + 9 / scale);
          }
          ctx.globalAlpha = 1;
        }}
        nodePointerAreaPaint={(node, color, ctx) => {
          const n = node as GNode & { x: number; y: number };
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(n.x, n.y, 7, 0, Math.PI * 2);
          ctx.fill();
        }}
      />
      {data.nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="eyebrow">No entities yet — fire the webhook to populate the graph</p>
        </div>
      )}
    </div>
  );
}
