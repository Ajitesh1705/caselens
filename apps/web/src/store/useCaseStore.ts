import { create } from "zustand";

export type FeedKind =
  | "started"
  | "progress"
  | "entity"
  | "edge"
  | "event"
  | "complete";

export interface FeedItem {
  id: string;
  kind: FeedKind;
  text: string;
  ts: number;
  entityType?: string;
}

export type RightTab = "search" | "ask" | "report";

interface CaseState {
  caseId: string | null;
  connected: boolean;
  selectedEntityId: string | null;
  // Timeline brush window in epoch ms, or null for "all".
  brush: { start: number; end: number } | null;
  feed: FeedItem[];
  activeTab: RightTab;

  setCaseId: (id: string) => void;
  setConnected: (c: boolean) => void;
  selectEntity: (id: string | null) => void;
  setBrush: (b: { start: number; end: number } | null) => void;
  pushFeed: (item: Omit<FeedItem, "id" | "ts">) => void;
  clearFeed: () => void;
  setTab: (t: RightTab) => void;
}

let feedSeq = 0;

export const useCaseStore = create<CaseState>((set) => ({
  caseId: null,
  connected: false,
  selectedEntityId: null,
  brush: null,
  feed: [],
  activeTab: "ask",

  setCaseId: (id) => set({ caseId: id, selectedEntityId: null, brush: null, feed: [] }),
  setConnected: (connected) => set({ connected }),
  selectEntity: (selectedEntityId) => set({ selectedEntityId }),
  setBrush: (brush) => set({ brush }),
  pushFeed: (item) =>
    set((s) => ({
      feed: [
        { ...item, id: `f${feedSeq++}`, ts: Date.now() },
        ...s.feed,
      ].slice(0, 60),
    })),
  clearFeed: () => set({ feed: [] }),
  setTab: (activeTab) => set({ activeTab }),
}));
