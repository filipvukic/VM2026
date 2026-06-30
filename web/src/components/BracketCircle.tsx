import { useEffect, useRef, useState } from "react";
import { Flag } from "../lib/flags";
import { isLive } from "../lib/liveState";
import type { Dataset, Match } from "../data/types";

// Radial knockout bracket: 32 teams on the outer ring, converging inward through each
// round to the trophy at the centre. Connectors are a radial dendrogram — only radial
// spokes + small arcs (no diagonal lines) so the joins are clean, like the reference.
// The circular orders are the in-order traversal of the FIFA bracket tree (final = 104).
const R32_ORDER = [73, 75, 74, 77, 83, 84, 81, 82, 76, 78, 79, 80, 86, 88, 85, 87];
const R16_ORDER = [89, 90, 93, 94, 91, 92, 95, 96];
const QF_ORDER = [97, 98, 99, 100];
const SF_ORDER = [101, 102];

const RAD = [0.45, 0.358, 0.27, 0.185, 0.105]; // ring radius (outer → inner) as fraction of canvas
const DIA = [0.07, 0.066, 0.062, 0.06, 0.058]; // badge diameter

interface Node { x: number; y: number; d: number; code: string | null; iso: string | null; id: string | null; live: boolean; ring: number }
interface Seg { x1: number; y1: number; x2: number; y2: number; hot: boolean }

