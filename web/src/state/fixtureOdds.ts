// Lazy, cached real-odds fetch for a single fixture (used by the win-chance box
// when the committed/overlay data has no real odds yet). One fetch per fixture
// per session; null means "no real odds available".
import { useEffect, useState } from "react";
import { fetchFixtureOdds } from "../lib/espnLive";

type Odds = { homeML: number; awayML: number } | null;
const cache = new Map<string, Odds>();
const inflight = new Map<string, Promise<void>>();

export function useFixtureOdds(
  id: string | null,
  home?: string | null,
  away?: string | null,
  koUtc?: string | null,
): Odds {
  const [, force] = useState(0);
  useEffect(() => {
    if (!id || !home || !away || !koUtc || cache.has(id)) return;
    let live = true;
    if (!inflight.has(id)) {
      inflight.set(
        id,
        fetchFixtureOdds(home, away, koUtc)
          .then((o) => { cache.set(id, o); })
          .catch(() => { cache.set(id, null); })
          .finally(() => { inflight.delete(id); })
      );
    }
    inflight.get(id)!.then(() => { if (live) force((x) => x + 1); });
    return () => { live = false; };
  }, [id, home, away, koUtc]);
  return id ? cache.get(id) ?? null : null;
}
