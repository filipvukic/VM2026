import { create } from "zustand";
import { PUSH_WORKER_URL } from "../lib/pushConfig";

// LIVE knockout tips straight from the worker (KV) — the same tips the engine merges
// into the public pool, but without the ~hourly engine-cron lag. Used to overlay
// PoolResults / the consensus stats so "who tipped what" updates in near-real-time.
// Keyed by fixture id (string) → list of {name, tip}. Falls back silently to the
// engine-merged data.json tips when the worker can't be reached (e.g. localhost CORS).
export type PubTip = { name: string; tip: [number, number] };
export type KoTipsByFixture = Record<string, PubTip[]>;

interface KoTipsState {
  byFixture: KoTipsByFixture;
  version: number; // bumps each refresh so consumers re-render
  load: () => Promise<void>;
}

export const useKoPublicTips = create<KoTipsState>((set) => ({
  byFixture: {},
  version: 0,
  load: async () => {
    try {
      const r = await fetch(PUSH_WORKER_URL + "/ko/public");
      if (!r.ok) return;
      const d = (await r.json()) as KoTipsByFixture;
      set((s) => ({ byFixture: d || {}, version: s.version + 1 }));
    } catch {
      /* offline / CORS (localhost) — keep the engine-merged tips */
    }
  },
}));

// The current live tips for one fixture (by real fixture id), or undefined.
export const liveTipsFor = (realId?: number | null): PubTip[] | undefined =>
  realId == null ? undefined : useKoPublicTips.getState().byFixture[String(realId)];

let timer: ReturnType<typeof setTimeout> | null = null;

// Self-pacing poller: refresh the public KO tips every ~30s (2min when the tab is
// hidden). The endpoint is edge-cached ~20s, so this is cheap. Started from main.tsx.
export function startKoTips() {
  if (timer) return;
  const tick = async () => {
    timer = null;
    await useKoPublicTips.getState().load();
    const hidden = typeof document !== "undefined" && document.hidden;
    timer = setTimeout(tick, hidden ? 120000 : 30000);
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
