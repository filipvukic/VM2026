// Typed boot fetch of the committed JSON files. Absolute paths hit the domain
// root where the engine commits them — same code works at /app/ (preview) and /
// (after swap). In dev, vite.config's serveRootData plugin serves them off disk.
import type { CoachesDb, OddsFile, PlayersDb, RawData, RawFixture } from "./types";

export interface LoadedData {
  data: RawData;
  fixtures: RawFixture[];
  players: PlayersDb | null;
  coaches: CoachesDb | null;
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

let seq = 0;
export async function loadRealData(): Promise<LoadedData> {
  // Fully-unique bust per call (ms + counter) so no fetch can ever be served
  // from an HTTP cache — combined with cache:no-store this guarantees freshness.
  const bust = "?t=" + Date.now() + "-" + ++seq;
  const [data, fixtures, players, oddsRaw, xgRaw, coaches] = await Promise.all([
    getJson<RawData>("/data.json" + bust),
    getJson<RawFixture[]>("/fixtures.json" + bust),
    getJson<PlayersDb>("/players.json"),
    getJson<OddsFile>("/odds.json" + bust),
    getJson<Record<string, { home: number; away: number }>>("/xg.json" + bust),
    getJson<CoachesDb>("/coaches.json" + bust),
  ]);

  if (!data) throw new Error("data.json saknas");
  const fx = fixtures || [];

  // Merge decimal odds (the-odds-api) onto fixtures so match cards can show 1 X 2.
  const oddsDb = oddsRaw ? oddsRaw.odds || {} : {};
  const xgDb = xgRaw || {};
  for (const m of fx) {
    const o = oddsDb[String(m.id)];
    if (o) {
      const home = o.home ?? o.H;
      const draw = o.draw ?? o.D;
      const away = o.away ?? o.A;
      if (home != null && draw != null && away != null) {
        (m as RawFixture).cardOdds = { home, draw, away };
      }
    }
    const xg = xgDb[String(m.id)];
    if (xg) (m as RawFixture).xg = xg;
  }

  return { data, fixtures: fx, players: players ?? null, coaches: coaches ?? null };
}
