import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CaseGraphResponse } from "@caselens/shared";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";
import { useCaseStore } from "../store/useCaseStore";
import { entityStyle } from "../lib/entityStyle";

export function useCases() {
  return useQuery({ queryKey: ["cases"], queryFn: api.listCases });
}

export function useCaseGraph(caseId: string | null) {
  return useQuery({
    queryKey: ["graph", caseId],
    queryFn: () => api.getGraph(caseId!),
    enabled: !!caseId,
  });
}

// Subscribes to the live ingestion protocol: joins the case room, merges
// discovered entities/edges/events into the query cache for instant animation,
// pushes items to the feed, and reconciles authoritative state on completion.
export function useLiveIngestion(caseId: string | null) {
  const qc = useQueryClient();
  const { setConnected, pushFeed } = useCaseStore();

  useEffect(() => {
    if (!caseId) return;
    const socket = getSocket();

    const join = () => {
      setConnected(true);
      socket.emit("case:join", { caseId });
    };
    if (socket.connected) join();
    socket.on("connect", join);
    socket.on("disconnect", () => setConnected(false));

    const key = ["graph", caseId];
    const patch = (fn: (g: CaseGraphResponse) => CaseGraphResponse) =>
      qc.setQueryData<CaseGraphResponse>(key, (g) => (g ? fn(g) : g));

    socket.on("ingestion:started", ({ filename }) =>
      pushFeed({ kind: "started", text: `Ingesting ${filename}` }),
    );
    socket.on("ingestion:progress", ({ stage, pct }) =>
      pushFeed({ kind: "progress", text: `${stage} · ${pct}%` }),
    );
    socket.on("entity:discovered", ({ entity }) => {
      patch((g) =>
        g.entities.some((e) => e.id === entity.id)
          ? g
          : { ...g, entities: [...g.entities, entity] },
      );
      pushFeed({
        kind: "entity",
        text: `${entityStyle(entity.type).label}: ${entity.label}`,
        entityType: entity.type,
      });
    });
    socket.on("edge:discovered", ({ edge }) => {
      patch((g) =>
        g.edges.some((e) => e.id === edge.id) ? g : { ...g, edges: [...g.edges, edge] },
      );
      pushFeed({ kind: "edge", text: `Link: ${edge.relation}` });
    });
    socket.on("event:discovered", ({ event }) => {
      patch((g) =>
        g.events.some((e) => e.id === event.id) ? g : { ...g, events: [...g.events, event] },
      );
      pushFeed({ kind: "event", text: event.description.slice(0, 60) });
    });
    socket.on("ingestion:complete", ({ summary }) => {
      pushFeed({ kind: "complete", text: summary });
      // Reconcile evidence statuses / merged entities with server truth.
      void qc.invalidateQueries({ queryKey: key });
    });

    return () => {
      socket.off("connect", join);
      socket.off("disconnect");
      socket.off("ingestion:started");
      socket.off("ingestion:progress");
      socket.off("entity:discovered");
      socket.off("edge:discovered");
      socket.off("event:discovered");
      socket.off("ingestion:complete");
    };
  }, [caseId, qc, setConnected, pushFeed]);
}
