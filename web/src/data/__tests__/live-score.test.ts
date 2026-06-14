// Live matches: the match-level `score` on the free feed can lag behind the
// goal events, which showed "0–0" with a goal already listed. build() must
// derive the live score from the goal events instead — without ever touching a
// finished match's official score. Uses the real committed MEX–RSA fixture
// (2–0, goals carry a cumulative [home,away] tally) flipped to a live 0–0.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "../build";
import { isLive } from "../../lib/liveState";
import type { RawData, RawFixture } from "../types";

const root = (p: string) => fileURLToPath(new URL("../../../../" + p, import.meta.url));
const readJson = (p: string) => JSON.parse(readFileSync(root(p), "utf-8"));
const data: RawData = readJson("data.json");
const fixtures: RawFixture[] = readJson("fixtures.json");

const MEX_RSA = 537327;
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

function buildWith(mut: (f: RawFixture) => void) {
  const fx = clone(fixtures);
  const m = fx.find((x) => x.id === MEX_RSA)!;
  mut(m);
  const ds = build(data, fx);
  return ds.allMatches.find((x) => x.id === "G" + MEX_RSA)!; // group matches are keyed "G"+fixtureId
}

describe("live score derived from goal events", () => {
  it("uses the cumulative goal tally when the feed score lags at 0–0", () => {
    const m = buildWith((f) => {
      f.status = "IN_PLAY";
      f.score = [0, 0]; // feed lagging
      // goals already list two Mexico goals with score [1,0] then [2,0]
    });
    expect(m.status).toBe("live");
    expect([m.ga, m.gb]).toEqual([2, 0]);
  });

  it("falls back to counting goals per team when events carry no cumulative score", () => {
    const m = buildWith((f) => {
      f.status = "IN_PLAY";
      f.score = [0, 0];
      (f.goals || []).forEach((g: any) => delete g.score);
    });
    expect([m.ga, m.gb]).toEqual([2, 0]);
  });

  it("flags a stale 'live' match as likelyEnded so it isn't shown as live forever", () => {
    // MEX–RSA kicked off 2026-06-11, so any 'live' status now is far past full
    // time — the safety net for the engine/CI lag in flipping it to FINISHED.
    const m = buildWith((f) => {
      f.status = "IN_PLAY";
    });
    expect(m.status).toBe("live"); // status untouched (scoring stays engine-driven)
    expect(m.likelyEnded).toBe(true);
    expect(isLive(m)).toBe(false); // but indicators treat it as not-live
  });

  it("never overrides a FINISHED match's official score", () => {
    const m = buildWith((f) => {
      f.status = "FINISHED";
      f.score = [2, 0];
      // even if a stray extra goal event existed, finished score stays official
      (f.goals || []).push({ minute: "90", team: "MEX", scorer: "x", score: [3, 0], type: "REGULAR" } as any);
    });
    expect([m.ga, m.gb]).toEqual([2, 0]);
  });
});
