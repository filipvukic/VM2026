// Knockout bracket projection — ported verbatim from index.html ~576-712.
// Builds the official FIFA 2026 R32→Final tree, projects teams from group
// tables (top-2 + best-8 third-placed), then overlays real KO fixtures.
import type { GroupTableRow, Knockout, KoRound, Match } from "./types";
import { KO_VENUES } from "./static/venues";

interface SlotSpec {
  p?: 1 | 2 | 3;
  g?: string;
  gs?: string;
  winM?: number;
  loseM?: number;
}
interface Slot {
  code: string | null;
  projCode: string | null;
  label: string;
}

export function bestThirdFromGroups(letters: string, groupTables: Record<string, GroupTableRow[]>): string | null {
  const cands: (GroupTableRow & { group: string })[] = [];
  letters.split("").forEach((L) => {
    const r = groupTables[L] && groupTables[L][2];
    if (r && r.code && r.code.indexOf("TBD") !== 0) cands.push({ ...r, group: L });
  });
  cands.sort((a, b) => b.p - a.p || b.ms - a.ms || b.gm - a.gm || a.group.localeCompare(b.group));
  return cands[0] ? cands[0].code : null;
}

// FIFA places the 8 best third-placed teams into specific R32 slots so each plays
// exactly once. Each third-slot's `gs` lists the groups whose third MAY land there;
// the correct fill is therefore a bipartite matching of the 8 qualifying thirds ↔ the
// 8 slots, every third used once. (The old code called bestThirdFromGroups per slot,
// which re-picked the strongest third for every overlapping set — so the same team got
// assigned to several slots, the cause of the duplicate teams in the tree.)
function assignThirds(gsList: string[], groupTables: Record<string, GroupTableRow[]>): Record<string, string> {
  const thirds: { g: string; p: number; ms: number; gm: number }[] = [];
  "ABCDEFGHIJKL".split("").forEach((L) => {
    const r = groupTables[L] && groupTables[L][2];
    if (r && r.code && r.code.indexOf("TBD") !== 0) thirds.push({ g: L, p: r.p, ms: r.ms, gm: r.gm });
  });
  thirds.sort((a, b) => b.p - a.p || b.ms - a.ms || b.gm - a.gm || a.g.localeCompare(b.g));
  const qual = new Set(thirds.slice(0, 8).map((t) => t.g)); // the 8 best thirds' groups
  const matchGroup: Record<string, string> = {}; // group -> the gs-slot it's matched to
  const augment = (gs: string, seen: Set<string>): boolean => {
    for (const g of gs.split("")) {
      if (!qual.has(g) || seen.has(g)) continue;
      seen.add(g);
      if (matchGroup[g] === undefined || augment(matchGroup[g], seen)) {
        matchGroup[g] = gs;
        return true;
      }
    }
    return false;
  };
  gsList.forEach((gs) => augment(gs, new Set()));
  const assign: Record<string, string> = {}; // gs-slot -> assigned group
  Object.keys(matchGroup).forEach((g) => (assign[matchGroup[g]] = g));
  return assign;
}

function slotResolve(spec: SlotSpec, groupTables: Record<string, GroupTableRow[]>, thirdAssign: Record<string, string>): Slot {
  if (spec.winM) return { code: null, projCode: null, label: "Vinnare M" + spec.winM };
  if (spec.loseM) return { code: null, projCode: null, label: "Förlorare M" + spec.loseM };
  if (spec.p === 1 || spec.p === 2) {
    const row = groupTables[spec.g!] && groupTables[spec.g!][spec.p - 1];
    const proj = row && row.code && row.code.indexOf("TBD") !== 0 ? row.code : null;
    return { code: null, projCode: proj, label: (spec.p === 1 ? "Vinnare " : "Tvåa ") + spec.g };
  }
  if (spec.p === 3 && spec.gs) {
    const g = thirdAssign[spec.gs];
    const row = g ? groupTables[g] && groupTables[g][2] : null;
    const proj = row && row.code && row.code.indexOf("TBD") !== 0 ? row.code : null;
    return { code: null, projCode: proj, label: "Bästa 3:a (" + spec.gs.split("").join("/") + ")" };
  }
  return { code: null, projCode: null, label: "TBD" };
}

