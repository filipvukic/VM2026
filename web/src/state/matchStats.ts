// Lazy loader for detailed per-match stats (matchstats/<fixtureId>.json) and the
// player index. Files are fetched on demand (when a match/player view opens), not
// upfront — they're large and only needed when looked at. While a match is LIVE
// the file is rewritten (FotMob) every ~30 min, so an open view re-fetches on an
// interval instead of caching the first load forever.
import { useEffect } from "react";
import { create } from "zustand";
import type { Match, MatchStatsDetail, MatchStatsIndex } from "../data/types";
import { EN_TO_SV } from "../data/static/names";
import { PUSH_WORKER_URL } from "../lib/pushConfig";

// Swedish display name → English spellings, so the worker can match FotMob's English
// names (same inverse App.tsx uses for the push deep-link; some have >1 spelling).
const SV_TO_EN: Record<string, string[]> = {};
for (const [en, sv] of Object.entries(EN_TO_SV)) (SV_TO_EN[sv] ||= []).push(en);

// Worker endpoint serving NEAR-LIVE FotMob stats for a match (or undefined when no
// worker is configured). The browser can't hit FotMob directly (no CORS) and the
// GitHub stats job is throttled to ~hourly, so during a LIVE match we pull fresh
// ratings/xG/shots through the worker instead of the (stale) committed file.
export function liveStatsUrl(m: Match, teams: Record<string, { name: string } | undefined>): string | undefined {
  if (!PUSH_WORKER_URL || !m.home || !m.away || m._realId == null) return undefined;
  const cands = (code: string) => { const sv = teams[code]?.name || code; return [sv, ...(SV_TO_EN[sv] || [])].join("~"); };
  const q = new URLSearchParams({
    home: cands(m.home), away: cands(m.away),
    date: m.kickoff ? m.kickoff.toISOString().slice(0, 10) : "",
    hTla: m.home, aTla: m.away, fx: String(m._realId),
  });
  return `${PUSH_WORKER_URL}/matchstats?${q.toString()}`;
}

type Entry = MatchStatsDetail | "loading" | "missing";

interface State {
  byId: Record<string, Entry>;
  index: MatchStatsIndex | null | "loading" | "missing";
  load: (fixtureId: string | number, force?: boolean, src?: string) => void;
  loadIndex: () => void;
}

const bust = () => `?t=${Math.floor(Date.now() / 30000)}`; // 30s cache bucket

export const useMatchStatsStore = create<State>((set, get) => ({
  byId: {},
  index: null,
  load: (fixtureId, force = false, src) => {
    const id = String(fixtureId);
    const cur = get().byId[id];
    if (cur === "loading") return; // a fetch is already in flight
    if (!force && cur && cur !== "missing") return; // have it and not refreshing
    // Show the loading state only when there's nothing to display yet — a live
    // refresh keeps the current data on screen until the new data arrives.
    if (cur == null || cur === "missing") set((s) => ({ byId: { ...s.byId, [id]: "loading" } }));
    const file = `/matchstats/${id}.json${bust()}`;
    const grab = (u: string) => fetch(u, { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject()));
    // Live: try the worker proxy first (fresh FotMob), fall back to the committed
    // file if the worker is down / can't find the match.
    (src ? grab(src).catch(() => grab(file)) : grab(file))
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
export function useMatchStats(fixtureId: string | number | null, live = false, liveUrl?: string): MatchStatsDetail | null {
  const id = fixtureId == null ? "" : String(fixtureId);
  const src = live ? liveUrl : undefined; // only pull from the worker while live
  const entry = useMatchStatsStore((s) => (id ? s.byId[id] : undefined));
  const load = useMatchStatsStore((s) => s.load);
  useEffect(() => {
    if (id) load(id, false, src);
  }, [id, src, load]);
  useEffect(() => {
    if (!id || !live) return;
    const t = setInterval(() => load(id, true, src), 30000);
    return () => clearInterval(t);
  }, [id, live, src, load]);
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

/**
 * True while a match's detailed stats are still being fetched and there's nothing
 * to show yet — so a view can render a skeleton instead of a blank/placeholder.
 * (A missing fixtureId returns false: those matches will never have stats.)
 */
export function useMatchStatsPending(fixtureId: string | number | null): boolean {
  const id = fixtureId == null ? "" : String(fixtureId);
  const entry = useMatchStatsStore((s) => (id ? s.byId[id] : undefined));
  return !!id && (entry === undefined || entry === "loading");
}

/** True while the player-stats index is still loading (nothing resolved yet). */
export function useStatsIndexPending(): boolean {
  const index = useMatchStatsStore((s) => s.index);
  return index == null || index === "loading";
}
