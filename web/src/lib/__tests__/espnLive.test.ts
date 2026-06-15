// The client-side ESPN live overlay must update display status/score/minute for
// in-window matches when the committed data is stale, match across spelling
// variants, and never touch finalised or out-of-window matches.
import { describe, it, expect } from "vitest";
import { overlayFixtures, type EspnLite } from "../espnLive";

const NOW = Date.parse("2026-06-15T02:30:00Z");
const fx = (over: Partial<any>): any => ({
  id: 1, status: "TIMED", utcDate: "2026-06-15T02:00:00Z",
  home: "Sweden", away: "Tunisia", homeTla: "SWE", awayTla: "TUN", score: null, minute: null,
  ...over,
});
const ev = (over: Partial<EspnLite>): EspnLite => ({
  homeNorm: "sweden", awayNorm: "tunisia", state: "in", home: 0, away: 0, clock: "5'",
  homeId: "h", awayId: "a", venue: null, goals: [], ...over,
});

describe("overlayFixtures", () => {
  it("marks a stale TIMED match live with ESPN score + minute", () => {
    const [m] = overlayFixtures([fx({})], [ev({ home: 1, away: 0, clock: "23'" })], NOW);
    expect(m.status).toBe("IN_PLAY");
    expect(m.score).toEqual([1, 0]);
    expect(m.minute).toBe("23");
  });

  it("marks a finished (post) match FINISHED with the final score", () => {
    const [m] = overlayFixtures([fx({})], [ev({ state: "post", home: 2, away: 1, clock: "FT" })], NOW);
    expect(m.status).toBe("FINISHED");
    expect(m.score).toEqual([2, 1]);
  });

  it("matches across spelling variants (Turkey / Türkiye) and keeps orientation", () => {
    const f = fx({ home: "Australia", away: "Turkey", utcDate: "2026-06-15T01:30:00Z" });
    const e = ev({ homeNorm: "australia", awayNorm: "turkiye", state: "post", home: 2, away: 0 });
    const [m] = overlayFixtures([f], [e], NOW);
    expect(m.status).toBe("FINISHED");
    expect(m.score).toEqual([2, 0]);
  });

  it("flips orientation when ESPN lists the teams the other way round", () => {
    const e = ev({ homeNorm: "tunisia", awayNorm: "sweden", state: "in", home: 1, away: 0 });
    const [m] = overlayFixtures([fx({})], [e], NOW); // our fixture is Sweden(home) vs Tunisia(away)
    expect(m.score).toEqual([0, 1]); // Tunisia 1 → away column
  });

  it("never downgrades a match the engine already finalised", () => {
    const f = fx({ status: "FINISHED", score: [3, 0] });
    const [m] = overlayFixtures([f], [ev({ state: "in", home: 0, away: 0 })], NOW);
    expect(m.status).toBe("FINISHED");
    expect(m.score).toEqual([3, 0]);
  });

  it("overlays the real venue and goal events from the scoreboard", () => {
    const e = ev({
      home: 1, away: 0, clock: "9'",
      venue: { stadium: "Estadio BBVA", city: "Guadalupe", country: "Mexico" },
      goals: [{ minute: "9", espnTeamId: "h", scorer: "Yasin Ayari", type: "Goal - Volley" }],
    });
    const [m] = overlayFixtures([fx({})], [e], NOW);
    expect(m.venue).toEqual({ stadium: "Estadio BBVA", city: "Guadalupe", country: "Mexico" });
    expect(m.goals).toHaveLength(1);
    expect(m.goals![0]).toMatchObject({ team: "SWE", scorer: "Yasin Ayari", type: "REGULAR", score: [1, 0] });
  });

  it("maps goal team correctly when orientation is flipped", () => {
    const e = ev({
      homeNorm: "tunisia", awayNorm: "sweden", homeId: "tun", awayId: "swe", home: 0, away: 1,
      goals: [{ minute: "9", espnTeamId: "swe", scorer: "Ayari", type: "Goal" }],
    });
    const [m] = overlayFixtures([fx({})], [e], NOW); // our fixture: Sweden home, Tunisia away
    expect(m.goals![0].team).toBe("SWE"); // ESPN away (swe) → our home column
  });

  it("keeps the engine's richer goals when it already has as many", () => {
    const f = fx({ goals: [{ minute: "9", team: "SWE", scorer: "Ayari", assist: "Bernström", type: "REGULAR" }] });
    const e = ev({ home: 1, away: 0, goals: [{ minute: "9", espnTeamId: "h", scorer: "Ayari", type: "Goal" }] });
    const [m] = overlayFixtures([f], [e], NOW);
    expect(m.goals![0].assist).toBe("Bernström"); // engine goal kept
  });

  it("ignores matches far outside the live window", () => {
    const f = fx({ utcDate: "2026-06-10T02:00:00Z" }); // 5 days ago
    const [m] = overlayFixtures([f], [ev({ state: "in", home: 2, away: 2 })], NOW);
    expect(m.status).toBe("TIMED");
  });
});
