// Golden master: run the ORIGINAL legacy adapter (extracted from index.html)
// against the committed JSON, then assert the new TS build() produces identical
// scoring / standings / group tables / bracket projection. Any drift fails here.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "../build";
import type { Dataset, RawData, RawFixture } from "../types";

const root = (p: string) => fileURLToPath(new URL("../../../../" + p, import.meta.url));
const readJson = (p: string) => JSON.parse(readFileSync(root(p), "utf-8"));

const data: RawData = readJson("data.json");
const fixtures: RawFixture[] = readJson("fixtures.json");

// build() now scores LIVE matches provisionally (so the leaderboard moves on every
// goal), which the legacy engine did not. Neutralise any in-progress match to a
// not-yet-counted state so the parity check stays about FINISHED-match scoring and
// is deterministic regardless of what's live when the suite runs.
const LIVE_STATUS = new Set(["IN_PLAY", "PAUSED", "LIVE", "SUSPENDED"]);
const fixturesNoLive: RawFixture[] = fixtures.map((f) => {
  if (!LIVE_STATUS.has(f.status)) return f;
  const { score, minute, ...rest } = f; // drop the in-progress result
  void score;
  void minute;
  return { ...rest, status: "TIMED" };
});

// --- extract the legacy adapter IIFE from legacy.html (the original single-file
// site, kept as the parity reference after the swap) and run it in Node ---
function legacyBuild(d: RawData, fx: RawFixture[]): any {
  const html = readFileSync(root("legacy.html"), "utf-8");
  const start = html.indexOf('(function () {\n  "use strict";');
  if (start < 0) throw new Error("legacy adapter start marker not found");
  const end = html.indexOf("})();", start);
  if (end < 0) throw new Error("legacy adapter end marker not found");
  const code = html.slice(start, end + "})();".length);
  const win: any = { __REAL_DATA__: { data: d, fixtures: fx } };
  // eslint-disable-next-line no-new-func
  const fn = new Function("window", code + "\nreturn window.VM.build;");
  const legacy = fn(win);
  return legacy();
}

// Normalize to the fields that MUST match (logic), ignoring incidental
// enrichments (KO lineups/venues we intentionally added in the port).
function project(ds: Dataset | any) {
  const standings = ds.standings.map((s: any) => ({
    name: s.name,
    total: s.total,
    exact: s.exact,
    correct: s.correct,
    other: s.other,
    rank: s.rank,
    points: s.points,
    bonusPts: s.bonusPts,
    bonus: s.bonus,
  }));
  const groupTables: Record<string, any[]> = {};
  Object.keys(ds.groupTables).forEach((L) => {
    groupTables[L] = ds.groupTables[L].map((r: any) => ({
      code: r.code,
      p: r.p,
      ms: r.ms,
      gm: r.gm,
      im: r.im,
      sp: r.sp,
      v: r.v,
      o: r.o,
      f: r.f,
      pos: r.pos,
    }));
  });
  const ko: Record<string, any[]> = {};
  (["r32", "r16", "qf", "sf", "third", "final"] as const).forEach((rd) => {
    ko[rd] = ds.knockout[rd].map((m: any) => ({
      id: m.id,
      fifa: m.fifa,
      home: m.home,
      away: m.away,
      projHome: m.projHome ?? null,
      projAway: m.projAway ?? null,
      fromA: m.fromA ?? null,
      fromB: m.fromB ?? null,
      status: m.status,
      ga: m.ga,
      gb: m.gb,
      winner: m.winner,
    }));
  });
  const forms: Record<string, string[]> = {};
  Object.keys(ds.forms)
    .sort()
    .forEach((c) => {
      forms[c] = ds.forms[c].map((f: any) => `${f.vs}-${f.gf}-${f.ga}`);
    });
  return {
    state: ds.state,
    teamsKeys: Object.keys(ds.teams).sort(),
    matchesCount: ds.matches.length,
    allMatchesCount: ds.allMatches.length,
    groupTables,
    standings,
    ko,
    forms,
    pot: ds.pot,
  };
}

