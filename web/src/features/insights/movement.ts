import { classifyTipForMatch } from "../../data/scoring";
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
  const exactToday: Record<string, number> = {};
  const correctToday: Record<string, number> = {};
  ds.players.forEach((p) => {
    let pts = 0, ex = 0, co = 0;
    todayPlayed.forEach((m) => {
      const t = p.tips[m.id];
      if (!t) return;
      const c = classifyTipForMatch(m, t);
      if (!c) return;
      pts += c.points;
      if (c.result === "exact") ex++;
      else if (c.result === "outcome") co++;
    });
    pointsToday[p.id] = pts;
    exactToday[p.id] = ex;
    correctToday[p.id] = co;
  });

  // start-of-day standings = current figures minus what today's matches added,
  // ranked with the SAME tie-break as the live table (total → exakta → rätt utgång)
  // so a placement only ever separated by the tie-break shows no phantom ▲▼ move.
  const startSorted = ds.players
    .map((p) => ({
      id: p.id,
      name: p.name,
      total: p.total - pointsToday[p.id],
      exact: p.exact - exactToday[p.id],
      correct: p.correct - correctToday[p.id],
    }))
    .sort((a, b) => b.total - a.total || b.exact - a.exact || b.correct - a.correct || a.name.localeCompare(b.name));
  const startRank: Record<string, number> = {};
  startSorted.forEach((p, i) => {
    const prev = startSorted[i - 1];
    startRank[p.id] =
      i > 0 && prev.total === p.total && prev.exact === p.exact && prev.correct === p.correct
        ? startRank[prev.id]
        : i + 1;
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
          if (t) cum += classifyTipForMatch(m, t)?.points ?? 0;
        }
      });
      return cum;
    });
    return { id: p.id, name: p.name, color: p.color, points };
  });

  return { days: dayKeys, lines };
}
