import { useEffect, useRef, useState } from "react";
import { Flag } from "../lib/flags";
import { isLive } from "../lib/liveState";
import type { Dataset, Match } from "../data/types";

// Radial knockout bracket: 32 teams on the outer ring, converging inward through each
// round to the trophy at the centre. Connectors are a radial dendrogram (radial spokes
// + arcs, no diagonals). The two bracket halves sit on the two sides of the circle with
// a gap at top & bottom; a team's winning spokes light up in its colour, losers fade,
// and a small score sits at each decided match. Circular orders = in-order tree traversal.
const R32_ORDER = [73, 75, 74, 77, 83, 84, 81, 82, 76, 78, 79, 80, 86, 88, 85, 87];
const R16_ORDER = [89, 90, 93, 94, 91, 92, 95, 96];
const QF_ORDER = [97, 98, 99, 100];
const SF_ORDER = [101, 102];

const RAD = [0.452, 0.358, 0.268, 0.18, 0.1]; // ring radius (outer → inner)
const DIA = [0.064, 0.06, 0.057, 0.054, 0.052]; // badge diameter (smaller = more room)
const GAP = 30; // ° gap at top & bottom separating the left/right halves
const DELTA = 3.8; // ° offset of each team from its pair centre

interface Node { x: number; y: number; d: number; code: string | null; iso: string | null; id: string | null; live: boolean; lost: boolean }
interface Seg { x1: number; y1: number; x2: number; y2: number; color: string | null }

function polar(c: number, r: number, deg: number): [number, number] {
  const a = (deg - 90) * (Math.PI / 180);
  return [c + r * Math.cos(a), c + r * Math.sin(a)];
}
// angle of match j in a round of M matches — left half on one side, right on the other,
// each compressed into (180-GAP)° so the halves are visibly separated.
function ang(M: number, j: number): number {
  const half = j < M / 2 ? 0 : 1;
  const local = j - half * (M / 2);
  const start = half === 0 ? GAP / 2 : 180 + GAP / 2;
  return start + (local + 0.5) * (180 - GAP) / (M / 2);
}

