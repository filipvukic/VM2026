import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Flag } from "../lib/flags";
import { isLive } from "../lib/liveState";
import { TEAM_COLORS } from "../data/static/teamColors";
import type { Dataset, Match } from "../data/types";

// Radial knockout bracket: 32 teams on the outer ring, converging inward through each
// round to the trophy at the centre. Radial dendrogram connectors (spokes + arcs); the
// two halves sit on the two sides with a gap top & bottom; winners' spokes light in the
// team colour, losers fade, small scores at decided matches. Pinch/scroll to zoom & pan;
// auto-zooms in a little once each later round starts. Circular orders = in-order tree.
const R32_ORDER = [73, 75, 74, 77, 83, 84, 81, 82, 76, 78, 79, 80, 86, 88, 85, 87];
const R16_ORDER = [89, 90, 93, 94, 91, 92, 95, 96];
const QF_ORDER = [97, 98, 99, 100];
const SF_ORDER = [101, 102];

const RAD = [0.452, 0.358, 0.268, 0.18, 0.1];
const DIA = [0.05, 0.048, 0.046, 0.045, 0.045];
const GAP = 28;
const DELTA = 4.2;
const ROUND_NAMES = ["16-DEL", "8-DEL", "KVART", "SEMI", "FINAL"]; // outer ring → inner

interface Node { x: number; y: number; d: number; code: string | null; iso: string | null; id: string | null; live: boolean; lost: boolean }
interface Seg { x1: number; y1: number; x2: number; y2: number; color: string | null }

