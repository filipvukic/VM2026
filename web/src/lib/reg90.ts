import type { Match } from "../data/types";

// Leading whole minute of a label: "90+5" → 90, "105" → 105, 45 → 45.
function leadingMin(min: string | number | null | undefined): number {
  if (min == null) return 0;
  if (typeof min === "number") return min;
  const m = /^(\d+)/.exec(String(min).trim());
  return m ? parseInt(m[1], 10) : 0;
}

// The score after 90 minutes (ordinarie tid) — what knockout tips are judged on.
// A KO match can be level after 90 and then decided in extra time / penalties, so
// the tip is a guess of the 90-minute result (draws valid). Extra-time goals
// (minute > 90) don't count; the running score of the last regulation goal is
// authoritative (handles own goals / penalties scored in play). Group matches just
// use the final score. Returns null when there's nothing to score yet.
export function reg90Score(m: Match): [number, number] | null {
  if (m.stage !== "ko") return m.ga != null && m.gb != null ? [m.ga, m.gb] : null;
  const goals = m.scorers || [];
  const reg = goals.filter((g) => leadingMin(g.minute) <= 90);
  if (reg.length) {
    let h = 0, a = 0;
    for (const g of reg) if (g.score) { h = Math.max(h, g.score[0]); a = Math.max(a, g.score[1]); }
    return [h, a];
  }
  // No regulation goals recorded: with no events at all we can't separate ET from
  // regulation → fall back to the final score; with events but none ≤90 it's a real
  // 0–0 at the 90-minute mark (any goals came in extra time).
  if (!goals.length) return m.ga != null && m.gb != null ? [m.ga, m.gb] : null;
  return [0, 0];
}
