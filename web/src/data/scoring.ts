// Per-match tip classification used by the client-side standings recompute
// (index.html ~791-797). NOTE: the authoritative totals (points, exact) come
// from the engine via leaderboard.match_points / exact_count. This client recompute
// only derives the `correct` / `other` display counts, using simple outcome
// comparison (H/B/X) for every played match — reproduced verbatim for parity.

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
