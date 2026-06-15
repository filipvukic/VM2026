import { create } from "zustand";
import { fetchEspnEvents, type EspnLite } from "../lib/espnLive";
import { useStore } from "./store";

interface EspnLiveState {
  events: EspnLite[];
  version: number; // bumps on each refresh → dataset re-overlays
  set: (e: EspnLite[]) => void;
}

export const useEspnLive = create<EspnLiveState>((set) => ({
  events: [],
  version: 0,
  set: (events) => set((s) => ({ events, version: s.version + 1 })),
}));

// Is any fixture inside the live window (so it's worth polling ESPN frequently)?
function inLiveWindow(nowMs: number): boolean {
  const fx = useStore.getState().raw?.fixtures;
  if (!fx) return false;
  return fx.some((f) => {
    const ko = Date.parse(f.utcDate || "");
    return !Number.isNaN(ko) && nowMs - ko > -45 * 60000 && nowMs - ko < 4 * 3600 * 1000;
  });
}

let timer: ReturnType<typeof setTimeout> | null = null;

// Self-scheduling poller: ~25s while a match is in the live window, otherwise a
// lazy 4 min just to catch the next kickoff. Pauses while the tab is hidden.
export function startEspnLive() {
  if (timer) return;
  const tick = async () => {
    timer = null;
    const now = Date.now();
    const hidden = typeof document !== "undefined" && document.hidden;
    if (!hidden) {
      try {
        const events = await fetchEspnEvents(now);
        useEspnLive.getState().set(events);
      } catch {
        /* ignore */
      }
    }
    const delay = hidden ? 60000 : inLiveWindow(Date.now()) ? 25000 : 240000;
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
