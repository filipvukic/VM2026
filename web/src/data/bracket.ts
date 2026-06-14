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

function slotResolve(spec: SlotSpec, groupTables: Record<string, GroupTableRow[]>): Slot {
  if (spec.winM) return { code: null, projCode: null, label: "Vinnare M" + spec.winM };
  if (spec.loseM) return { code: null, projCode: null, label: "Förlorare M" + spec.loseM };
  if (spec.p === 1 || spec.p === 2) {
    const row = groupTables[spec.g!] && groupTables[spec.g!][spec.p - 1];
    const proj = row && row.code && row.code.indexOf("TBD") !== 0 ? row.code : null;
    return { code: null, projCode: proj, label: (spec.p === 1 ? "Vinnare " : "Tvåa ") + spec.g };
  }
  if (spec.p === 3 && spec.gs) {
    return {
      code: null,
      projCode: bestThirdFromGroups(spec.gs, groupTables),
      label: "Bästa 3:a (" + spec.gs.split("").join("/") + ")",
    };
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
  const sr = (spec: SlotSpec) => slotResolve(spec, groupTables);

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

  function overlayKO(structural: Match[], stagePrefix: string) {
    const real = allMatches
      .filter((m) => m.id.indexOf(stagePrefix) === 0)
      .sort((a, b) => +a.kickoff - +b.kickoff);
    real.forEach((rm, i) => {
      const s = structural[i];
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

  overlayKO(r32, "r32_");
  overlayKO(r16, "r16_");
  overlayKO(qf, "qf_");
  overlayKO(sf, "sf_");
  overlayKO(third, "third_");
  overlayKO(final, "final_");

  return { r32, r16, qf, sf, third, final };
}

export { R32_SPECS, R16_FIFA, QF_FIFA, SF_FIFA };