describe("golden master: TS build() == legacy window.VM.build()", () => {
  const legacy = legacyBuild(data, fixturesNoLive);
  const next = build(data, fixturesNoLive);

  const pL = project(legacy);
  const pN = project(next);

  it("standings SCORING (totals, exact, correct/other, points, bonus) matches legacy", () => {
    // The PORT deliberately changed the tie-break: rank now separates equal-points
    // players by exacts → correct-outcome (legacy shared the rank on total alone),
    // which can also reorder equal-points players. So parity is asserted on the
    // per-player scoring only — name-keyed, ignoring rank and array order. Rank
    // behaviour is asserted separately below.
    const byName = (arr: any[]) =>
      arr
        .slice()
        .sort((a: any, b: any) => a.name.localeCompare(b.name))
        .map((s: any) => ({
          name: s.name, total: s.total, exact: s.exact, correct: s.correct,
          other: s.other, points: s.points, bonusPts: s.bonusPts, bonus: s.bonus,
        }));
    expect(byName(pN.standings)).toEqual(byName(pL.standings));
  });
  it("group tables match", () => {
    expect(pN.groupTables).toEqual(pL.groupTables);
  });
  it("knockout bracket projection matches", () => {
    expect(pN.ko).toEqual(pL.ko);
  });
  it("forms: no duplicate entries, and only legacy entries (dedup bug fixed)", () => {
    // build() now dedupes WC matches already present in team_forms; the legacy
    // adapter double-counted them. Assert the fix: each team's form has NO
    // duplicate (opp+score) entries, and every entry also existed in legacy
    // (we removed dupes, never invented results).
    for (const code of Object.keys(pN.forms)) {
      const mine = pN.forms[code];
      expect(new Set(mine).size).toBe(mine.length); // no duplicates
      const legacySet = new Set(pL.forms[code] || []);
      for (const key of mine) expect(legacySet.has(key)).toBe(true);
    }
  });
  it("live matches add provisional points to the leaderboard (every goal counts)", () => {
    const liveFx = fixtures.filter((f) => LIVE_STATUS.has(f.status));
    const liveIds = new Set(liveFx.map((f) => f.id));
    const liveTipped = (data.matches || []).some((m) => liveIds.has(m.id) && (m.tips || []).length > 0);
    if (!liveTipped) return; // committed snapshot has no live, tipped match — nothing to assert
    const sum = (ds: any) => ds.standings.reduce((a: number, s: any) => a + s.points, 0);
    const withLive = sum(build(data, fixtures));
    const without = sum(build(data, fixturesNoLive));
    // a live group match awards >=1 (floor) to everyone who tipped it
    expect(withLive).toBeGreaterThan(without);
  });

  it("team set, match counts, state and pot match", () => {
    // build() aliases ISO-vs-FIFA code mismatches (URY→URU) so it does NOT spawn
    // the phantom, flag-less team the legacy adapter left behind. Otherwise equal.
    expect(pN.teamsKeys).toEqual(pL.teamsKeys.filter((k: string) => k !== "URY"));
    expect(pN.matchesCount).toBe(pL.matchesCount);
    expect(pN.allMatchesCount).toBe(pL.allMatchesCount);
    expect(pN.state).toBe(pL.state);
    // Legacy pot carries vestigial empty p1/p2 arrays (dead podium-picks cruft)
    // intentionally dropped in the port; compare the meaningful fields.
    expect({ perPlayer: pN.pot.perPlayer, total: pN.pot.total, currency: pN.pot.currency }).toEqual({
      perPlayer: pL.pot.perPlayer,
      total: pL.pot.total,
      currency: pL.pot.currency,
    });
  });

  it("prize split has 3 tiers that sum EXACTLY to the pot, ordered 1st≥2nd≥3rd", () => {
    const split = next.pot.split;
    expect(split).toHaveLength(3);
    // the whole pot is handed out — no krona lost or invented by rounding
    expect(split.reduce((a, b) => a + b, 0)).toBe(next.pot.total);
    // 50/30/20 → strictly descending tiers
    expect(split[0]).toBeGreaterThanOrEqual(split[1]);
    expect(split[1]).toBeGreaterThanOrEqual(split[2]);
    // matches the engine's committed split when present
    if (data.pot?.split) {
      expect(split).toEqual([data.pot.split["1"], data.pot.split["2"], data.pot.split["3"]]);
    }
  });

  it("rank uses the full tie-break: players share a rank IFF equal on total+exact+correct", () => {
    const s = next.standings;
    // list is in rank order and ranks never decrease
    for (let i = 1; i < s.length; i++) expect(s[i].rank).toBeGreaterThanOrEqual(s[i - 1].rank);
    // two players share a rank exactly when they're equal on every tie-break level
    for (let i = 0; i < s.length; i++) {
      for (let j = i + 1; j < s.length; j++) {
        const allEqual = s[i].total === s[j].total && s[i].exact === s[j].exact && s[i].correct === s[j].correct;
        expect(s[i].rank === s[j].rank).toBe(allEqual);
      }
    }
    // equal points but MORE exacts must rank strictly higher (the user's case)
    for (let i = 1; i < s.length; i++) {
      const hi = s[i - 1], lo = s[i];
      if (hi.total === lo.total && hi.rank !== lo.rank) {
        expect(hi.exact > lo.exact || (hi.exact === lo.exact && hi.correct >= lo.correct)).toBe(true);
      }
    }
  });

  it("every player's prize is set and ALL prizes sum to exactly the pot (ties pool & split)", () => {
    const s = next.standings;
    expect(s.every((p: any) => typeof p.prize === "number")).toBe(true);
    expect(s.reduce((a: number, p: any) => a + p.prize, 0)).toBe(next.pot.total);
    // nobody outside the prize places gets money
    for (const p of s) if (p.rank > 3) expect(p.prize).toBe(0);
    // players who share a rank get the same prize (split equally)
    const byRank: Record<number, number[]> = {};
    for (const p of s) (byRank[p.rank] ||= []).push(p.prize);
    for (const prizes of Object.values(byRank)) {
      expect(Math.max(...prizes) - Math.min(...prizes)).toBeLessThanOrEqual(1); // equal ±1 kr rounding
    }
  });
});
