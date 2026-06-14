// Single memoized build() of the whole dataset, provided via context so a poll
// (version bump) re-derives once — not once per component. Views read slices.
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { build } from "../data/build";
import type { Dataset, PlayersDb } from "../data/types";
import { useStore } from "./store";

interface Ctx {
  ds: Dataset;
  players: PlayersDb | null;
}
const DatasetContext = createContext<Ctx | null>(null);

export function DatasetProvider({ children }: { children: ReactNode }) {
  const raw = useStore((s) => s.raw);
  const version = useStore((s) => s.version);

  const value = useMemo<Ctx | null>(() => {
    if (!raw) return null;
    return { ds: build(raw.data, raw.fixtures), players: raw.players };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

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
