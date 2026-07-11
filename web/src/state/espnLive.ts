import { create } from "zustand";
import { fetchEspnEvents, fetchEventSummary, type EspnLite, type EspnSummary } from "../lib/espnLive";
import { useStore } from "./store";

interface EspnLiveState {
  events: EspnLite[];
  summaries: Record<string, EspnSummary>; // by ESPN event id (lineups/subs/cards)
  version: number; // bumps on each refresh → dataset re-overlays
  set: (e: EspnLite[], s: Record<string, EspnSummary>) => void;
}

// Persist the scoreboard (score/status/minute) so a reload's FIRST render already
// reflects the latest known state instead of the (possibly stale) committed data.json
// — e.g. a match that finished after the engine's last commit no longer flashes as
// "live 0–1" before the async refresh lands. Events only (small); summaries refetch.
const ESPN_LS = "vm_espn_events";
const ESPN_TTL = 30 * 60_000;
function loadCachedEvents(): EspnLite[] {
  try {
    const raw = localStorage.getItem(ESPN_LS);
    if (!raw) return [];
    const { ts, events } = JSON.parse(raw) as { ts: number; events: EspnLite[] };
    return Date.now() - ts < ESPN_TTL ? events || [] : [];
  } catch {
    return [];
  }
}
function saveCachedEvents(events: EspnLite[]) {
  try { localStorage.setItem(ESPN_LS, JSON.stringify({ ts: Date.now(), events })); } catch { /* full / private mode */ }
}

export const useEspnLive = create<EspnLiveState>((set) => ({
  events: loadCachedEvents(),
  summaries: {},
  version: 0,
  set: (events, summaries) => {
    saveCachedEvents(events);
    set((s) => ({ events, summaries, version: s.version + 1 }));
  },
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
let inFlight = false;
let started = false;

// Self-scheduling poller. Pulls the scoreboard (all matches) every cycle, and the
// per-match SUMMARY (lineups/subs/cards) for matches in the live window — line-ups
// are fetched once (cached), live matches refetched each cycle for fresh subs.
//
// The chain must never be able to die: a stalled cycle leaves the last ESPN
// snapshot on screen, so the live minute silently freezes while the match plays on.
// `inFlight` (not the timer handle) marks a cycle in progress, the re-arm lives in
// `finally` so it survives any throw, and the fetches time out rather than hang.
export function startEspnLive() {
  if (started) return;
  started = true;

  const tick = async () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (inFlight) return; // a cycle is already running — it re-arms itself when done
    inFlight = true;
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
      if (events.length) useEspnLive.getState().set(events, next);
    } catch {
      /* ignore */
    } finally {
      inFlight = false;
      const live = inLiveWindow(Date.now());
      const delay = hidden ? (live ? 60000 : 300000) : live ? 25000 : 240000;
      timer = setTimeout(tick, delay);
    }
  };

  tick();
  if (typeof document !== "undefined") {
    // Coming back to the app (unlock / app switch) must always refresh: the clock
    // on screen is as old as the last cycle, and a phone that slept through the
    // scheduled one can be minutes behind. tick() self-guards via `inFlight`.
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) tick();
    });
  }
}
