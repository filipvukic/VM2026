// Single memoized build() of the whole dataset, provided via context so a poll
// (version bump) re-derives once — not once per component. Views read slices.
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { build } from "../data/build";
import type { CoachesDb, Dataset, PlayersDb } from "../data/types";
import { overlayFixtures } from "../lib/espnLive";
import { useStore } from "./store";
import { useEspnLive } from "./espnLive";

interface Ctx {
  ds: Dataset;
  players: PlayersDb | null;
  coaches: CoachesDb | null;
}
const DatasetContext = createContext<Ctx | null>(null);

export function DatasetProvider({ children }: { children: ReactNode }) {
  const raw = useStore((s) => s.raw);
  const version = useStore((s) => s.version);
  const espnEvents = useEspnLive((s) => s.events);
  const espnSummaries = useEspnLive((s) => s.summaries);
  const espnVersion = useEspnLive((s) => s.version);

  const value = useMemo<Ctx | null>(() => {
    if (!raw) return null;
    // Overlay live ESPN data onto the (possibly stale) committed fixtures before
    // building: scores/status/minute/venue/goals + lineups/subs/cards — so live &
    // just-finished matches show in real time even when the engine cron is lagging.
    // Display-only; points stay engine-driven.
    const fixtures = overlayFixtures(raw.fixtures, espnEvents, espnSummaries, Date.now());
    return { ds: build(raw.data, fixtures), players: raw.players, coaches: raw.coaches };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, espnVersion]);

  if (!value) return null;
  return <DatasetContext.Provider value={value}>{children}</DatasetContext.Provider>;
}

export function useData(): Dataset {
  const ctx = useContext(DatasetContext);
  if (!ctx) throw new Error("useData outside DatasetProvider");
  return ctx.ds;
}
export function usePlayersDb(): PlayersDb | null {
  const ctx = useContext(DatasetContext);
  return ctx?.players ?? null;
}
export function useCoaches(): CoachesDb | null {
  const ctx = useContext(DatasetContext);
  return ctx?.coaches ?? null;
}
