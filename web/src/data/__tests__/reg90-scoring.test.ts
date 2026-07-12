import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { classifyTipForMatch } from "../scoring";
import { reg90Score } from "../../lib/reg90";
import type { Match } from "../types";

// A knockout tip is scored on the 90-MINUTE result — extra time and penalties decide
// who advances, not the tip. Argentina–Switzerland (1–1 after 90, 3–1 a.e.t.) was shown
// as a miss on every profile because those views called classifyTip(tip, m.ga, m.gb)
// with the FINAL score, while the match view used reg90Score. These tests pin the rule
// and, crucially, ban the raw call that caused the split.

const ko = (over: Partial<Match>): Match =>
  ({ id: "x", stage: "ko", status: "played", ga: 3, gb: 1, scorers: [], ...over }) as Match;

describe("reg90Score", () => {
  it("ignores extra-time goals (Argentina–Switzerland)", () => {
    const m = ko({
      ga: 3, gb: 1,
      scorers: [
        { minute: "10", score: [1, 0] },
        { minute: "67", score: [1, 1] },
        { minute: "112", score: [2, 1] },
        { minute: "120+1", score: [3, 1] },
      ] as Match["scorers"],
    });
    expect(reg90Score(m)).toEqual([1, 1]);
  });

  it("counts second-half stoppage time as regulation", () => {
    const m = ko({
      ga: 2, gb: 1,
      scorers: [{ minute: "90+4", score: [2, 1] }] as Match["scorers"],
    });
    expect(reg90Score(m)).toEqual([2, 1]);
  });

  it("falls back to score − extraTime when the goal events are missing", () => {
    const m = ko({
      ga: 3, gb: 1,
      scorers: [],
      scoreDetail: { fullTime: [3, 1], extraTime: [2, 0], penalties: null, duration: "EXTRA_TIME" },
    });
    expect(reg90Score(m)).toEqual([1, 1]);
  });

  it("group matches are scored on the final score", () => {
    const m = ko({ stage: "group", ga: 3, gb: 1, scorers: [] });
    expect(reg90Score(m)).toEqual([3, 1]);
  });
});

describe("classifyTipForMatch", () => {
  const m = ko({
    ga: 3, gb: 1,
    scorers: [
      { minute: "10", score: [1, 0] },
      { minute: "67", score: [1, 1] },
      { minute: "112", score: [2, 1] },
      { minute: "120+1", score: [3, 1] },
    ] as Match["scorers"],
  });

  it("grades a 1–1 tip as EXACT, not as a miss", () => {
    expect(classifyTipForMatch(m, [1, 1])).toEqual({ result: "exact", points: 5 });
  });
  it("grades the after-extra-time score as the floor", () => {
    expect(classifyTipForMatch(m, [3, 1])).toEqual({ result: "floor", points: 1 });
  });
  it("grades any draw as the right outcome", () => {
    expect(classifyTipForMatch(m, [0, 0])).toEqual({ result: "outcome", points: 2 });
  });
  it("grades a home win as the floor (the 90-min result was a draw)", () => {
    expect(classifyTipForMatch(m, [2, 0])).toEqual({ result: "floor", points: 1 });
  });
});

// The real defence: no view may judge a tip against m.ga/m.gb. Everything must go
// through classifyTipForMatch / reg90Score, or knockout tips get graded on the
// after-extra-time score in that view only — exactly the bug that shipped.
describe("no view grades a tip on the final score", () => {
  const SRC = join(__dirname, "..", "..");
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) return f === "__tests__" ? [] : walk(p);
      return /\.tsx?$/.test(f) ? [p] : [];
    });

  it("has no classifyTip(..., m.ga, m.gb) call anywhere", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      if (/data[/\\]scoring\.ts$/.test(file)) continue; // the helper itself
      const src = readFileSync(file, "utf8");
      // classifyTip(...) fed anything that looks like a raw final score (.ga / .gb)
      for (const call of src.match(/classifyTip\([^)]*\)/g) || []) {
        if (/\.ga\b|\.gb\b/.test(call)) offenders.push(`${file.replace(SRC, "src")}: ${call}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
