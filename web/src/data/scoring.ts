// Per-match tip classification used by the client-side standings recompute
// (index.html ~791-797). NOTE: the authoritative totals (points, exact) come
// from the engine via leaderboard.match_points / exact_count. This client recompute
// only derives the `correct` / `other` display counts, using simple outcome
// comparison (H/B/X) for every played match — reproduced verbatim for parity.

import type { Match } from "./types";
import { reg90Score } from "../lib/reg90";

export type TipResult = "exact" | "outcome" | "floor";

export interface ScoringConfig {
  exact: number;
  outcome: number;
  floor: number;
}

export const DEFAULT_SCORING: ScoringConfig = { exact: 5, outcome: 2, floor: 1 };

export function outcomeOf(a: number, b: number): "H" | "B" | "X" {
  return a > b ? "H" : a < b ? "B" : "X";
}

export function classifyTip(
  tip: [number, number],
  ga: number,
  gb: number,
  cfg: ScoringConfig = DEFAULT_SCORING
): { result: TipResult; points: number } {
  if (tip[0] === ga && tip[1] === gb) return { result: "exact", points: cfg.exact };
  if (outcomeOf(tip[0], tip[1]) === outcomeOf(ga, gb)) return { result: "outcome", points: cfg.outcome };
  return { result: "floor", points: cfg.floor };
}

// Judge a tip against the score it is ACTUALLY scored on: the 90-minute result for
// knockout matches (extra time / penalties decide who advances, not the tip), the
// final score for group matches. `reg90Score` encodes that rule.
//
// Always go through this — never call classifyTip(tip, m.ga, m.gb) directly. Passing
// the final score grades a knockout tip on the after-extra-time result, which is how
// Argentina–Switzerland (1–1 after 90, 3–1 a.e.t.) showed up as a miss on the profiles
// while the match view — the one place that used reg90Score — said it was exact.
// Returns null when the match has no score to judge against yet.
export function classifyTipForMatch(
  m: Match,
  tip: [number, number],
  cfg: ScoringConfig = DEFAULT_SCORING
): { result: TipResult; points: number } | null {
  const sc = reg90Score(m);
  if (!sc || sc[0] == null || sc[1] == null) return null;
  return classifyTip(tip, sc[0], sc[1], cfg);
}
