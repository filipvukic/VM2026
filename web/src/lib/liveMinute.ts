import type { Match } from "../data/types";

// Live match minute. The engine writes the REAL ESPN match clock (e.g. "73") into
// m.minute on each run; we advance it locally by the time since the data was
// produced so it ticks smoothly between updates, and it self-corrects every
// engine run. Falls back to "LIVE" when no clock is available.
export function liveMinuteText(m: Match, updatedAtMs: number | null, nowMs: number): string {
  if (m.minute == null) return "LIVE";
  const s = String(m.minute);
  if (!/^\d+$/.test(s)) return s + "'"; // e.g. "90+2", "HT"
  const base = parseInt(s, 10);
  const elapsed = updatedAtMs ? Math.max(0, Math.floor((nowMs - updatedAtMs) / 60000)) : 0;
  const shown = Math.min(base + elapsed, 90 + 9);
  return shown + "'";
}
