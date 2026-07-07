import type { Match } from "../data/types";

// Live match minute. The engine writes the REAL ESPN match clock (e.g. "73") into
// m.minute on each run; we advance it locally by the time since the data was
// produced so it ticks smoothly between updates, and it self-corrects every
// engine run. Falls back to "LIVE" when no clock is available.
export function liveMinuteText(m: Match, updatedAtMs: number | null, nowMs: number): string {
  // certainly over but the feed still says live (engine/CI lag) → show "Slut"
  if (m.likelyEnded) return "Slut";
  // Knockout matches can run to extra time (≈120') and beyond, so the ceiling we
  // clamp an estimated/ticked clock to must be higher than a 90-minute group game.
  const cap = m.stage === "ko" ? 120 + 9 : 90 + 9;
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
    // Wall-clock minus a ~15-min half-time break ≈ the playing minute. Past 90,
    // show broadcast-style stoppage ("90+7") capped low, never a runaway "107".
    const est = mins - 15;
    if (est <= 90) return est + "'";
    return "90+" + Math.min(est - 90, 15) + "'";
  }
  const s = String(m.minute);
  if (/^(HT|HALFTIME|PAUS|HALF[\s-]?TIME)$/i.test(s)) return "Paus";
  // overlay minute is the live ESPN clock, refreshed ~every 25s — show it as-is
  // instead of ticking it forward from the (possibly stale) engine timestamp.
  if (m.liveOverlay) return s + "'";
  if (!/^\d+$/.test(s)) return s + "'"; // e.g. "90+2"
  const base = parseInt(s, 10);
  const elapsed = updatedAtMs ? Math.max(0, Math.floor((nowMs - updatedAtMs) / 60000)) : 0;
  const shown = Math.min(base + elapsed, cap);
  // A group match has no extra time, so a ticked minute past 90 is stoppage → "90+X".
  if (m.stage !== "ko" && shown > 90) return "90+" + Math.min(shown - 90, 15) + "'";
  return shown + "'";
}
