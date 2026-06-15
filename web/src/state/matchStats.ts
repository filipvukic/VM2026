// Lazy loader for detailed per-match stats (matchstats/<fixtureId>.json) and the
// player index. Files are fetched on demand (when a match/player view opens), not
// upfront — they're large and only needed when looked at.
import { useEffect } from "react";
import { create } from "zustand";
import type { MatchStatsDetail, MatchStatsIndex } from "../data/types";

type Entry = MatchStatsDetail | "loading" | "missing";

interface State {
  byId: Record<string, Entry>;
  index: MatchStatsIndex | null | "loading" | "missing";
  load: (fixtureId: string | number) => void;
  loadIndex: () => void;
}

const bust = () => `?t=${Math.floor(Date.now() / 60000)}`; // 1-min cache bucket

export const useMatchStatsStore = create<State>((set, get) => ({
  byId: {},
  index: null,
  load: (fixtureId) => {
    const id = String(fixtureId);
    const cur = get().byId[id];
    if (cur && cur !== "missing") return; // loaded or loading
    set((s) => ({ byId: { ...s.byId, [id]: "loading" } }));
    fetch(`/matchstats/${id}.json${bust()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: MatchStatsDetail) => set((s) => ({ byId: { ...s.byId, [id]: data } })))
      .catch(() => set((s) => ({ byId: { ...s.byId, [id]: "missing" } })));
  },
  loadIndex: () => {
    const cur = get().index;
    if (cur && cur !== "missing") return;
    set({ index: "loading" });
    fetch(`/matchstats/index.json${bust()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: MatchStatsIndex) => set({ index: data }))
      .catch(() => set({ index: "missing" }));
  },
}));

/** Returns the match's detailed stats (or null while loading / if unavailable). */
export function useMatchStats(fixtureId: string | number | null): MatchStatsDetail | null {
  const id = fixtureId == null ? "" : String(fixtureId);
  const entry = useMatchStatsStore((s) => (id ? s.byId[id] : undefined));
  const load = useMatchStatsStore((s) => s.load);
  useEffect(() => {
    if (id) load(id);
  }, [id, load]);
  return entry && entry !== "loading" && entry !== "missing" ? entry : null;
}

export function useStatsIndex(): MatchStatsIndex | null {
  const index = useMatchStatsStore((s) => s.index);
  const loadIndex = useMatchStatsStore((s) => s.loadIndex);
  useEffect(() => {
    loadIndex();
  }, [loadIndex]);
  return index && index !== "loading" && index !== "missing" ? index : null;
}
