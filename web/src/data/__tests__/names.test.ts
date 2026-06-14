// Guards against name-matching regressions: every group-stage team in the
// committed fixtures must resolve to a flag (iso) so the UI never shows a
// blank flag, and every team in data.json group tables must resolve too.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "../build";
import { isoFor } from "../static/names";
import type { RawData, RawFixture } from "../types";

const root = (p: string) => fileURLToPath(new URL("../../../../" + p, import.meta.url));
const readJson = (p: string) => JSON.parse(readFileSync(root(p), "utf-8"));
const data: RawData = readJson("data.json");
const fixtures: RawFixture[] = readJson("fixtures.json");

describe("name / flag resolution", () => {
  it("every real (non-TBD) team resolves to an ISO flag code", () => {
    const ds = build(data, fixtures);
    const missing = Object.values(ds.teams)
      .filter((t) => t.code.indexOf("TBD") !== 0 && t.name !== "Att lottas")
      .filter((t) => !t.iso)
      .map((t) => `${t.code} (${t.name})`);
    expect(missing).toEqual([]);
  });

  it("isoFor handles Swedish/English/accented spellings", () => {
    expect(isoFor("Sweden", "SWE")).toBe("se");
    expect(isoFor("Türkiye", "TUR")).toBe("tr");
    expect(isoFor("Côte d'Ivoire", "CIV")).toBe("ci");
    expect(isoFor(null, "USA")).toBe("us");
  });
});
