// Win-chance: prefer REAL bookmaker odds (ESPN moneyline, then football-data
// decimal), fall back to a FIFA-ranking-based model so all 48 teams differ.
import { FIFA_RANKING, WC_HISTORY } from "./static/history";
import type { Match, RawEspnOdds } from "./types";

export interface WinChance {
  H: number;
  D: number;
  A: number;
  source: "ESPN" | "Odds" | "Modell";
}

function round100(h: number, d: number, a: number): { H: number; D: number; A: number } {
  let H = Math.round(h * 100);
  const D = Math.round(d * 100);
  const A = Math.round(a * 100);
  const delta = 100 - (H + D + A);
  if (delta !== 0) H += delta; // keep the home cell carrying rounding so it sums to 100
  return { H, D, A };
}

// American moneyline → implied probability (with vig).
function mlProb(ml: number): number {
  return ml < 0 ? -ml / (-ml + 100) : 100 / (ml + 100);
}

// ESPN gives a 2-way moneyline (no draw). De-vig, then carve out a draw share
// that grows as the match gets closer.
function fromEspn(o: RawEspnOdds): { H: number; D: number; A: number } | null {
  if (o.homeML == null || o.awayML == null) return null;
  const pH = mlProb(o.homeML);
  const pA = mlProb(o.awayML);
  const sum = pH + pA;
  if (!sum) return null;
  const h2 = pH / sum;
  const a2 = pA / sum;
  const d = 0.18 + 0.16 * (1 - Math.abs(h2 - a2)); // 18–34%
  return round100(h2 * (1 - d), d, a2 * (1 - d));
}

// football-data decimal odds → implied %, de-vigged.
function fromDecimal(o: { H?: number; D?: number; A?: number }): { H: number; D: number; A: number } | null {
  if (o.H == null || o.D == null || o.A == null) return null;
  const iH = 1 / o.H,
    iD = 1 / o.D,
    iA = 1 / o.A;
  const s = iH + iD + iA;
  return round100(iH / s, iD / s, iA / s);
}

// Rating driven mainly by FIFA ranking (log scale → all teams differ), with a
// small bump for World Cup pedigree.
export function teamRating(code: string): number {
  const rank = FIFA_RANKING[code];
  let r = rank ? 88 - 6 * Math.log2(rank) : 56; // r1≈88, r8≈70, r32≈58, r64≈52
  const h = WC_HISTORY[code];
  if (h?.titles) r += Math.min(5, h.titles * 1.5);
  else if (h && (h.runnerUp || h.semis)) r += 1.5;
  return Math.max(46, Math.min(92, r));
}

export function matchOdds(homeCode: string | null, awayCode: string | null): { H: number; D: number; A: number } | null {
  if (!homeCode || !awayCode) return null;
  const rH = teamRating(homeCode) + 3.5; // home advantage
  const rA = teamRating(awayCode);
  const diff = rH - rA;
  const pHwin = 1 / (1 + Math.exp(-diff / 7));
  const pAwin = 1 / (1 + Math.exp(diff / 7));
  const closeness = 1 - Math.abs(pHwin - pAwin);
  const pD = Math.max(0.12, Math.min(0.32, 0.16 + closeness * 0.2));
  const raw = pHwin + pAwin + pD;
  return round100(pHwin / raw, pD / raw, pAwin / raw);
}

/** Win-chance from a 2-way ESPN moneyline (for odds fetched lazily on demand). */
export function winChanceFromEspn(homeML: number, awayML: number): WinChance | null {
  const e = fromEspn({ homeML, awayML });
  return e ? { ...e, source: "ESPN" } : null;
}

/** Best available win-chance for a match. */
export function winChance(m: Match): WinChance | null {
  if (m.espnOdds) {
    const e = fromEspn(m.espnOdds);
    if (e) return { ...e, source: "ESPN" };
  }
  if (m.officialOdds && m.officialOdds.H != null) {
    const d = fromDecimal(m.officialOdds as { H: number; D: number; A: number });
    if (d) return { ...d, source: "Odds" };
  }
  const model = matchOdds(m.home, m.away);
  return model ? { ...model, source: "Modell" } : null;
}
