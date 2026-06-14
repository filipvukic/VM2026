import { useState } from "react";
import { usePlayersDb } from "../state/dataset";
import { lineupPhoto } from "../lib/playerPhoto";
import { initials } from "../lib/format";
import type { Match, RawLineup, RawLineupPlayer } from "../data/types";

function place(code: string): { band: number; side: number } {
  const c = (code || "").toUpperCase();
  const side = c.includes("L") ? -1 : c.includes("R") ? 1 : 0;
  if (c.startsWith("G")) return { band: 0, side: 0 };
  if (c.startsWith("DM") || c === "CDM") return { band: 2, side };
  if (c.includes("B") || c.startsWith("CD") || c.startsWith("CB") || c.startsWith("D")) return { band: 1, side };
  if (c.startsWith("F") || c.startsWith("ST") || c.startsWith("CF") || c.startsWith("LW") || c.startsWith("RW") || c.endsWith("W"))
    return { band: 4, side };
  return { band: 3, side };
}

interface PP extends RawLineupPlayer {
  band: number;
  side: number;
}

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
}: {
  lineup: RawLineup;
  color: string;
  match: Match;
  teamCode: string | null;
  onPlayer: (name: string, espnId?: string | null) => void;
}) {
  const db = usePlayersDb();
  const starters = (lineup.lineup || []).map((p) => ({ ...p, ...place(p.position || "") }));
  const bandsPresent = [0, 1, 2, 3, 4].filter((b) => starters.some((p) => p.band === b));
  const rowY = (band: number) => {
    const idx = bandsPresent.indexOf(band);
    const n = bandsPresent.length;
    return 91 - (idx / Math.max(1, n - 1)) * 82;
  };

  const goalNames = new Set(match.scorers.map((g) => (g.name || "").toLowerCase()));
  const redNames = new Set(match.cards.filter((c) => c.type === "red").map((c) => (c.name || "").toLowerCase()));
  const subOut = new Map<string, string | number>();
  match.subs.filter((s) => s.team === teamCode).forEach((s) => {
    if (s.playerOut) subOut.set(s.playerOut.toLowerCase(), s.minute ?? "");
  });

  return (
    <div className="pitch">
      <div className="pitch-lines" />
      {bandsPresent.map((band) => {
        const row = starters
          .filter((p) => p.band === band)
          .sort((a, b) => a.side - b.side || (lineup.lineup || []).indexOf(a) - (lineup.lineup || []).indexOf(b));
        return row.map((p, i) => {
          const x = ((i + 1) / (row.length + 1)) * 100;
          const nm = (p.name || "").toLowerCase();
          return (
            <PitchPlayer
              key={p.name + i}
              p={p}
              photo={lineupPhoto(p.name, p.espnId, db)}
              color={color}
              x={x}
              y={rowY(band)}
              goal={goalNames.has(nm)}
              red={redNames.has(nm)}
              outAt={subOut.get(nm)}
              onClick={() => onPlayer(p.name, p.espnId)}
            />
          );
        });
      })}
      <style>{`
        .pitch{ position:relative; width:100%; aspect-ratio:7/9; max-width:440px; margin:0 auto;
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
        .ppl{ position:absolute; transform:translate(-50%,-50%); display:flex; flex-direction:column; align-items:center; gap:4px; width:74px; }
        .ppl-card{ position:relative; width:54px; height:54px; border-radius:16px; overflow:visible; }
        .ppl-img{ width:100%; height:100%; border-radius:16px; overflow:hidden; background:var(--surface-3);
          display:grid; place-items:center; box-shadow:0 6px 14px -6px rgba(0,0,0,.8); border:2px solid rgba(255,255,255,.85); }
        .ppl-img img{ width:100%; height:100%; object-fit:cover; }
        .ppl-num{ position:absolute; left:-6px; top:-6px; min-width:19px; height:19px; padding:0 4px; border-radius:7px;
          display:grid; place-items:center; font-family:var(--font-display); font-weight:800; font-size:11px; color:#0a0712; box-shadow:0 2px 5px rgba(0,0,0,.5); }
        .ppl-fallnum{ font-family:var(--font-display); font-weight:800; font-size:24px; color:#fff; text-shadow:0 1px 3px rgba(0,0,0,.5); }
        .ppl-name{ font-size:10.5px; font-weight:800; color:#fff; text-shadow:0 1px 3px rgba(0,0,0,.95);
          white-space:nowrap; max-width:74px; overflow:hidden; text-overflow:ellipsis; }
        .ppl-badges{ position:absolute; right:-6px; top:-6px; display:flex; flex-direction:column; gap:2px; align-items:flex-end; }
        .ppl-b{ width:18px; height:18px; border-radius:50%; display:grid; place-items:center; font-size:10px; box-shadow:0 2px 5px rgba(0,0,0,.5); }
        .ppl-b.goal{ background:#fff; }
        .ppl-b.red{ width:11px; height:15px; border-radius:2px; background:var(--loss); }
        .ppl-out{ position:absolute; right:-7px; bottom:-5px; display:flex; align-items:center; gap:1px; height:16px; padding:0 4px;
          border-radius:8px; background:var(--loss); color:#fff; font-size:9px; font-weight:800; box-shadow:0 2px 5px rgba(0,0,0,.5); }
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
  goal,
  red,
  outAt,
  onClick,
}: {
  p: PP;
  photo: string | null;
  color: string;
  x: number;
  y: number;
  goal: boolean;
  red: boolean;
  outAt?: string | number;
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
        {num && <span className="ppl-num" style={{ background: color }}>{num}</span>}
        <div className="ppl-badges">
          {goal && <span className="ppl-b goal">⚽</span>}
          {red && <span className="ppl-b red" />}
        </div>
        {outAt !== undefined && <span className="ppl-out">↓{outAt}'</span>}
      </div>
      <span className="ppl-name">{last}</span>
    </button>
  );
}