export function BracketCircle({ ds, onOpen }: { ds: Dataset; onOpen: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [S, setS] = useState(360);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setS(el.clientWidth);
    const ro = new ResizeObserver((es) => { for (const e of es) setS(e.contentRect.width); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const byFifa: Record<number, Match> = {};
  [...ds.knockout.r32, ...ds.knockout.r16, ...ds.knockout.qf, ...ds.knockout.sf, ...ds.knockout.final, ...ds.knockout.third].forEach((m) => {
    if (m.fifa != null) byFifa[m.fifa] = m;
  });

  const C = S / 2;
  const R = RAD.map((x) => x * S);
  const D = DIA.map((x) => x * S);
  const isoOf = (code: string | null) => (code ? ds.teams[code]?.iso ?? null : null);
  const colorOf = (code: string | null) => (code ? ds.teams[code]?.c1 ?? null : null);
  const winOf = (fifa: number) => { const m = byFifa[fifa]; return m && m.status === "played" && m.winner ? m.winner : null; };
  const idOf = (fifa: number) => { const m = byFifa[fifa]; return m && m._realId != null ? m.id : null; };

  const angR32 = (j: number) => ang(16, j);
  const angR16 = (j: number) => ang(8, j);
  const angQF = (j: number) => ang(4, j);
  const angSF = (j: number) => ang(2, j);

  const nodes: Node[] = [];
  const radials: Seg[] = [];
  const arcs: { d: string; color: string | null }[] = [];
  const scores: { x: number; y: number; t: string }[] = [];

  const radial = (a: number, ra: number, rb: number, color: string | null) => {
    const [x1, y1] = polar(C, ra, a); const [x2, y2] = polar(C, rb, a);
    radials.push({ x1, y1, x2, y2, color });
  };
  const arcSeg = (a1: number, a2: number, r: number, color: string | null) => {
    const [x1, y1] = polar(C, r, a1); const [x2, y2] = polar(C, r, a2);
    arcs.push({ d: `M${x1} ${y1}A${r} ${r} 0 ${Math.abs(a2 - a1) > 180 ? 1 : 0} 1 ${x2} ${y2}`, color });
  };
  // a match: arc at the parent (inner) radius + a spoke from each child angle to the
  // children radius. Winner's spoke + arc light in the winner's colour; live = hot.
  const addMatch = (m: Match | undefined, a1: number, a2: number, t1: string | null, t2: string | null, rp: number, rc: number) => {
    const played = !!(m && m.status === "played" && m.ga != null && m.gb != null);
    const live = m ? isLive(m) : false;
    const win = m && m.winner ? m.winner : null;
    const wc = win ? colorOf(win) : null;
    arcSeg(a1, a2, rp, live ? "var(--hot)" : wc);
    radial(a1, rp, rc, live ? "var(--hot)" : (win && win === t1 ? wc : null));
    radial(a2, rp, rc, live ? "var(--hot)" : (win && win === t2 ? wc : null));
    if (played) { const [sx, sy] = polar(C, (rp + rc) / 2, (a1 + a2) / 2); scores.push({ x: sx, y: sy, t: `${m!.ga}–${m!.gb}` }); }
  };

  // Ring 1 — 32 teams (two per match)
  R32_ORDER.forEach((fifa, mi) => {
    const m = byFifa[fifa];
    const live = m ? isLive(m) : false;
    const base = angR32(mi);
    ([["home", -DELTA], ["away", DELTA]] as const).forEach(([side, off]) => {
      const code = m ? (side === "home" ? m.home : m.away) : null;
      const lost = !!(m && m.status === "played" && m.winner && code && m.winner !== code);
      const [x, y] = polar(C, R[0], base + off);
      nodes.push({ x, y, d: D[0], code, iso: isoOf(code), id: m?._realId != null ? m.id : null, live, lost });
    });
    addMatch(m, base - DELTA, base + DELTA, m?.home ?? null, m?.away ?? null, R[1], R[0]);
  });

  // Inner winner badges — dim if they LOST their next match
  const winnerBadge = (code: string | null, lvl: number, angle: number, nextFifa: number) => {
    const nm = byFifa[nextFifa];
    const lost = !!(code && nm && nm.status === "played" && nm.winner && nm.winner !== code);
    const [x, y] = polar(C, R[lvl], angle);
    nodes.push({ x, y, d: D[lvl], code, iso: isoOf(code), id: nm && nm._realId != null ? nm.id : null, live: false, lost });
  };
  R32_ORDER.forEach((fifa, mi) => winnerBadge(winOf(fifa), 1, angR32(mi), R16_ORDER[Math.floor(mi / 2)]));
  R16_ORDER.forEach((fifa, j) => winnerBadge(winOf(fifa), 2, angR16(j), QF_ORDER[Math.floor(j / 2)]));
  QF_ORDER.forEach((fifa, k) => winnerBadge(winOf(fifa), 3, angQF(k), SF_ORDER[Math.floor(k / 2)]));
  SF_ORDER.forEach((fifa, l) => winnerBadge(winOf(fifa), 4, angSF(l), 104));

  // Inner round joins + the final (SF winners → centre)
  R16_ORDER.forEach((fifa, j) => addMatch(byFifa[fifa], angR32(2 * j), angR32(2 * j + 1), winOf(R32_ORDER[2 * j]), winOf(R32_ORDER[2 * j + 1]), R[2], R[1]));
  QF_ORDER.forEach((fifa, k) => addMatch(byFifa[fifa], angR16(2 * k), angR16(2 * k + 1), winOf(R16_ORDER[2 * k]), winOf(R16_ORDER[2 * k + 1]), R[3], R[2]));
  SF_ORDER.forEach((fifa, l) => addMatch(byFifa[fifa], angQF(2 * l), angQF(2 * l + 1), winOf(QF_ORDER[2 * l]), winOf(QF_ORDER[2 * l + 1]), R[4], R[3]));
  {
    const fm = byFifa[104];
    const live = fm ? isLive(fm) : false;
    const win = fm && fm.winner ? fm.winner : null;
    const wc = win ? colorOf(win) : null;
    radial(angSF(0), R[4], S * 0.05, live ? "var(--hot)" : (win && win === winOf(SF_ORDER[0]) ? wc : null));
    radial(angSF(1), R[4], S * 0.05, live ? "var(--hot)" : (win && win === winOf(SF_ORDER[1]) ? wc : null));
    if (fm && fm.status === "played" && fm.ga != null) scores.push({ x: C, y: C + S * 0.12, t: `${fm.ga}–${fm.gb}` });
  }

  const lineCol = "color-mix(in srgb, var(--ink-3) 28%, transparent)";
  const dot = S * 0.012;
  const sw = (c: string | null) => (c ? S * 0.0042 : S * 0.0026);

  return (
    <div className="bc-wrap" ref={ref}>
      <svg className="bc-svg" viewBox={`0 0 ${S} ${S}`} width={S} height={S} aria-hidden>
        <defs>
          <radialGradient id="bcGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(255,196,84,.5)" />
            <stop offset="40%" stopColor="rgba(214,158,60,.18)" />
            <stop offset="100%" stopColor="rgba(214,158,60,0)" />
          </radialGradient>
        </defs>
        <circle cx={C} cy={C} r={S * 0.22} fill="url(#bcGlow)" />
        {arcs.map((a, i) => <path key={`a${i}`} d={a.d} fill="none" stroke={a.color || lineCol} strokeWidth={sw(a.color)} strokeLinecap="round" opacity={a.color ? 0.95 : 1} />)}
        {radials.map((l, i) => <line key={`r${i}`} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={l.color || lineCol} strokeWidth={sw(l.color)} strokeLinecap="round" opacity={l.color ? 0.95 : 1} />)}
      </svg>

      <div className="bc-trophy" style={{ left: C, top: C, fontSize: S * 0.085 }}>🏆</div>

      {nodes.map((n, i) => {
        if (!n.code) return <span key={i} className="bc-jdot" style={{ left: n.x - dot / 2, top: n.y - dot / 2, width: dot, height: dot }} />;
        return (
          <button
            key={i}
            className={`bc-badge${n.live ? " live" : ""}${n.lost ? " lost" : ""}`}
            style={{ left: n.x - n.d / 2, top: n.y - n.d / 2, width: n.d, height: n.d }}
            onClick={n.id ? () => onOpen(n.id!) : undefined}
            disabled={!n.id}
            aria-label={n.code}
          >
            <Flag iso={n.iso} code={n.code} size={n.d} rounded={false} />
          </button>
        );
      })}

      {scores.map((s, i) => (
        <span key={`s${i}`} className="bc-score" style={{ left: s.x, top: s.y, fontSize: Math.max(8, S * 0.019) }}>{s.t}</span>
      ))}

      <style>{`
        .bc-wrap{ position:relative; width:100%; max-width:620px; margin:6px auto 0; aspect-ratio:1/1; }
        .bc-svg{ position:absolute; inset:0; }
        .bc-trophy{ position:absolute; transform:translate(-50%,-52%); line-height:1; filter:drop-shadow(0 0 14px rgba(255,190,80,.6)); pointer-events:none; z-index:2; }
        .bc-jdot{ position:absolute; border-radius:50%; background:color-mix(in srgb, var(--ink-3) 40%, transparent); z-index:3; }
        .bc-badge{ position:absolute; padding:0; border-radius:50%; overflow:hidden; background:var(--surface-2);
          box-shadow:0 0 0 1.5px var(--line-2), 0 2px 6px rgba(0,0,0,.3); display:grid; place-items:center; z-index:3;
          transition:transform .12s, box-shadow .15s, opacity .15s, filter .15s; }
        .bc-badge:not(:disabled):active{ transform:scale(.92); }
        .bc-badge:not(:disabled):hover{ box-shadow:0 0 0 2px var(--cool), 0 2px 8px rgba(0,0,0,.4); }
        .bc-badge.live{ box-shadow:0 0 0 2px var(--hot), 0 0 10px color-mix(in srgb, var(--hot) 45%, transparent); }
        .bc-badge.lost{ opacity:.42; filter:grayscale(.65); }
        .bc-badge img{ display:block; border-radius:0; }
        .bc-score{ position:absolute; transform:translate(-50%,-50%); z-index:4; pointer-events:none;
          font-family:var(--font-display); font-weight:800; font-variant-numeric:tabular-nums; color:var(--ink-2);
          background:color-mix(in srgb, var(--bg) 72%, transparent); padding:0 4px; border-radius:5px; letter-spacing:-.02em; }
      `}</style>
    </div>
  );
}
