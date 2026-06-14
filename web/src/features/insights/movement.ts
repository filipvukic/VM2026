import { classifyTip } from "../../data/scoring";
import { svDateKey } from "../../lib/format";
import type { Dataset } from "../../data/types";

export interface Movement {
  pointsToday: number;
  deltaRank: number; // + = climbed since start of today
}

/** Per-player points gained during TODAY's played matches + the resulting
 *  position change vs the start-of-day table. */
export function computeMovement(ds: Dataset): Record<string, Movement> {
  const today = svDateKey(ds.now);
  const todayPlayed = ds.allMatches.filter(
    (m) => m.status === "played" && m.ga != null && m.gb != null && svDateKey(m.kickoff) === today
  );

  const pointsToday: Record<string, number> = {};
  ds.players.forEach((p) => {
    let pts = 0;
    todayPlayed.forEach((m) => {
      const t = p.tips[m.id];
      if (t) pts += classifyTip(t, m.ga!, m.gb!).points;
    });
    pointsToday[p.id] = pts;
  });

  // start-of-day standings = current total minus today's points
  const startSorted = ds.players
    .map((p) => ({ id: p.id, start: p.total - pointsToday[p.id], name: p.name }))
    .sort((a, b) => b.start - a.start || a.name.localeCompare(b.name));
  const startRank: Record<string, number> = {};
  let prev: number | null = null,
    rank = 0;
  startSorted.forEach((p, i) => {
    if (p.start !== prev) {
      rank = i + 1;
      prev = p.start;
    }
    startRank[p.id] = rank;
  });

  const out: Record<string, Movement> = {};
  ds.players.forEach((p) => {
    out[p.id] = { pointsToday: pointsToday[p.id], deltaRank: startRank[p.id] - p.rank };
  });
  return out;
}

export interface RaceSeries {
  days: string[]; // labels
  lines: { id: string; name: string; color: string; points: number[] }[];
}

/** Cumulative match points per match-day, per player (for the race chart). */
export function computeRace(ds: Dataset): RaceSeries {
  const played = ds.allMatches
    .filter((m) => m.status === "played" && m.ga != null && m.gb != null)
    .sort((a, b) => +a.kickoff - +b.kickoff);
  const dayKeys: string[] = [];
  played.forEach((m) => {
    const k = svDateKey(m.kickoff);
    if (!dayKeys.includes(k)) dayKeys.push(k);
  });

  const lines = ds.players.map((p) => {
    const points = dayKeys.map((day) => {
      let cum = 0;
      played.forEach((m) => {
        if (svDateKey(m.kickoff) <= day) {
          const t = p.tips[m.id];
          if (t) cum += classifyTip(t, m.ga!, m.gb!).points;
        }
      });
      return cum;
    });
    return { id: p.id, name: p.name, color: p.color, points };
  });

  return { days: dayKeys, lines };
}
