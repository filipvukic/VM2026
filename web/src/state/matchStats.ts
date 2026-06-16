// Lazy loader for detailed per-match stats (matchstats/<fixtureId>.json) and the
// player index. Files are fetched on demand (when a match/player view opens), not
// upfront — they're large and only needed when looked at. While a match is LIVE
// the file is rewritten (FotMob) every ~30 min, so an open view re-fetches on an
// interval instead of caching the first load forever.
import { useEffect } from "react";
import { create } from "zustand";
import type { MatchStatsDetail, MatchStatsIndex } from "../data/types";

type Entry = MatchStatsDetail | "loading" | "missing";

interface State {
  byId: Record<string, Entry>;
  index: MatchStatsIndex | null | "loading" | "missing";
  load: (fixtureId: string | number, force?: boolean) => void;
  loadIndex: () => void;
}

const bust = () => `?t=${Math.floor(Date.now() / 30000)}`; // 30s cache bucket

export const useMatchStatsStore = create<State>((set, get) => ({
  byId: {},
  index: null,
  load: (fixtureId, force = false) => {
    const id = String(fixtureId);
    const cur = get().byId[id];
    if (cur === "loading") return; // a fetch is already in flight
    if (!force && cur && cur !== "missing") return; // have it and not refreshing
    // Show the loading state only when there's nothing to display yet — a live
    // refresh keeps the current data on screen until the new file arrives.
    if (cur == null || cur === "missing") set((s) => ({ byId: { ...s.byId, [id]: "loading" } }));
    fetch(`/matchstats/${id}.json${bust()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: MatchStatsDetail) => set((s) => ({ byId: { ...s.byId, [id]: data } })))
      .catch(() =>
        set((s) => {
          const prev = s.byId[id];
          // a failed refresh must not blank out data we already had
          return prev && prev !== "loading" && prev !== "missing" ? s : { byId: { ...s.byId, [id]: "missing" } };
        })
      );
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

/**
 * Returns the match's detailed stats (or null while loading / if unavailable).
 * Pass `live` for an in-progress match to re-fetch the file every 30 s so ratings,
 * heatmaps, shots and the FotMob line-up keep updating while the view is open.
 */
export function useMatchStats(fixtureId: string | number | null, live = false): MatchStatsDetail | null {
  const id = fixtureId == null ? "" : String(fixtureId);
  const entry = useMatchStatsStore((s) => (id ? s.byId[id] : undefined));
  const load = useMatchStatsStore((s) => s.load);
  useEffect(() => {
    if (id) load(id);
  }, [id, load]);
  useEffect(() => {
    if (!id || !live) return;
    const t = setInterval(() => load(id, true), 30000);
    return () => clearInterval(t);
  }, [id, live, load]);
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