const R32_SPECS: { fifa: number; a: SlotSpec; b: SlotSpec }[] = [
  { fifa: 73, a: { p: 2, g: "A" }, b: { p: 2, g: "B" } },
  { fifa: 75, a: { p: 1, g: "E" }, b: { p: 3, gs: "ABCDF" } },
  { fifa: 74, a: { p: 1, g: "C" }, b: { p: 2, g: "F" } },
  { fifa: 77, a: { p: 2, g: "E" }, b: { p: 2, g: "I" } },
  { fifa: 83, a: { p: 1, g: "H" }, b: { p: 2, g: "J" } },
  { fifa: 84, a: { p: 2, g: "K" }, b: { p: 2, g: "L" } },
  { fifa: 81, a: { p: 1, g: "G" }, b: { p: 3, gs: "AEHIJ" } },
  { fifa: 82, a: { p: 1, g: "D" }, b: { p: 3, gs: "BEFIJ" } },
  { fifa: 76, a: { p: 1, g: "F" }, b: { p: 2, g: "C" } },
  { fifa: 78, a: { p: 1, g: "I" }, b: { p: 3, gs: "CDFGH" } },
  { fifa: 79, a: { p: 1, g: "A" }, b: { p: 3, gs: "CEFHI" } },
  { fifa: 80, a: { p: 1, g: "L" }, b: { p: 3, gs: "EHIJK" } },
  { fifa: 86, a: { p: 2, g: "D" }, b: { p: 2, g: "G" } },
  { fifa: 88, a: { p: 1, g: "K" }, b: { p: 3, gs: "DEIJL" } },
  { fifa: 85, a: { p: 1, g: "B" }, b: { p: 3, gs: "EFGIJ" } },
  { fifa: 87, a: { p: 1, g: "J" }, b: { p: 2, g: "H" } },
];
const R16_FIFA = [89, 90, 93, 94, 91, 92, 95, 96];
const QF_FIFA = [97, 98, 99, 100];
const SF_FIFA = [101, 102];

function makeKoMatch(prefix: string, idx: number, slotA: Slot, slotB: Slot, fifa: number | null): Match {
  return {
    id: prefix + idx,
    stage: "ko",
    group: null,
    round: "Slutspel",
    fifa: fifa || null,
    home: slotA.code,
    away: slotB.code,
    projHome: slotA.projCode || null,
    projAway: slotB.projCode || null,
    fromA: slotA.label,
    fromB: slotB.label,
    kickoff: new Date(Date.UTC(2026, 6, 19, 19, 0)),
    ga: null,
    gb: null,
    status: "upcoming",
    winner: null,
    pen: null,
    venue: (fifa && KO_VENUES[fifa]) || null,
    tippas: true,
    // filled by overlay when a real fixture exists:
    tips: [],
    scorers: [],
    cards: [],
    subs: [],
    stats: null,
  };
}

export const KO_ROUNDS: KoRound[] = [
  { key: "r32", label: "Sextondelsfinal", count: 16 },
  { key: "r16", label: "Åttondelsfinal", count: 8 },
  { key: "qf", label: "Kvartsfinal", count: 4 },
  { key: "sf", label: "Semifinal", count: 2 },
  { key: "final", label: "Final", count: 1 },
];

/**
 * Build the structural KO tree from group tables, then overlay real KO fixtures
 * present in allMatches (matched by stage prefix + kickoff order). Returns the
 * knockout object; the structural Match objects are the same references that
 * should replace the raw KO entries in allMatches.
 */
