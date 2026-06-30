import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Flag } from "../lib/flags";
import { isLive } from "../lib/liveState";
import { TEAM_COLORS } from "../data/static/teamColors";
import { flagColorSync, useFlagColors } from "../lib/flagColor";
import type { Dataset, Match } from "../data/types";

// Radial knockout bracket: 32 teams on the outer ring, converging inward through each
// round to the trophy at the centre. Radial dendrogram connectors (spokes + arcs); the
// two halves sit on the two sides with a gap top & bottom; the winner's spoke + half-arc
// light up in the team's flag colour up to the next-match point, losers fade, small
// scores at decided matches. Zoom steps through the rounds (no free pan) with a smooth
// animation; a fullscreen toggle. Circular orders = in-order traversal of the FIFA tree.
const R32_ORDER = [73, 75, 74, 77, 83, 84, 81, 82, 76, 78, 79, 80, 86, 88, 85, 87];
const R16_ORDER = [89, 90, 93, 94, 91, 92, 95, 96];
const QF_ORDER = [97, 98, 99, 100];
const SF_ORDER = [101, 102];

const RAD = [0.452, 0.358, 0.268, 0.18, 0.1];
const DIA = [0.05, 0.048, 0.046, 0.045, 0.045];
const GAP = 28;
const DELTA = 4.2;
const ROUND_NAMES = ["16-DEL", "8-DEL", "KVART", "SEMI", "FINAL"];
const LEVEL_SCALE = [1, 1.22, 1.62, 2.25, 3.1]; // gentle — frames each round without over-zooming past it
const LEVEL_LABEL = ["Hela slutspelet", "Åttondelsfinal", "Kvartsfinal", "Semifinal", "Final"];

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
  const outerRef = useRef<HTMLDivElement>(null);
  // Render at a fixed high resolution and display it scaled to fit — so zooming in
  // (CSS scale) stays sharp instead of upscaling a small low-res render.
  const BASE = 1100;
  const [dispW, setDispW] = useState(360);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setDispW(el.clientWidth);
    const ro = new ResizeObserver((es) => { for (const e of es) setDispW(e.contentRect.width); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const S = BASE;
  const fit = dispW / BASE;

  const byFifa: Record<number, Match> = {};
  [...ds.knockout.r32, ...ds.knockout.r16, ...ds.knockout.qf, ...ds.knockout.sf, ...ds.knockout.final, ...ds.knockout.third].forEach((m) => {
    if (m.fifa != null) byFifa[m.fifa] = m;
  });
  // derive each team's real flag colour for the winning paths (cached; re-renders when ready)
  useFlagColors(ds.knockout.r32.flatMap((m) => [m.home, m.away]).map((c) => (c ? ds.teams[c]?.iso ?? null : null)));

  // --- round-step zoom (no free pan) + fullscreen -----------------------------
  const started = (list: Match[]) => list.some((m) => m.status === "played" || isLive(m));
  const progressed = [ds.knockout.r16, ds.knockout.qf, ds.knockout.sf, ds.knockout.final].filter(started).length;
  const [level, setLevel] = useState(0);
  useEffect(() => { setLevel(progressed); }, [progressed]);
  const step = (d: number) => setLevel((l) => Math.max(0, Math.min(4, l + d)));
  const moved = useRef(false);
  const pts = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchBase = useRef(0);
  const onPointerDown = (e: PointerEvent) => {
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size === 1) moved.current = false;
    if (pts.current.size === 2) { const [a, b] = [...pts.current.values()]; pinchBase.current = Math.hypot(a.x - b.x, a.y - b.y); moved.current = true; }
  };
  // pinch zooms by whole rounds only — no free pan or free zoom.
  const onPointerMove = (e: PointerEvent) => {
    if (!pts.current.has(e.pointerId)) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size === 2 && pinchBase.current) {
      const [a, b] = [...pts.current.values()];
      const r = Math.hypot(a.x - b.x, a.y - b.y) / pinchBase.current;
      moved.current = true;
      if (r > 1.3) { step(1); pinchBase.current *= 1.3; }
      else if (r < 0.77) { step(-1); pinchBase.current *= 0.77; }
    }
  };
  const onPointerUp = (e: PointerEvent) => { pts.current.delete(e.pointerId); if (pts.current.size < 2) pinchBase.current = 0; };
  const wheelLock = useRef(0);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const onWheel = (e: globalThis.WheelEvent) => {
      e.preventDefault();
      if (e.timeStamp - wheelLock.current < 340) return;
      wheelLock.current = e.timeStamp;
      step(e.deltaY < 0 ? 1 : -1);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  // CSS-based fullscreen (a fixed overlay) — the Fullscreen API doesn't work on a div
  // in iOS Safari, so this is reliable everywhere.
  const [fs, setFs] = useState(false);
  const toggleFs = () => setFs((f) => !f);
  useEffect(() => {
    if (!fs) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [fs]);

  // --- geometry ---------------------------------------------------------------
  const C = S / 2;
  const R = RAD.map((x) => x * S);
  const D = DIA.map((x) => x * S);
  const isoOf = (code: string | null) => (code ? ds.teams[code]?.iso ?? null : null);
  const colorOf = (code: string | null) => {
    if (!code) return null;
    const t = ds.teams[code];
    return TEAM_COLORS[code] ?? flagColorSync(t?.iso) ?? t?.c1 ?? null;
  };
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
    <div className={`bc-outer${fs ? " bc-fullscreen" : ""}`} ref={outerRef}>
      <div className="bc-toolbar">
        <button className="bc-fs" onClick={toggleFs} aria-label={fs ? "Stäng helskärm" : "Helskärm"}>{fs ? "✕" : "⛶"}</button>
        <div className="bc-stepper">
          <button onClick={() => step(-1)} disabled={level === 0} aria-label="Zooma ut en omgång">−</button>
          <span>{LEVEL_LABEL[level]}</span>
          <button onClick={() => step(1)} disabled={level === 4} aria-label="Zooma in en omgång">+</button>
        </div>
      </div>

      <div className="bc-wrap" ref={ref} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        <div className="bc-stage" style={{ width: BASE, height: BASE, transform: `translate(-50%,-50%) scale(${fit * LEVEL_SCALE[level]})` }}>
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
                <Flag iso={n.iso} code={n.code} size={n.d} rounded={false} hi />
              </button>
            );
          })}

          {scores.map((s, i) => (
            <span key={`s${i}`} className="bc-score" style={{ left: s.x, top: s.y, fontSize: Math.max(8, S * 0.018) }}>{s.t}</span>
          ))}
        </div>
      </div>

      <style>{`
        .bc-outer{ position:relative; }
        .bc-toolbar{ display:flex; align-items:center; justify-content:space-between; gap:10px; max-width:620px; margin:0 auto 8px; padding:0 2px; }
        .bc-fs{ width:36px; height:36px; flex:0 0 auto; border-radius:10px; background:var(--surface); border:1px solid var(--line-2); color:var(--ink-2); font-size:16px; display:grid; place-items:center; }
        .bc-fs:active{ transform:scale(.94); }
        .bc-stepper{ display:inline-flex; align-items:center; gap:2px; background:var(--surface); border:1px solid var(--line-2); border-radius:var(--r-pill); padding:3px; }
        .bc-stepper button{ width:30px; height:30px; border-radius:50%; color:var(--ink-2); font-size:19px; font-weight:800; line-height:1; }
        .bc-stepper button:disabled{ opacity:.32; }
        .bc-stepper span{ font-size:12px; font-weight:800; color:var(--ink-2); min-width:112px; text-align:center; letter-spacing:.01em; }
        .bc-wrap{ position:relative; width:100%; max-width:620px; margin:0 auto; aspect-ratio:1/1; overflow:hidden; touch-action:none; border-radius:18px; }
        .bc-stage{ position:absolute; left:50%; top:50%; transform-origin:center; transition:transform .8s cubic-bezier(.16,1,.3,1); will-change:transform; }
        @media (prefers-reduced-motion: reduce){ .bc-stage{ transition:transform .2s ease; } }
        .bc-svg{ position:absolute; inset:0; }
        .bc-round{ position:absolute; transform:translate(-50%,-50%); z-index:1; pointer-events:none; font-weight:800; letter-spacing:.08em; color:color-mix(in srgb, var(--ink-3) 58%, transparent); }
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
        /* true fullscreen: the overlay (the "box") covers the whole screen (z 2000); the
           circle stays its normal fully-visible size, centred on that full-screen canvas —
           we just drop the surrounding app chrome. Toolbar floats over the top. */
        .bc-outer.bc-fullscreen{ position:fixed; inset:0; width:100vw; height:100dvh; z-index:2000; background:var(--bg); padding:0; overflow:hidden; }
        .bc-outer.bc-fullscreen .bc-wrap{ position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
          width:min(100vw, 100dvh); height:min(100vw, 100dvh); max-width:none; border-radius:0; }
        .bc-outer.bc-fullscreen .bc-toolbar{ position:absolute; top:max(12px, env(safe-area-inset-top)); left:50%; transform:translateX(-50%);
          z-index:10; width:min(94vw, 560px); max-width:none; margin:0; }
      `}</style>
    </div>
  );
}
