import type { RawLineup, RawLineupPlayer } from "../data/types";

// Coarse position band (1 = defence … 4 = attack), used only as a fallback when
// the feed gives no usable `formation` string.
function bandOf(code: string): number {
  const c = (code || "").toUpperCase();
  if (c.startsWith("G")) return 0;
  if (c.startsWith("DM") || c === "CDM") return 2;
  if (c.includes("B") || c.startsWith("CD") || c.startsWith("CB") || c.startsWith("D")) return 1;
  if (c.startsWith("F") || c.startsWith("ST") || c.startsWith("CF") || c.startsWith("LW") || c.startsWith("RW") || c.endsWith("W")) return 4;
  return 3;
}

// Vertical depth (0 = keeper … 4 = forward), used to ORDER players into rows once
// the row sizes are known from the formation string.
export function depthScore(code: string): number {
  const c = (code || "").toUpperCase();
  if (c.startsWith("G")) return 0;
  if (c.startsWith("DM") || c === "CDM") return 2;
  if (c.includes("B") || c.startsWith("CD") || c.startsWith("CB") || c.startsWith("D")) return 1;
  if (c.startsWith("AM") || c === "CAM") return 3.4;
  // An out-and-out striker (plain F/ST/CF) is the most advanced — rank it just
  // above the withdrawn forwards (CF-L/CF-R), so e.g. a 3-4-2-1 puts the lone "F"
  // in the front row and the two "CF-L/CF-R" in the band behind (not the reverse).
  if (c === "F" || c === "ST" || c === "CF") return 4.2;
  if (c.startsWith("F") || c.startsWith("ST") || c.startsWith("CF") || c.startsWith("LW") || c.startsWith("RW") || c.endsWith("W")) return 4;
  return 3; // generic midfield (M/CM/LM/RM all land here)
}

// Left→right ordering hint for placing players across a row. ESPN encodes width
// precisely: a prefix L/R = a WIDE player (LB/LM/LW … RB/RM/RW), while a suffix
// -L/-R = the centre-left/centre-right of a pair (CD-L, CM-R …). So a back four
// orders LB < CD-L < CD-R < RB — not CD-L < LB (which a coarse "contains L" gives,
// the old bug that put full-backs inside the centre-backs pre-match).
export function sideScore(code: string): number {
  const c = (code || "").toUpperCase();
  if (c.startsWith("L")) return -2; // wide left
  if (c.startsWith("R")) return 2; // wide right
  if (c.endsWith("L")) return -1; // centre-left of a pair
  if (c.endsWith("R")) return 1; // centre-right of a pair
  return 0; // central
}

// Build the pitch rows back-to-front: [GK], defence, midfield band(s), attack.
// The feed's `formation` ("4-3-1-2") is authoritative for HOW MANY players sit in
// each line — position labels alone are too coarse (five players tagged "M"/"CM"
// would otherwise collapse a real 4-3-1-2 into a wrong-looking 4-5-1). We honour
// the formation counts and use position depth only to order players into rows.
export function buildRows(lineup: RawLineup): RawLineupPlayer[][] {
  const players = lineup.lineup || [];
  if (!players.length) return [];
  let gkIdx = players.findIndex((p) => (p.position || "").toUpperCase().startsWith("G"));
  if (gkIdx < 0) gkIdx = 0;
  const gk = players[gkIdx];
  const outfield = players.filter((_, i) => i !== gkIdx);
  const sizes = (lineup.formation || "").split(/[^0-9]+/).filter(Boolean).map(Number);
  if (sizes.length >= 2 && sizes.reduce((a, b) => a + b, 0) === outfield.length) {
    const sorted = outfield
      .map((p, i) => ({ p, i }))
      .sort((a, b) => depthScore(a.p.position || "") - depthScore(b.p.position || "") || a.i - b.i)
      .map((x) => x.p);
    const rows: RawLineupPlayer[][] = [];
    let k = 0;
    for (const s of sizes) {
      rows.push(sorted.slice(k, k + s));
      k += s;
    }
    return [[gk], ...rows];
  }
  // No usable formation string: fall back to binning by position band.
  const bands: Record<number, RawLineupPlayer[]> = {};
  outfield.forEach((p) => {
    const b = bandOf(p.position || "");
    (bands[b] = bands[b] || []).push(p);
  });
  return [[gk], ...[1, 2, 3, 4].filter((b) => bands[b] && bands[b].length).map((b) => bands[b])];
}
