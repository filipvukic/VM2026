import { describe, it, expect } from "vitest";
import { classifyTip, outcomeOf, DEFAULT_SCORING } from "../scoring";

describe("scoring rules (README: exact 5 / outcome 2 / floor 1)", () => {
  it("exact score = 5p", () => {
    expect(classifyTip([2, 1], 2, 1)).toEqual({ result: "exact", points: 5 });
    expect(classifyTip([0, 0], 0, 0)).toEqual({ result: "exact", points: 5 });
  });
  it("right outcome, wrong score = 2p", () => {
    expect(classifyTip([3, 1], 2, 0)).toEqual({ result: "outcome", points: 2 }); // home win
    expect(classifyTip([0, 2], 1, 3)).toEqual({ result: "outcome", points: 2 }); // away win
    expect(classifyTip([1, 1], 2, 2)).toEqual({ result: "outcome", points: 2 }); // draw
  });
  it("wrong outcome = 1p floor", () => {
    expect(classifyTip([2, 0], 0, 1)).toEqual({ result: "floor", points: 1 });
    expect(classifyTip([1, 1], 2, 0)).toEqual({ result: "floor", points: 1 });
  });
  it("outcomeOf", () => {
    expect(outcomeOf(2, 0)).toBe("H");
    expect(outcomeOf(0, 2)).toBe("B");
    expect(outcomeOf(1, 1)).toBe("X");
  });
  it("respects custom scoring config", () => {
    expect(classifyTip([1, 0], 1, 0, { exact: 10, outcome: 4, floor: 2 })).toEqual({ result: "exact", points: 10 });
  });
  it("default config is 5/2/1", () => {
    expect(DEFAULT_SCORING).toEqual({ exact: 5, outcome: 2, floor: 1 });
  });
});
