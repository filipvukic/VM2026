import type { Match } from "../data/types";

// Live match minute. The engine writes the REAL ESPN match clock (e.g. "73") into
// m.minute on each run; we advance it locally by the time since the data was
// produced so it ticks smoothly between updates, and it self-corrects every
// engine run. Falls back to "LIVE" when no clock is available.
export function liveMinuteText(m: Match, updatedAtMs: number | null, nowMs: number): string {
  if (m.minute == null) {
    // No clock from the feed (e.g. a match served only by football-data without
    // an ESPN clock): estimate from kickoff so we still show a minute rather
    // than a bare "LIVE". Approximate — allows ~15 min for half-time — and is
    // overridden the moment the real ESPN clock arrives on the next engine run.
    const ko = m.kickoff ? m.kickoff.getTime() : NaN;
    if (Number.isNaN(ko) || nowMs < ko) return "LIVE";
    const mins = Math.floor((nowMs - ko) / 60000);
    if (mins <= 45) return Math.max(1, mins) + "'";
    if (mins <= 60) return "Paus";
    return Math.min(mins - 15, 90 + 9) + "'";
  }
  const s = String(m.minute);
  if (/^(HT|HALFTIME|PAUS|HALF[\s-]?TIME)$/i.test(s)) return "Paus";
  if (!/^\d+$/.test(s)) return s + "'"; // e.g. "90+2"
  const base = parseInt(s, 10);
  const elapsed = updatedAtMs ? Math.max(0, Math.floor((nowMs - updatedAtMs) / 60000)) : 0;
  const shown = Math.min(base + elapsed, 90 + 9);
  return shown + "'";
}
