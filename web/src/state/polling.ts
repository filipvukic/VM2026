// Adaptive polling — ported from the legacy boot (index.html ~4955-4967):
// 15s while a match is live, 30s for a recent-finished match still missing
// events, else 60s. Updates the store; build() re-derives off the version bump.
import { loadRealData } from "../data/load";
import { useStore } from "./store";
import type { RawFixture } from "../data/types";

function hasLive(fx: RawFixture[]): boolean {
  return fx.some((x) => x.status === "IN_PLAY" || x.status === "PAUSED" || x.status === "LIVE" || x.status === "SUSPENDED");
}
function hasRecentFinishedWithoutEvents(fx: RawFixture[]): boolean {
  const cutoff = Date.now() - 48 * 3600 * 1000;
  return fx.some(
    (x) => x.status === "FINISHED" && !(x.goals && x.goals.length) && new Date(x.utcDate).getTime() > cutoff
  );
}

let timer: ReturnType<typeof setTimeout> | null = null;
let started = false;

export function startPolling() {
  if (started) return; // guard against StrictMode double-invoke / double timers
  started = true;
  const tick = async () => {
    try {
      const d = await loadRealData();
      useStore.getState().setLoaded(d);
    } catch {
      useStore.getState().setError();
    } finally {
      schedule();
    }
  };
  const schedule = () => {
    const fx = useStore.getState().raw?.fixtures || [];
    const interval = hasLive(fx) ? 15000 : hasRecentFinishedWithoutEvents(fx) ? 30000 : 60000;
    timer = setTimeout(tick, interval);
  };
  schedule();
}

export function stopPolling() {
  if (timer) clearTimeout(timer);
  timer = null;
  started = false;
}
