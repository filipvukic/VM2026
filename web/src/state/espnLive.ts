import { create } from "zustand";
import { fetchEspnEvents, fetchEventSummary, type EspnLite, type EspnSummary } from "../lib/espnLive";
import { useStore } from "./store";

interface EspnLiveState {
  events: EspnLite[];
  summaries: Record<string, EspnSummary>; // by ESPN event id (lineups/subs/cards)
  version: number; // bumps on each refresh → dataset re-overlays
  set: (e: EspnLite[], s: Record<string, EspnSummary>) => void;
}

export const useEspnLive = create<EspnLiveState>((set) => ({
  events: [],
  summaries: {},
  version: 0,
  set: (events, summaries) => set((s) => ({ events, summaries, version: s.version + 1 })),
}));

function inLiveWindow(nowMs: number): boolean {
  const fx = useStore.getState().raw?.fixtures;
  if (!fx) return false;
  return fx.some((f) => {
    const ko = Date.parse(f.utcDate || "");
    // poll fast from ~75 min before kickoff (line-ups drop) until ~4 h after
    return !Number.isNaN(ko) && nowMs - ko > -75 * 60000 && nowMs - ko < 4 * 3600 * 1000;
  });
}

let timer: ReturnType<typeof setTimeout> | null = null;

// Self-scheduling poller. Pulls the scoreboard (all matches) every cycle, and the
// per-match SUMMARY (lineups/subs/cards) for matches in the live window — line-ups
// are fetched once (cached), live matches refetched each cycle for fresh subs.
export function startEspnLive() {
  if (timer) return;
  const tick = async () => {
    timer = null;
    const now = Date.now();
    const hidden = typeof document !== "undefined" && document.hidden;
    // Keep polling even when the tab is hidden (slower) so live updates — and the
    // goal/kickoff NOTIFICATIONS that ride on them — still fire in a background tab.
    try {
      const events = await fetchEspnEvents(now);
      const cur = useEspnLive.getState().summaries;
      const next = { ...cur };
      const want = events.filter((e) => {
        const ko = Date.parse(e.koUtc || "");
        // ~75 min before kickoff (line-ups) until ~4 h after (so just-finished
        // matches keep their subs/cards/odds even after full-time)
        const win = !Number.isNaN(ko) && now - ko > -90 * 60000 && now - ko < 4 * 3600 * 1000;
        return win && (e.state === "in" || e.state === "pre" || e.state === "post");
      });
      await Promise.all(
        want.map(async (e) => {
          if (e.state !== "in" && next[e.id]) return; // pre/post fetched once; live refetched
          const sm = await fetchEventSummary(e.id);
          if (sm) next[e.id] = sm;
        })
      );
      useEspnLive.getState().set(events, next);
    } catch {
      /* ignore */
    }
    const live = inLiveWindow(Date.now());
    const delay = hidden ? (live ? 60000 : 300000) : live ? 25000 : 240000;
    timer = setTimeout(tick, delay);
  };
  tick();
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && timer) {
        clearTimeout(timer);
        timer = null;
        tick();
      }
    });
  }
}
