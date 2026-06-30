import { useEffect, useRef, useState } from "react";
import { Flag } from "../lib/flags";
import { isLive } from "../lib/liveState";
import type { Dataset, Match } from "../data/types";

// Radial knockout bracket: 32 teams on the outer ring, converging inward through each
// round to the trophy at the centre. The circular orders below are the in-order
// traversal of the FIFA bracket tree (final = 104), so consecutive pairs are matches
// and the two halves wrap onto the two halves of the circle.
const R32_ORDER = [73, 75, 74, 77, 83, 84, 81, 82, 76, 78, 79, 80, 86, 88, 85, 87];
const R16_ORDER = [89, 90, 93, 94, 91, 92, 95, 96];
const QF_ORDER = [97, 98, 99, 100];
const SF_ORDER = [101, 102];

// ring radius + badge diameter as fractions of the square canvas (outer → inner)
const RAD = [0.45, 0.358, 0.27, 0.185, 0.105];
const DIA = [0.07, 0.066, 0.062, 0.06, 0.058];

interface Node {
  x: number; y: number; d: number; code: string | null; iso: string | null;
  id: string | null; live: boolean; ring: number;
}
interface Line { x1: number; y1: number; x2: number; y2: number; hot: boolean }

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
  const champ = byFifa[104]?.status === "played" ? byFifa[104]?.winner ?? null : null;

  const C = S / 2;
  const R = RAD.map((x) => x * S);
  const D = DIA.map((x) => x * S);
  const isoOf = (code: string | null) => (code ? ds.teams[code]?.iso ?? null : null);

  const nodes: Node[] = [];
  const lines: Line[] = [];

  const angR32 = (i: number) => (i + 0.5) * (360 / 16);
  const angR16 = (i: number) => (i + 0.5) * (360 / 8);
  const angQF = (i: number) => (i + 0.5) * (360 / 4);
  const angSF = (i: number) => (i + 0.5) * (360 / 2);
  const DELTA = 4.6; // ° offset of each team from its pair centre — keep < 5.6 so the
  // two teams of a match group together (gap between pairs stays larger than within)

  // Ring 1 — the 32 R32 participants (two per match), each linked inward to its match's winner slot.
  R32_ORDER.forEach((fifa, mi) => {
    const m = byFifa[fifa];
    const live = m ? isLive(m) : false;
    const base = angR32(mi);
    const [wx, wy] = polar(C, R[1], base); // winner slot (ring 2)
    ([["home", -DELTA], ["away", DELTA]] as const).forEach(([side, off]) => {
      const code = m ? (side === "home" ? m.home : m.away) : null;
      const [x, y] = polar(C, R[0], base + off);
      nodes.push({ x, y, d: D[0], code, iso: isoOf(code), id: m?._realId != null ? m.id : null, live, ring: 0 });
      lines.push({ x1: x, y1: y, x2: wx, y2: wy, hot: live });
    });
  });

  // Inner winner rings: each round's winners sit one ring in, linked to the next round's slot.
  const ring = (
    order: number[], lvl: number, ang: (i: number) => number,
    nextAng: (i: number) => number, nextId: (i: number) => string | null, toCenter = false
  ) => {
    order.forEach((fifa, i) => {
      const m = byFifa[fifa];
      const win = m && m.status === "played" && m.winner ? m.winner : null;
      const [x, y] = polar(C, R[lvl], ang(i));
      nodes.push({ x, y, d: D[lvl], code: win, iso: isoOf(win), id: nextId(i), live: false, ring: lvl });
      const [px, py] = toCenter ? [C, C] : polar(C, R[lvl + 1], nextAng(Math.floor(i / 2)));
      lines.push({ x1: x, y1: y, x2: px, y2: py, hot: false });
    });
  };
  const idOf = (order: number[], i: number) => {
    const m = byFifa[order[i]];
    return m && m._realId != null ? m.id : null;
  };
  // ring2 R32-winners → click opens their R16 match; ring3 → QF; ring4 → SF; ring5 → final
  ring(R32_ORDER, 1, angR32, angR16, (i) => idOf(R16_ORDER, Math.floor(i / 2)));
  ring(R16_ORDER, 2, angR16, angQF, (i) => idOf(QF_ORDER, Math.floor(i / 2)));
  ring(QF_ORDER, 3, angQF, angSF, (i) => idOf(SF_ORDER, Math.floor(i / 2)));
  ring(SF_ORDER, 4, angSF, () => 0, () => idOf([104], 0), true);

  return (
    <div className="bc-wrap" ref={ref}>
      <svg className="bc-svg" viewBox={`0 0 ${S} ${S}`} width={S} height={S} aria-hidden>
        <defs>
          <radialGradient id="bcGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(255,196,84,.55)" />
            <stop offset="38%" stopColor="rgba(214,158,60,.22)" />
            <stop offset="100%" stopColor="rgba(214,158,60,0)" />
          </radialGradient>
        </defs>
        <circle cx={C} cy={C} r={S * 0.2} fill="url(#bcGlow)" />
        {lines.map((l, i) => (
          <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
            stroke={l.hot ? "var(--hot)" : "color-mix(in srgb, var(--ink-3) 34%, transparent)"}
            strokeWidth={l.hot ? S * 0.005 : S * 0.0032} strokeLinecap="round" />
        ))}
      </svg>

      <div className="bc-trophy" style={{ left: C, top: C, fontSize: S * 0.085 }}>🏆</div>

      {nodes.map((n, i) => {
        const empty = !n.code;
        return (
          <button
            key={i}
            className={`bc-badge${empty ? " empty" : ""}${n.live ? " live" : ""}${n.code && n.code === champ ? " champ" : ""}`}
            style={{ left: n.x - n.d / 2, top: n.y - n.d / 2, width: n.d, height: n.d }}
            onClick={n.id ? () => onOpen(n.id!) : undefined}
            disabled={!n.id}
            aria-label={n.code || "Obestämd"}
          >
            {!empty && <Flag iso={n.iso} code={n.code} size={n.d} rounded={false} />}
          </button>
        );
      })}

      <style>{`
        .bc-wrap{ position:relative; width:100%; max-width:600px; margin:6px auto 0; aspect-ratio:1/1; }
        .bc-svg{ position:absolute; inset:0; }
        .bc-trophy{ position:absolute; transform:translate(-50%,-52%); line-height:1; filter:drop-shadow(0 0 14px rgba(255,190,80,.6)); pointer-events:none; z-index:2; }
        .bc-badge{ position:absolute; padding:0; border-radius:50%; overflow:hidden; background:var(--surface-2);
          box-shadow:0 0 0 1.5px var(--line-2), 0 2px 6px rgba(0,0,0,.3); display:grid; place-items:center; z-index:3;
          transition:transform .12s, box-shadow .15s; }
        .bc-badge:not(:disabled):active{ transform:scale(.92); }
        .bc-badge:not(:disabled):hover{ box-shadow:0 0 0 2px var(--cool), 0 2px 8px rgba(0,0,0,.4); }
        .bc-badge.empty{ background:var(--surface); box-shadow:0 0 0 1.5px color-mix(in srgb, var(--ink-3) 22%, var(--line)); }
        .bc-badge.live{ box-shadow:0 0 0 2px var(--hot), 0 0 10px color-mix(in srgb, var(--hot) 45%, transparent); }
        .bc-badge.champ{ box-shadow:0 0 0 2.5px var(--gold), 0 0 16px color-mix(in srgb, var(--gold) 55%, transparent); }
        .bc-badge img{ display:block; border-radius:0; }
        .bc-hint{ text-align:center; font-size:11px; color:var(--ink-3); margin-top:12px; }
      `}</style>
    </div>
  );
}