function polar(c: number, r: number, deg: number): [number, number] {
  const a = (deg - 90) * (Math.PI / 180);
  return [c + r * Math.cos(a), c + r * Math.sin(a)];
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
  const idOf = (order: number[], i: number) => { const m = byFifa[order[i]]; return m && m._realId != null ? m.id : null; };

  const angR32 = (i: number) => (i + 0.5) * (360 / 16);
  const angR16 = (i: number) => (i + 0.5) * (360 / 8);
  const angQF = (i: number) => (i + 0.5) * (360 / 4);
  const angSF = (i: number) => (i + 0.5) * (360 / 2);
  const DELTA = 4.6; // ° offset of each team from its pair centre (keep < 5.6 so pairs group)

  const nodes: Node[] = [];
  const radials: Seg[] = [];
  const arcs: { d: string; hot: boolean }[] = [];

  const radial = (a: number, ra: number, rb: number, hot = false) => {
    const [x1, y1] = polar(C, ra, a); const [x2, y2] = polar(C, rb, a);
    radials.push({ x1, y1, x2, y2, hot });
  };
  const arc = (a1: number, a2: number, r: number, hot = false) => {
    const [x1, y1] = polar(C, r, a1); const [x2, y2] = polar(C, r, a2);
    arcs.push({ d: `M${x1} ${y1}A${r} ${r} 0 ${Math.abs(a2 - a1) > 180 ? 1 : 0} 1 ${x2} ${y2}`, hot });
  };
  // one match join: arc at the parent (inner) radius spanning the two children's angles,
  // + a radial spoke from each child angle out to the children's radius.
  const join = (a1: number, a2: number, rParent: number, rChild: number, hot = false) => {
    arc(a1, a2, rParent, hot);
    radial(a1, rParent, rChild, hot);
    radial(a2, rParent, rChild, hot);
  };

  // Ring 1 — 32 teams (two per match) + the R32 join
  R32_ORDER.forEach((fifa, mi) => {
    const m = byFifa[fifa];
    const live = m ? isLive(m) : false;
    const base = angR32(mi);
    ([["home", -DELTA], ["away", DELTA]] as const).forEach(([side, off]) => {
      const code = m ? (side === "home" ? m.home : m.away) : null;
      const [x, y] = polar(C, R[0], base + off);
      nodes.push({ x, y, d: D[0], code, iso: isoOf(code), id: m?._realId != null ? m.id : null, live, ring: 0 });
    });
    join(base - DELTA, base + DELTA, R[1], R[0], live);
  });

  // Inner winner badges (each round's winners one ring in; click → their next match)
  const winners = (order: number[], lvl: number, ang: (i: number) => number, nextId: (i: number) => string | null) => {
    order.forEach((fifa, i) => {
      const m = byFifa[fifa];
      const win = m && m.status === "played" && m.winner ? m.winner : null;
      const [x, y] = polar(C, R[lvl], ang(i));
      nodes.push({ x, y, d: D[lvl], code: win, iso: isoOf(win), id: nextId(i), live: false, ring: lvl });
    });
  };
  winners(R32_ORDER, 1, angR32, (i) => idOf(R16_ORDER, Math.floor(i / 2)));
  winners(R16_ORDER, 2, angR16, (i) => idOf(QF_ORDER, Math.floor(i / 2)));
  winners(QF_ORDER, 3, angQF, (i) => idOf(SF_ORDER, Math.floor(i / 2)));
  winners(SF_ORDER, 4, angSF, () => idOf([104], 0));

  // Joins for the inner rounds + the final (SF winners → centre)
  R16_ORDER.forEach((_, j) => join(angR32(2 * j), angR32(2 * j + 1), R[2], R[1]));
  QF_ORDER.forEach((_, k) => join(angR16(2 * k), angR16(2 * k + 1), R[3], R[2]));
  SF_ORDER.forEach((_, l) => join(angQF(2 * l), angQF(2 * l + 1), R[4], R[3]));
  radial(angSF(0), R[4], S * 0.052);
  radial(angSF(1), R[4], S * 0.052);

  const lineCol = "color-mix(in srgb, var(--ink-3) 30%, transparent)";
  const dot = S * 0.013;

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
        {arcs.map((a, i) => (
          <path key={`a${i}`} d={a.d} fill="none" stroke={a.hot ? "var(--hot)" : lineCol} strokeWidth={a.hot ? S * 0.0045 : S * 0.0026} strokeLinecap="round" />
        ))}
        {radials.map((l, i) => (
          <line key={`r${i}`} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={l.hot ? "var(--hot)" : lineCol} strokeWidth={l.hot ? S * 0.0045 : S * 0.0026} strokeLinecap="round" />
        ))}
      </svg>

      <div className="bc-trophy" style={{ left: C, top: C, fontSize: S * 0.085 }}>🏆</div>

      {nodes.map((n, i) => {
        if (!n.code) {
          // undecided junction → small dot (like the reference), not a big empty circle
          return <span key={i} className="bc-jdot" style={{ left: n.x - dot / 2, top: n.y - dot / 2, width: dot, height: dot }} />;
        }
        return (
          <button
            key={i}
            className={`bc-badge${n.live ? " live" : ""}`}
            style={{ left: n.x - n.d / 2, top: n.y - n.d / 2, width: n.d, height: n.d }}
            onClick={n.id ? () => onOpen(n.id!) : undefined}
            disabled={!n.id}
            aria-label={n.code}
          >
            <Flag iso={n.iso} code={n.code} size={n.d} rounded={false} />
          </button>
        );
      })}

      <style>{`
        .bc-wrap{ position:relative; width:100%; max-width:600px; margin:6px auto 0; aspect-ratio:1/1; }
        .bc-svg{ position:absolute; inset:0; }
        .bc-trophy{ position:absolute; transform:translate(-50%,-52%); line-height:1; filter:drop-shadow(0 0 14px rgba(255,190,80,.6)); pointer-events:none; z-index:2; }
        .bc-jdot{ position:absolute; border-radius:50%; background:color-mix(in srgb, var(--ink-3) 42%, transparent); z-index:3; }
        .bc-badge{ position:absolute; padding:0; border-radius:50%; overflow:hidden; background:var(--surface-2);
          box-shadow:0 0 0 1.5px var(--line-2), 0 2px 6px rgba(0,0,0,.3); display:grid; place-items:center; z-index:3;
          transition:transform .12s, box-shadow .15s; }
        .bc-badge:not(:disabled):active{ transform:scale(.92); }
        .bc-badge:not(:disabled):hover{ box-shadow:0 0 0 2px var(--cool), 0 2px 8px rgba(0,0,0,.4); }
        .bc-badge.live{ box-shadow:0 0 0 2px var(--hot), 0 0 10px color-mix(in srgb, var(--hot) 45%, transparent); }
        .bc-badge img{ display:block; border-radius:0; }
      `}</style>
    </div>
  );
}
