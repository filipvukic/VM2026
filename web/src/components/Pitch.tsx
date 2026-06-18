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
          // Render FotMob's actual player coordinates, normalised to fill the pitch
          // (their raw coords sit in a compact band). This reproduces FotMob's
          // layout: keeper deep, outfield spread evenly up the pitch, full width.
          const xs = coords.map((c) => c.x), ys = coords.map((c) => c.y);
          const minX = Math.min(...xs), maxX = Math.max(...xs), spanX = maxX - minX || 1;
          const minY = Math.min(...ys), maxY = Math.max(...ys), spanY = maxY - minY || 1;
          return coords.map((c) => ({
            p: { name: c.name, jersey: c.shirt != null ? String(c.shirt) : undefined, shirtNumber: c.shirt ?? undefined } as RawLineupPlayer,
            xPct: 11 + ((c.y - minY) / spanY) * 78,
            yPct: 90 - ((c.x - minX) / spanX) * 80,
          }));
        })()
      : (() => {
          const rows = buildRows(lineup);
          const n = rows.length;
          const out: { p: RawLineupPlayer; xPct: number; yPct: number }[] = [];
          rows.forEach((row, idx) => {
            const ordered = row
              .map((p, i) => ({ p, i }))
              .sort((a, b) => sideScore(a.p.position || "") - sideScore(b.p.position || "") || a.i - b.i)
              .map((x) => x.p);
            ordered.forEach((p, i) =>
              out.push({ p, xPct: ((i + 1) / (ordered.length + 1)) * 100, yPct: 90 - (idx / Math.max(1, n - 1)) * 80 })
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
  // FotMob-style round photos — medium size, scaled down a touch for a 5-man row.
  const cardPx = maxRow >= 5 ? 42 : maxRow === 4 ? 48 : 50;
  const wPx = cardPx + 24;

  // count goals/assists per player so multiples show as ⚽×2 / A×2
  const goalCount = new Map<string, number>();
  const assistCount = new Map<string, number>();
  match.scorers.forEach((g) => {
    const n = (g.name || "").toLowerCase();
    goalCount.set(n, (goalCount.get(n) || 0) + 1);
    if (g.assist) { const a = g.assist.toLowerCase(); assistCount.set(a, (assistCount.get(a) || 0) + 1); }
  });
  const cardByName = new Map<string, "yellow" | "red">();
  match.cards.forEach((c) => {
    const n = (c.name || "").toLowerCase();
    if (c.type === "red" || !cardByName.has(n)) cardByName.set(n, c.type === "red" ? "red" : "yellow");
  });
  const subOut = new Map<string, string | number>();
  match.subs.filter((s) => s.team === teamCode).forEach((s) => {
    if (s.playerOut) subOut.set(s.playerOut.toLowerCase(), s.minute ?? "");
  });
  // highest rating = player of the match (gets a star)
  let maxRating = 0;
  if (getRating) placed.forEach(({ p }) => { const r = getRating(p.name); if (r != null && r > maxRating) maxRating = r; });

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
            card={cardByName.get(nm)}
            subOut={subOut.get(nm)}
            rating={getRating ? getRating(p.name) : null}
            motm={!!getRating && maxRating > 0 && getRating(p.name) === maxRating}
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
        .ppl-card{ position:relative; width:var(--ppl-card,54px); height:var(--ppl-card,54px); border-radius:50%; overflow:visible; }
        .ppl-img{ width:100%; height:100%; border-radius:inherit; overflow:hidden; background:var(--surface-3);
          display:grid; place-items:center; box-shadow:0 6px 14px -6px rgba(0,0,0,.8); }
        .ppl-img img{ width:100%; height:100%; object-fit:cover; }
        .ppl-fallnum{ font-family:var(--font-display); font-weight:800; font-size:calc(var(--ppl-card,54px) * .44); color:#fff; text-shadow:0 1px 3px rgba(0,0,0,.5); }
        .ppl-name{ font-size:clamp(9px, calc(var(--ppl-card,54px) * .2), 11px); font-weight:800; color:#fff; text-shadow:0 1px 3px rgba(0,0,0,.95);
          white-space:nowrap; max-width:var(--ppl-w,72px); overflow:hidden; text-overflow:ellipsis; }
        .ppl-name-num{ color:var(--ink-3); margin-right:3px; }
        /* events stacked top-left, rating top-right — clean, like FotMob */
        .ppl-ev{ position:absolute; left:-3px; top:-3px; display:flex; flex-direction:column; gap:2px; align-items:flex-start; }
        .ppl-chip{ height:15px; min-width:15px; padding:0 3px; border-radius:7px; display:inline-flex; align-items:center; justify-content:center; gap:1px;
          font-size:9px; font-weight:800; line-height:1; font-family:var(--font-display); box-shadow:0 1px 3px rgba(0,0,0,.4); }
        .ppl-chip.goal{ background:#fff; color:#0a0712; }
        .ppl-chip.assist{ background:var(--cool); color:#fff; }
        .ppl-chip.sub{ background:rgba(8,6,15,.78); color:#fff; }
        .ppl-chip.card{ width:10px; min-width:10px; height:14px; border-radius:2px; padding:0; }
        .ppl-chip.card.y{ background:var(--gold); } .ppl-chip.card.r{ background:var(--loss); }
        .ppl-rt{ position:absolute; right:-4px; top:-4px; min-width:19px; height:17px; padding:0 4px; border-radius:9px;
          display:grid; place-items:center; font-size:10px; font-weight:800; color:#0a0712; box-shadow:0 1px 4px rgba(0,0,0,.45); }
        .ppl-rt.motm{ box-shadow:0 0 0 1.6px var(--gold), 0 1px 4px rgba(0,0,0,.5); }
        .ppl-star{ position:absolute; right:-8px; top:-10px; font-size:11px; color:var(--gold); line-height:1; text-shadow:0 1px 2px rgba(0,0,0,.6); }
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
  card,
  subOut,
  rating,
  motm,
  onClick,
}: {
  p: RawLineupPlayer;
  photo: string | null;
  color: string;
  x: number;
  y: number;
  goals: number;
  assists: number;
  card?: "yellow" | "red";
  subOut?: string | number;
  rating?: number | null;
  motm?: boolean;
  onClick: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const last = (p.name || "").split(" ").slice(-1)[0];
  const num = p.jersey || p.shirtNumber;
  const showImg = photo && !failed;
  return (
    <button className="ppl" style={{ left: `${x}%`, top: `${y}%` }} onClick={onClick}>
      <div className="ppl-card">
        <div className="ppl-img" style={!showImg ? { background: `linear-gradient(160deg, ${color}, color-mix(in srgb, ${color} 45%, #000))` } : undefined}>
          {showImg ? (
            <img src={photo!} alt="" loading="lazy" onError={() => setFailed(true)} />
          ) : (
            <span className="ppl-fallnum">{num || initials(p.name)}</span>
          )}
        </div>
        <div className="ppl-ev">
          {goals > 0 && <span className="ppl-chip goal" title="Mål">⚽{goals > 1 ? goals : ""}</span>}
          {assists > 0 && <span className="ppl-chip assist" title="Assist">A{assists > 1 ? assists : ""}</span>}
          {card && <span className={`ppl-chip card ${card === "red" ? "r" : "y"}`} title={card === "red" ? "Rött kort" : "Gult kort"} />}
          {subOut !== undefined && <span className="ppl-chip sub" title="Utbytt">↓{subOut}'</span>}
        </div>
        {rating != null && (
          <span className={`ppl-rt num${motm ? " motm" : ""}`} style={{ background: ratingColor(rating) }}>{rating.toFixed(1)}</span>
        )}
        {motm && <span className="ppl-star" title="Matchens spelare">★</span>}
      </div>
      <span className="ppl-name">{num ? <span className="ppl-name-num">{num}</span> : null}{last}</span>
    </button>
  );
}
