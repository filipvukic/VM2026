import { useState } from "react";
import { usePlayersDb } from "../state/dataset";
import { lineupPhoto } from "../lib/playerPhoto";
import { initials } from "../lib/format";
import { buildRows, sideScore } from "../lib/formation";
import { ratingColor } from "../lib/rating";
import type { Match, RawLineup, RawLineupPlayer } from "../data/types";


export interface SubInfo {
  outAt?: string | number; // starter subbed out at minute
  inFor?: string; // who replaced them
}

// Count distinct depth rows among outfield players (fallback when no formation
// string) — group x-values that are close together.
function countRows(xvals: number[]): number {
  if (!xvals.length) return 1;
  const sorted = [...xvals].sort((a, b) => a - b);
  let rows = 1;
  for (let i = 1; i < sorted.length; i++) if (sorted[i] - sorted[i - 1] > 0.07) rows++;
  return rows;
}

export function Pitch({
  lineup,
  color,
  match,
  teamCode,
  onPlayer,
  getRating,
  coords,
}: {
  lineup: RawLineup;
  color: string;
  match: Match;
  teamCode: string | null;
  onPlayer: (name: string, espnId?: string | null) => void;
  getRating?: (name: string) => number | null;
  coords?: { name: string; shirt?: string | number | null; x: number; y: number }[];
}) {
  const db = usePlayersDb();
  // Each placed player → its position on the pitch (%). Prefer FotMob's exact
  // per-player coords (correct formation & placement); else infer rows from the
  // formation string. FotMob x: 0=own goal→1=attack; y: 0-1 across. Our pitch is
  // portrait (GK bottom, attack up), so x→vertical, y→horizontal.
  const placed: { p: RawLineupPlayer; xPct: number; yPct: number }[] =
    coords && coords.length
      ? (() => {
          // Keep the keeper at the bottom; spread the OUTFIELD up the pitch with a
          // fixed gap per row, so the formation is taller when there are more rows
          // (4-2-3-1 → 4 rows, higher) and lower/compacter when fewer (4-3-3 → 3).
          // Horizontal fills 11–89; relative coords are preserved within each band.
          const xs = coords.map((c) => c.x), ys = coords.map((c) => c.y);
          const minY = Math.min(...ys), maxY = Math.max(...ys), spanY = maxY - minY || 1;
          const gkIdx = xs.indexOf(Math.min(...xs)); // deepest player = keeper
          const ofX = coords.filter((_, i) => i !== gkIdx).map((c) => c.x);
          const ofMin = Math.min(...ofX), ofMax = Math.max(...ofX), ofSpan = ofMax - ofMin || 1;
          const fparts = (lineup.formation || "").split("-").map(Number).filter((n) => n > 0);
          const rowCount = Math.max(2, Math.min(6, fparts.length >= 2 ? fparts.length : countRows(ofX)));
          const DEF = 75, GK_Y = 91; // deepest outfield row / keeper
          const TOP = Math.max(11, DEF - (rowCount - 1) * 16);
          return coords.map((c, i) => ({
            p: { name: c.name, jersey: c.shirt != null ? String(c.shirt) : undefined, shirtNumber: c.shirt ?? undefined } as RawLineupPlayer,
            xPct: 11 + ((c.y - minY) / spanY) * 78,
            yPct: i === gkIdx ? GK_Y : DEF - ((c.x - ofMin) / ofSpan) * (DEF - TOP),
          }));
        })()
      : (() => {
          const rows = buildRows(lineup);
          const n = rows.length; // row 0 = keeper, then outfield rows
          const gap = Math.min(16, 79 / Math.max(1, n - 1));
          const out: { p: RawLineupPlayer; xPct: number; yPct: number }[] = [];
          rows.forEach((row, idx) => {
            const ordered = row
              .map((p, i) => ({ p, i }))
              .sort((a, b) => sideScore(a.p.position || "") - sideScore(b.p.position || "") || a.i - b.i)
              .map((x) => x.p);
            ordered.forEach((p, i) =>
              out.push({ p, xPct: ((i + 1) / (ordered.length + 1)) * 100, yPct: idx === 0 ? 91 : 91 - idx * gap })
            );
          });
          return out;
        })();

  // Size players to the densest row: a back-4 / 4-man line gets roomy cards, and
  // only a 5-man line shrinks (special case). Fixed px (not %), so the value is
  // the same wherever the CSS var is used (card size, fonts) and never collapses.
  const rowCount: Record<number, number> = {};
  placed.forEach(({ yPct }) => {
    const b = Math.round(yPct / 6);
    rowCount[b] = (rowCount[b] || 0) + 1;
  });
  const maxRow = Math.max(2, ...Object.values(rowCount));
  const cardPx = maxRow >= 5 ? 44 : maxRow === 4 ? 54 : 56;
  const wPx = maxRow >= 5 ? 56 : maxRow === 4 ? 64 : 70;

  // count goals/assists per player so multiples show as ⚽×2 / A×2
  const goalCount = new Map<string, number>();
  const assistCount = new Map<string, number>();
  match.scorers.forEach((g) => {
    const n = (g.name || "").toLowerCase();
    goalCount.set(n, (goalCount.get(n) || 0) + 1);
    if (g.assist) { const a = g.assist.toLowerCase(); assistCount.set(a, (assistCount.get(a) || 0) + 1); }
  });
  const redNames = new Set(match.cards.filter((c) => c.type === "red").map((c) => (c.name || "").toLowerCase()));
  const subOut = new Map<string, string | number>();
  match.subs.filter((s) => s.team === teamCode).forEach((s) => {
    if (s.playerOut) subOut.set(s.playerOut.toLowerCase(), s.minute ?? "");
  });

  return (
    <div className="pitch" style={{ ["--ppl-w" as string]: `${wPx}px`, ["--ppl-card" as string]: `${cardPx}px` } as React.CSSProperties}>
      <div className="pitch-lines" />
      {placed.map(({ p, xPct, yPct }, i) => {
        const nm = (p.name || "").toLowerCase();
        return (
          <PitchPlayer
            key={p.name + "-" + i}
            p={p}
            photo={lineupPhoto(p.name, p.espnId, db)}
            color={color}
            x={xPct}
            y={yPct}
            goals={goalCount.get(nm) || 0}
            assists={assistCount.get(nm) || 0}
            red={redNames.has(nm)}
            outAt={subOut.get(nm)}
            rating={getRating ? getRating(p.name) : null}
            onClick={() => onPlayer(p.name, p.espnId)}
          />
        );
      })}
      <style>{`
        .pitch{ position:relative; width:100%; aspect-ratio:7/10.2; max-width:440px; margin:0 auto;
          border-radius:18px; overflow:hidden;
          background:linear-gradient(170deg,#0f3a22,#0c2c1a);
          border:1px solid var(--line-2); box-shadow:inset 0 0 60px rgba(0,0,0,.4); }
        .pitch-lines{ position:absolute; inset:0; opacity:.5;
          background:
            radial-gradient(circle at 50% 50%, transparent 48px, rgba(255,255,255,.16) 49px, transparent 51px),
            linear-gradient(rgba(255,255,255,.16),rgba(255,255,255,.16)) 50% 50%/100% 1px no-repeat;
          background-repeat:no-repeat; }
        .pitch-lines::before,.pitch-lines::after{ content:""; position:absolute; left:28%; width:44%; height:13%; border:1px solid rgba(255,255,255,.14); }
        .pitch-lines::before{ top:0; border-top:none; } .pitch-lines::after{ bottom:0; border-bottom:none; }
        .ppl{ position:absolute; transform:translate(-50%,-50%); display:flex; flex-direction:column; align-items:center; gap:7px; width:var(--ppl-w,72px); }
        .ppl-card{ position:relative; width:var(--ppl-card,54px); height:var(--ppl-card,54px); border-radius:calc(var(--ppl-card,54px) * .3); overflow:visible; }
        .ppl-img{ width:100%; height:100%; border-radius:inherit; overflow:hidden; background:var(--surface-3);
          display:grid; place-items:center; box-shadow:0 6px 14px -6px rgba(0,0,0,.8); border:2px solid rgba(255,255,255,.85); }
        .ppl-img img{ width:100%; height:100%; object-fit:cover; }
        .ppl-fallnum{ font-family:var(--font-display); font-weight:800; font-size:calc(var(--ppl-card,54px) * .44); color:#fff; text-shadow:0 1px 3px rgba(0,0,0,.5); }
        .ppl-name{ font-size:clamp(9px, calc(var(--ppl-card,54px) * .2), 11px); font-weight:800; color:#fff; text-shadow:0 1px 3px rgba(0,0,0,.95);
          white-space:nowrap; max-width:var(--ppl-w,72px); overflow:hidden; text-overflow:ellipsis; }
        .ppl-name-num{ color:var(--ink-3); margin-right:3px; }
        .ppl-badges{ position:absolute; right:-6px; top:-6px; display:flex; flex-direction:column; gap:2px; align-items:flex-end; }
        .ppl-b{ min-width:18px; height:18px; padding:0 3px; border-radius:9px; display:inline-flex; align-items:center; justify-content:center; gap:1px; line-height:1; box-shadow:0 2px 5px rgba(0,0,0,.5); }
        .ppl-bi{ font-size:10px; line-height:1; display:block; }
        .ppl-bn{ font-size:10px; font-weight:800; line-height:1; font-family:var(--font-display); }
        .ppl-b.goal{ background:#fff; color:#0a0712; }
        .ppl-b.assist{ background:color-mix(in srgb, var(--cool) 90%, #000); color:#fff; }
        .ppl-b.red{ width:11px; height:15px; border-radius:2px; background:var(--loss); }
        .ppl-out{ position:absolute; right:-7px; bottom:-5px; display:flex; align-items:center; gap:1px; height:16px; padding:0 4px;
          border-radius:8px; background:var(--loss); color:#fff; font-size:9px; font-weight:800; box-shadow:0 2px 5px rgba(0,0,0,.5); }
        .ppl-rating{ position:absolute; left:-6px; bottom:-7px;
          min-width:22px; height:16px; padding:0 3px; border-radius:5px; display:grid; place-items:center;
          font-size:10px; font-weight:800; color:#0a0712; box-shadow:0 2px 5px rgba(0,0,0,.55); }
        .ppl:active .ppl-card{ transform:scale(.93); }
        .ppl{ background:none; }
      `}</style>
    </div>
  );
}