export function buildKnockout(
  groupTables: Record<string, GroupTableRow[]>,
  allMatches: Match[]
): Knockout {
  const gsList = R32_SPECS.map((s) => s.a.gs || s.b.gs).filter((x): x is string => !!x);
  const thirdAssign = assignThirds(gsList, groupTables);
  const sr = (spec: SlotSpec) => slotResolve(spec, groupTables, thirdAssign);

  const r32 = R32_SPECS.map((spec, i) => makeKoMatch("r32_", i, sr(spec.a), sr(spec.b), spec.fifa));
  const r16: Match[] = [];
  for (let i = 0; i < 8; i++) {
    r16.push(makeKoMatch("r16_", i, sr({ winM: R32_SPECS[i * 2].fifa }), sr({ winM: R32_SPECS[i * 2 + 1].fifa }), R16_FIFA[i]));
  }
  const qf: Match[] = [];
  for (let i = 0; i < 4; i++) {
    qf.push(makeKoMatch("qf_", i, sr({ winM: R16_FIFA[i * 2] }), sr({ winM: R16_FIFA[i * 2 + 1] }), QF_FIFA[i]));
  }
  const sf: Match[] = [];
  for (let i = 0; i < 2; i++) {
    sf.push(makeKoMatch("sf_", i, sr({ winM: QF_FIFA[i * 2] }), sr({ winM: QF_FIFA[i * 2 + 1] }), SF_FIFA[i]));
  }
  const final = [makeKoMatch("final_", 0, sr({ winM: SF_FIFA[0] }), sr({ winM: SF_FIFA[1] }), 104)];
  const third = [makeKoMatch("third_", 0, sr({ loseM: SF_FIFA[0] }), sr({ loseM: SF_FIFA[1] }), 103)];

  // Real KO fixtures carry no team draw yet (only group winners placed), so they can't
  // be matched to a tree slot by teams. They ARE scheduled in FIFA match-number order,
  // so the i-th fixture by kickoff is match (baseFifa + i) — map it to the structural
  // slot with that FIFA number. (Matching by array index was the bug: the structural
  // array is in TREE order, not match-number order, so a placed winner like GER/M75
  // landed in the M74 slot and showed up against the wrong projected opponent.)
  function overlayKO(structural: Match[], stagePrefix: string, baseFifa: number) {
    const real = allMatches
      .filter((m) => m.id.indexOf(stagePrefix) === 0)
      .sort((a, b) => +a.kickoff - +b.kickoff);
    real.forEach((rm, i) => {
      const s = structural.find((x) => x.fifa === baseFifa + i);
      if (!s) return;
      s.id = rm.id;
      s.kickoff = rm.kickoff;
      s.status = rm.status;
      if (rm.home) {
        s.home = rm.home;
        s.fromA = null;
      }
      if (rm.away) {
        s.away = rm.away;
        s.fromB = null;
      }
      s.ga = rm.ga;
      s.gb = rm.gb;
      s.winner = rm.winner;
      s.scorers = rm.scorers || [];
      s.cards = rm.cards || [];
      s.subs = rm.subs || [];
      s.tips = rm.tips || [];
      s.stats = rm.stats ?? null;
      s.xg = rm.xg ?? null;
      s.homeLineup = rm.homeLineup ?? null;
      s.awayLineup = rm.awayLineup ?? null;
      s.espnOdds = rm.espnOdds ?? null;
      s.officialOdds = rm.officialOdds ?? null;
      s.cardOdds = rm.cardOdds ?? null;
      s.referees = rm.referees ?? [];
      s.attendance = rm.attendance ?? null;
      s.scoreDetail = rm.scoreDetail ?? null;
      s.pen = rm.pen ?? null;
      s._realId = rm._realId;
      if (rm.venue && rm.venue.stadium) s.venue = rm.venue;
    });
  }

  overlayKO(r32, "r32_", 73);
  overlayKO(r16, "r16_", 89);
  overlayKO(qf, "qf_", 97);
  overlayKO(sf, "sf_", 101);
  overlayKO(third, "third_", 103);
  overlayKO(final, "final_", 104);

  // Fill the next round in as the current one finishes: a slot reading "Vinnare M73"
  // shows match 73's actual winner once it's played (and "Förlorare MX" its loser),
  // without waiting for football-data to redraw the next-round fixtures.
  const all = [...r32, ...r16, ...qf, ...sf, ...third, ...final];
  const byFifa: Record<number, Match> = {};
  for (const m of all) if (m.fifa != null) byFifa[m.fifa] = m;
  const fromResult = (label: string | null | undefined): string | null => {
    if (!label) return null;
    const win = /^Vinnare M(\d+)$/.exec(label);
    if (win) { const f = byFifa[+win[1]]; return f && f.status === "played" && f.winner ? f.winner : null; }
    const lose = /^Förlorare M(\d+)$/.exec(label);
    if (lose) { const f = byFifa[+lose[1]]; if (f && f.status === "played" && f.winner) return f.home === f.winner ? f.away : f.home; }
    return null;
  };
  for (const m of all) {
    if (!m.home && !m.projHome) { const w = fromResult(m.fromA); if (w) m.projHome = w; }
    if (!m.away && !m.projAway) { const w = fromResult(m.fromB); if (w) m.projAway = w; }
  }

  return { r32, r16, qf, sf, third, final };
}

export { R32_SPECS, R16_FIFA, QF_FIFA, SF_FIFA };