function polar(c: number, r: number, deg: number): [number, number] {
  const a = (deg - 90) * (Math.PI / 180);
  return [c + r * Math.cos(a), c + r * Math.sin(a)];
}
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

  // --- zoom & pan (incremental gesture; robust to fingers added/removed) -------
  const started = (list: Match[]) => list.some((m) => m.status === "played" || isLive(m));
  const progressed = [ds.knockout.r16, ds.knockout.qf, ds.knockout.sf, ds.knockout.final].filter(started).length;
  const autoZoom = Math.min(1 + progressed * 0.18, 1.9);
  const [view, setView] = useState({ z: 1, x: 0, y: 0 });
  useEffect(() => { setView((v) => ({ ...v, z: autoZoom })); }, [autoZoom]);
  const pts = useRef<Map<number, { x: number; y: number }>>(new Map());
  const prev = useRef({ cx: 0, cy: 0, dist: 0, n: 0 });
  const moved = useRef(false);

  const clampZ = (z: number) => Math.max(1, Math.min(2.8, z));
  const clampXY = (z: number, x: number, y: number) => {
    const m = ((z - 1) * S) / 2;
    return { z, x: Math.max(-m, Math.min(m, x)), y: Math.max(-m, Math.min(m, y)) };
  };
  const gstate = () => {
    const arr = [...pts.current.values()];
    const n = arr.length || 1;
    let cx = 0, cy = 0; for (const p of arr) { cx += p.x; cy += p.y; }
    return { cx: cx / n, cy: cy / n, dist: arr.length === 2 ? Math.hypot(arr[0].x - arr[1].x, arr[0].y - arr[1].y) : 0, n: arr.length };
  };
  const onPointerDown = (e: PointerEvent) => {
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    prev.current = gstate(); moved.current = false;
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!pts.current.has(e.pointerId)) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const s = gstate(), p = prev.current;
    if (s.n !== p.n) { prev.current = s; return; } // count changed → rebaseline, no jump
    const dx = s.cx - p.cx, dy = s.cy - p.cy;
    const ratio = s.n === 2 && p.dist ? s.dist / p.dist : 1;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2 || ratio !== 1) {
      // start capturing only once it's clearly a drag, so a plain tap still clicks a badge
      if (!moved.current) { try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ } }
      moved.current = true;
    }
    if (moved.current) setView((v) => clampXY(clampZ(v.z * ratio), v.x + dx, v.y + dy));
    prev.current = s;
  };
  const onPointerUp = (e: PointerEvent) => {
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    pts.current.delete(e.pointerId);
    prev.current = gstate();
  };
  const zoomBtn = (f: number) => setView((v) => clampXY(clampZ(v.z * f), v.x, v.y));
  const reset = () => setView({ z: 1, x: 0, y: 0 });
  // wheel needs a non-passive native listener so preventDefault stops page scroll
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheelNative = (e: globalThis.WheelEvent) => {
      e.preventDefault();
      setView((v) => clampXY(clampZ(v.z * (e.deltaY < 0 ? 1.12 : 0.9)), v.x, v.y));
    };
    el.addEventListener("wheel", onWheelNative, { passive: false });
    return () => el.removeEventListener("wheel", onWheelNative);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [S]);

  // --- geometry ---------------------------------------------------------------
  const C = S / 2;
  const R = RAD.map((x) => x * S);
  const D = DIA.map((x) => x * S);
  const isoOf = (code: string | null) => (code ? ds.teams[code]?.iso ?? null : null);
  const colorOf = (code: string | null) => (code ? (TEAM_COLORS[code] ?? ds.teams[code]?.c1 ?? null) : null);
  const winOf = (fifa: number) => { const m = byFifa[fifa]; return m && m.status === "played" && m.winner ? m.winner : null; };

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
  const arcSeg = (aFrom: number, aTo: number, r: number, color: string | null) => {
    const [x1, y1] = polar(C, r, aFrom); const [x2, y2] = polar(C, r, aTo);
    arcs.push({ d: `M${x1} ${y1}A${r} ${r} 0 ${Math.abs(aTo - aFrom) > 180 ? 1 : 0} ${aTo > aFrom ? 1 : 0} ${x2} ${y2}`, color });
  };
  const addMatch = (m: Match | undefined, a1: number, a2: number, t1: string | null, t2: string | null, rp: number, rc: number) => {
    const played = !!(m && m.status === "played" && m.ga != null && m.gb != null);
    const live = m ? isLive(m) : false;
    const win = m && m.winner ? m.winner : null;
    const wc = win ? colorOf(win) : null;
    const mid = (a1 + a2) / 2;
    if (live) {
      arcSeg(a1, a2, rp, "var(--hot)");
      radial(a1, rp, rc, "var(--hot)"); radial(a2, rp, rc, "var(--hot)");
    } else if (win && wc && (win === t1 || win === t2)) {
      // only the WINNER's segment lights up — its spoke + the half-arc to the junction
      // point (where the next match sits), in the winner's flag colour. Loser stays grey.
      const winA = win === t1 ? a1 : a2;
      const loseA = win === t1 ? a2 : a1;
      radial(winA, rp, rc, wc); arcSeg(winA, mid, rp, wc);
      radial(loseA, rp, rc, null); arcSeg(loseA, mid, rp, null);
    } else {
      arcSeg(a1, a2, rp, null); radial(a1, rp, rc, null); radial(a2, rp, rc, null);
    }
    if (played) { const [sx, sy] = polar(C, (rp + rc) / 2, mid); scores.push({ x: sx, y: sy, t: `${m!.ga}–${m!.gb}` }); }
  };

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
    if (fm && fm.status === "played" && fm.ga != null) scores.push({ x: C, y: C + S * 0.115, t: `${fm.ga}–${fm.gb}` });
  }

  const lineCol = "color-mix(in srgb, var(--ink-3) 28%, transparent)";
  const dot = S * 0.012;
  const sw = (c: string | null) => (c ? S * 0.0042 : S * 0.0026);
  const [hovId, setHovId] = useState<string | null>(null);

  return (
    <div
      className="bc-wrap" ref={ref}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
    >
      <div className="bc-stage" style={{ transform: `translate(${view.x}px,${view.y}px) scale(${view.z})` }}>
        <svg className="bc-svg" viewBox={`0 0 ${S} ${S}`} width={S} height={S} aria-hidden>
          <defs>
            <radialGradient id="bcGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(255,196,84,.5)" />
              <stop offset="40%" stopColor="rgba(214,158,60,.18)" />
              <stop offset="100%" stopColor="rgba(214,158,60,0)" />
            </radialGradient>
          </defs>
          <circle cx={C} cy={C} r={S * 0.22} fill="url(#bcGlow)" />
          {arcs.map((a, i) => <path key={`a${i}`} d={a.d} fill="none" stroke={a.color || lineCol} strokeWidth={sw(a.color)} strokeLinecap="round" />)}
          {radials.map((l, i) => <line key={`r${i}`} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={l.color || lineCol} strokeWidth={sw(l.color)} strokeLinecap="round" />)}
        </svg>

        {/* round labels in the bottom gap, one per ring */}
        {ROUND_NAMES.map((t, i) => {
          const [lx, ly] = polar(C, R[i], 180);
          return <span key={`l${i}`} className="bc-round" style={{ left: lx, top: ly, fontSize: Math.max(7, S * 0.0145) }}>{t}</span>;
        })}

        <div className="bc-trophy" style={{ left: C, top: C, fontSize: S * 0.085 }}>🏆</div>

        {nodes.map((n, i) => {
          if (!n.code) return <span key={i} className="bc-jdot" style={{ left: n.x - dot / 2, top: n.y - dot / 2, width: dot, height: dot }} />;
          return (
            <button
              key={i}
              className={`bc-badge${n.live ? " live" : ""}${n.lost ? " lost" : ""}${n.id && n.id === hovId ? " hov" : ""}`}
              style={{ left: n.x - n.d / 2, top: n.y - n.d / 2, width: n.d, height: n.d }}
              onMouseEnter={() => setHovId(n.id)}
              onMouseLeave={() => setHovId(null)}
              onClick={() => { if (!moved.current && n.id) onOpen(n.id); }}
              disabled={!n.id}
              aria-label={n.code}
            >
              <Flag iso={n.iso} code={n.code} size={n.d} rounded={false} />
            </button>
          );
        })}

        {scores.map((s, i) => (
          <span key={`s${i}`} className="bc-score" style={{ left: s.x, top: s.y, fontSize: Math.max(8, S * 0.018) }}>{s.t}</span>
        ))}
      </div>

      <div className="bc-zoom">
        <button onClick={() => zoomBtn(1.25)} aria-label="Zooma in">+</button>
        <button onClick={() => zoomBtn(0.8)} aria-label="Zooma ut">−</button>
        <button onClick={reset} aria-label="Återställ" className="bc-zoom-reset">⤢</button>
      </div>

      <style>{`
        .bc-wrap{ position:relative; width:100%; max-width:640px; margin:6px auto 0; aspect-ratio:1/1; overflow:hidden; touch-action:none; border-radius:18px; }
        .bc-stage{ position:absolute; inset:0; transform-origin:center; will-change:transform; }
        .bc-svg{ position:absolute; inset:0; }
        .bc-round{ position:absolute; transform:translate(-50%,-50%); z-index:1; pointer-events:none; font-weight:800;
          letter-spacing:.08em; color:color-mix(in srgb, var(--ink-3) 60%, transparent); }
        .bc-trophy{ position:absolute; transform:translate(-50%,-52%); line-height:1; filter:drop-shadow(0 0 14px rgba(255,190,80,.6)); pointer-events:none; z-index:2; }
        .bc-jdot{ position:absolute; border-radius:50%; background:color-mix(in srgb, var(--ink-3) 40%, transparent); z-index:3; }
        .bc-badge{ position:absolute; padding:0; border-radius:50%; overflow:hidden; background:var(--surface-2);
          box-shadow:0 0 0 1.5px var(--line-2), 0 2px 6px rgba(0,0,0,.3); display:grid; place-items:center; z-index:3;
          transition:transform .12s, box-shadow .15s, opacity .15s, filter .15s; }
        .bc-badge:not(:disabled):active{ transform:scale(.92); }
        .bc-badge.hov{ box-shadow:0 0 0 2.5px var(--cool), 0 0 12px color-mix(in srgb, var(--cool) 50%, transparent); z-index:5; }
        .bc-badge.live{ box-shadow:0 0 0 2px var(--hot), 0 0 10px color-mix(in srgb, var(--hot) 45%, transparent); }
        .bc-badge.lost{ opacity:.42; filter:grayscale(.65); }
        .bc-badge img{ display:block; border-radius:0; }
        .bc-score{ position:absolute; transform:translate(-50%,-50%); z-index:4; pointer-events:none;
          font-family:var(--font-display); font-weight:800; font-variant-numeric:tabular-nums; color:var(--ink-2);
          text-shadow:0 1px 4px rgba(0,0,0,.95), 0 0 3px rgba(0,0,0,.9); letter-spacing:-.02em; white-space:nowrap; }
        .bc-zoom{ position:absolute; right:10px; bottom:10px; z-index:8; display:flex; flex-direction:column; gap:6px; }
        .bc-zoom button{ width:34px; height:34px; border-radius:10px; background:color-mix(in srgb, var(--surface) 80%, transparent);
          backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); border:1px solid var(--line-2); color:var(--ink-2);
          font-size:19px; font-weight:800; line-height:1; display:grid; place-items:center; box-shadow:0 2px 8px rgba(0,0,0,.3); }
        .bc-zoom button:active{ transform:scale(.93); }
        .bc-zoom-reset{ font-size:15px !important; }
      `}</style>
    </div>
  );
}