function PitchPlayer({
  p,
  photo,
  color,
  x,
  y,
  goals,
  assists,
  red,
  outAt,
  rating,
  onClick,
}: {
  p: RawLineupPlayer;
  photo: string | null;
  color: string;
  x: number;
  y: number;
  goals: number;
  assists: number;
  red: boolean;
  outAt?: string | number;
  rating?: number | null;
  onClick: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const last = (p.name || "").split(" ").slice(-1)[0];
  const num = p.jersey || p.shirtNumber;
  const showImg = photo && !failed;
  return (
    <button className="ppl" style={{ left: `${x}%`, top: `${y}%` }} onClick={onClick}>
      <div className="ppl-card">
        <div className="ppl-img" style={!showImg ? { background: `linear-gradient(160deg, ${color}, color-mix(in srgb, ${color} 45%, #000))`, borderColor: "rgba(255,255,255,.4)" } : undefined}>
          {showImg ? (
            <img src={photo!} alt="" loading="lazy" onError={() => setFailed(true)} />
          ) : (
            <span className="ppl-fallnum">{num || initials(p.name)}</span>
          )}
        </div>
        <div className="ppl-badges">
          {goals > 0 && <span className="ppl-b goal"><span className="ppl-bi">⚽</span>{goals > 1 && <span className="ppl-bn">{goals}</span>}</span>}
          {assists > 0 && <span className="ppl-b assist" title="Assist"><span className="ppl-bi">👟</span>{assists > 1 && <span className="ppl-bn">{assists}</span>}</span>}
          {red && <span className="ppl-b red" />}
        </div>
        {outAt !== undefined && <span className="ppl-out">↓{outAt}'</span>}
        {rating != null && (
          <span className="ppl-rating num" style={{ background: ratingColor(rating) }}>{rating.toFixed(1)}</span>
        )}
      </div>
      <span className="ppl-name">{num ? <span className="ppl-name-num">{num}</span> : null}{last}</span>
    </button>
  );
}
