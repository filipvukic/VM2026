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
  getMin,
}: {
  lineup: RawLineup;
  color: string;
  match: Match;
  teamCode: string | null;
  onPlayer: (name: string, espnId?: string | null) => void;
  getRating?: (name: string) => number | null;
  getMin?: (name: string) => number | null;
}) {
  const db = usePlayersDb();
  const rows = buildRows(lineup); // back-to-front: [GK], defence, midfield(s), attack
  const nRows = rows.length;
  // keep the top row clear of the pitch edge and give the rows breathing room
  const rowY = (idx: number) => 88 - (idx / Math.max(1, nRows - 1)) * 75;

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
    <div className="pitch">
      <div className="pitch-lines" />
      {rows.map((row, idx) => {
        const ordered = row
          .map((p, i) => ({ p, i }))
          .sort((a, b) => sideScore(a.p.position || "") - sideScore(b.p.position || "") || a.i - b.i)
          .map((x) => x.p);
        return ordered.map((p, i) => {
          const x = ((i + 1) / (ordered.length + 1)) * 100;
          const nm = (p.name || "").toLowerCase();
          return (
            <PitchPlayer
              key={p.name + "-" + idx + "-" + i}
              p={p}
              photo={lineupPhoto(p.name, p.espnId, db)}
              color={color}
              x={x}
              y={rowY(idx)}
              goals={goalCount.get(nm) || 0}
              assists={assistCount.get(nm) || 0}
              red={redNames.has(nm)}
              outAt={subOut.get(nm)}
              minutes={getMin ? getMin(p.name) : null}
              rating={getRating ? getRating(p.name) : null}
              onClick={() => onPlayer(p.name, p.espnId)}
            />
          );
        });
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
        .ppl{ position:absolute; transform:translate(-50%,-50%); display:flex; flex-direction:column; align-items:center; gap:9px; width:74px; }
        .ppl-card{ position:relative; width:54px; height:54px; border-radius:16px; overflow:visible; }
        .ppl-img{ width:100%; height:100%; border-radius:16px; overflow:hidden; background:var(--surface-3);
          display:grid; place-items:center; box-shadow:0 6px 14px -6px rgba(0,0,0,.8); border:2px solid rgba(255,255,255,.85); }
        .ppl-img img{ width:100%; height:100%; object-fit:cover; }
        .ppl-min{ position:absolute; left:-6px; top:-6px; min-width:19px; height:17px; padding:0 4px; border-radius:7px;
          display:grid; place-items:center; font-family:var(--font-display); font-weight:800; font-size:9.5px; color:#fff;
          background:color-mix(in srgb, var(--bg) 75%, transparent); border:1px solid var(--line-2); }
        .ppl-fallnum{ font-family:var(--font-display); font-weight:800; font-size:24px; color:#fff; text-shadow:0 1px 3px rgba(0,0,0,.5); }
        .ppl-name{ font-size:10.5px; font-weight:800; color:#fff; text-shadow:0 1px 3px rgba(0,0,0,.95);
          white-space:nowrap; max-width:80px; overflow:hidden; text-overflow:ellipsis; }
        .ppl-name-num{ color:var(--ink-3); margin-right:3px; }
        .ppl-badges{ position:absolute; right:-6px; top:-6px; display:flex; flex-direction:column; gap:2px; align-items:flex-end; }
        .ppl-b{ min-width:18px; height:18px; padding:0 3px; border-radius:9px; display:grid; place-items:center; font-size:10px; font-weight:800; box-shadow:0 2px 5px rgba(0,0,0,.5); }
        .ppl-b.goal{ background:#fff; color:#0a0712; }
        .ppl-b.assist{ background:var(--cool); color:#fff; font-family:var(--font-display); font-size:10px; }
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
  minutes,
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
  minutes?: number | null;
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
        {minutes != null && <span className="ppl-min">{minutes}'</span>}
        <div className="ppl-badges">
          {goals > 0 && <span className="ppl-b goal">{goals > 1 ? `⚽${goals}` : "⚽"}</span>}
          {assists > 0 && <span className="ppl-b assist" title="Assist">{assists > 1 ? `A${assists}` : "A"}</span>}
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
