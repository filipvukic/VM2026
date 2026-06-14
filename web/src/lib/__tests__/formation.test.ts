// The pitch must lay players out by the feed's `formation` string, not by the
// coarse per-player position labels. Curaçao's real 4-3-1-2 (below, taken from
// the live Germany–Curaçao feed) has FIVE players tagged as generic midfield,
// which the old label-binning collapsed into a wrong 4-5-1.
import { describe, it, expect } from "vitest";
import { buildRows } from "../formation";
import type { RawLineup } from "../../data/types";

const p = (name: string, position: string): any => ({ name, position });

const curacao: RawLineup = {
  formation: "4-3-1-2",
  lineup: [
    p("Eloy Room", "G"),
    p("Armando Obispo", "CD-L"),
    p("Riechedly Bazoer", "CD-R"),
    p("Deveron Fonville", "LB"),
    p("Sherel Floranus", "RB"),
    p("Sontje Hansen", "M"),
    p("Leandro Bacuna", "CM"),
    p("Tahith Chong", "AM"),
    p("Juninho Bacuna", "LM"),
    p("Livano Comenencia", "RM"),
    p("Jürgen Locadia", "CF-R"),
  ],
} as any;

describe("buildRows honours the formation string", () => {
  it("lays 4-3-1-2 out as GK + 4-3-1-2, not 4-5-1", () => {
    const rows = buildRows(curacao);
    expect(rows.map((r) => r.length)).toEqual([1, 4, 3, 1, 2]);
    expect(rows[0][0].name).toBe("Eloy Room"); // GK row first (back)
  });

  it("falls back to position bands when no formation string is given", () => {
    const rows = buildRows({ ...curacao, formation: undefined } as any);
    // GK + defence(4) + midfield(6 generic) + attack(1) — coarse, but valid rows
    expect(rows[0].length).toBe(1);
    expect(rows.reduce((n, r) => n + r.length, 0)).toBe(11);
  });

  it("does not crash on an empty lineup", () => {
    expect(buildRows({ formation: "4-4-2", lineup: [] } as any)).toEqual([]);
  });
});
