import type { Match } from "../data/types";

// Wall-clock minutes after which a match is certainly over, even if the feed
// still says "live" (the engine/CI can lag in flipping it to FINISHED). Generous
// margins: group = regulation + half-time + stoppage; ko also allows extra time
// and penalties.
export function maxLiveMin(stage: string): number {
  return stage === "group" ? 135 : 185;
}

// Is the match actually live RIGHT NOW (and not a stale "live" the feed forgot to
// close)? Use this for every live badge/indicator/clock instead of a bare
// `status === "live"`.
export function isLive(m: Match): boolean {
  return m.status === "live" && !m.likelyEnded;
}

// Should the match be shown as finished? Either the feed says so, or it's a stale
// "live" that's certainly over.
export function isEnded(m: Match): boolean {
  return m.status === "played" || (m.status === "live" && !!m.likelyEnded);
}
