import { useEffect, useState } from "react";
import { usePlayersDb } from "../state/dataset";
import { lineupPhotoSources } from "../lib/playerPhoto";
import { initials } from "../lib/format";
import { buildRows, sideScore } from "../lib/formation";
import { ratingColor } from "../lib/rating";
import { PlayerImg } from "./PlayerImg";
import type { Match, RawLineup, RawLineupPlayer } from "../data/types";

// FotMob shows the player of the match with a blue rating badge + a star.
export const MOTM_BLUE = "#2483e0";

// Short Swedish position label from an ESPN/FotMob position abbreviation.
export function posLabel(pos?: string | null): string {
  if (!pos) return "";
  const p = pos.toUpperCase();
  if (p === "SUB" || p === "SUBSTITUTE") return ""; // ESPN tags all bench "SUB" — useless
  if (p === "G" || p.startsWith("GK") || p === "GOALKEEPER") return "Målvakt";
  if (p[0] === "D" || ["CB", "LB", "RB", "LWB", "RWB", "SW"].includes(p)) return "Back";
  if (p[0] === "M" || ["CM", "DM", "CDM", "AM", "CAM", "LM", "RM"].includes(p)) return "Mittfält";
  if (p[0] === "F" || ["ST", "CF", "LW", "RW", "SS"].includes(p)) return "Anfall";
  return pos;
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
  getRating,
  coords,
  motmRating,
  fotmobIdByShirt,
}: {
  lineup: RawLineup;
  color: string;
  match: Match;
  teamCode: string | null;
  onPlayer: (name: string, espnId?: string | null, fmId?: string | null) => void;
  getRating?: (name: string) => number | null;
  coords?: { name: string; shirt?: string | number | null; x: number; y: number }[];
  // The highest rating in the WHOLE match (both teams). When given, only the
  // single match-best player gets the blue pill + star — so a team's own best
  // player who wasn't the best on the pitch shows a normal (green/orange) rating.
  motmRating?: number | null;
  // shirt number → FotMob player id, for the (correct, official) FotMob photo.
  fotmobIdByShirt?: Map<string, string>;
}) {
  const db = usePlayersDb();
  // Each placed player → its position on the pitch (%). Prefer FotMob's exact
  // per-player coords (correct formation & placement); else infer rows from the
  // formation string. FotMob x: 0=own goal→1=attack; y: 0-1 across. Our pitch is
  // portrait (GK bottom, attack up), so x→vertical, y→horizontal.
  // FotMob coords carry only name + shirt (no espnId), so recover each player's
  // ESPN id by their shirt number from the ESPN line-up — otherwise the photo
  // lookup falls back to fuzzy name matching and shows the wrong player's face.
  const espnByShirt = new Map<string, RawLineupPlayer>();
  [...(lineup.lineup || []), ...(lineup.bench || [])].forEach((pl) => {
    const sh = String(pl.jersey ?? pl.shirtNumber ?? "").trim();
    if (sh) espnByShirt.set(sh, pl);
  });

  const placed: { p: RawLineupPlayer; xPct: number; yPct: number }[] =
    coords && coords.length
      ? (() => {
          // Render FotMob's actual player coordinates, normalised to fill the pitch
          // (their raw coords sit in a compact band). This reproduces FotMob's
          // layout: keeper deep, outfield spread evenly up the pitch, full width.
          const xs = coords.map((c) => c.x), ys = coords.map((c) => c.y);
          const minX = Math.min(...xs), maxX = Math.max(...xs), spanX = maxX - minX || 1;
          const minY = Math.min(...ys), maxY = Math.max(...ys), spanY = maxY - minY || 1;
          return coords.map((c) => {
            const sh = c.shirt != null ? String(c.shirt).trim() : "";
            const ep = sh ? espnByShirt.get(sh) : undefined;
            return {
              p: { name: c.name, jersey: c.shirt != null ? String(c.shirt) : undefined, shirtNumber: c.shirt ?? undefined, espnId: ep?.espnId, position: ep?.position } as RawLineupPlayer,
              xPct: 11 + ((c.y - minY) / spanY) * 78,
              yPct: 90 - ((c.x - minX) / spanX) * 80,
            };
          });
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

  // Count goals/assists per player so multiples show as ⚽×2 / A×2. Live scorer names
  // (ESPN/football-data) don't always match the line-up name verbatim — accents, dots,
  // "B. Saka" vs "Bukayo Saka" — so we index by BOTH a normalised full name and a
  // normalised surname and look up full-first, surname-fallback. Without this a goal/
  // assist scored mid-match often never lit up on the right player in the XI.
  const evNorm = (s?: string | null) =>
    (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
  const evLast = (s?: string | null) => evNorm((s || "").trim().split(/\s+/).slice(-1)[0]);
  const goalFull = new Map<string, number>(), goalLast = new Map<string, number>();
  const assistFull = new Map<string, number>(), assistLast = new Map<string, number>();
  const bump = (full: Map<string, number>, last: Map<string, number>, name?: string | null) => {
    const f = evNorm(name); if (!f) return;
    full.set(f, (full.get(f) || 0) + 1);
    const l = evLast(name); if (l) last.set(l, (last.get(l) || 0) + 1);
  };
  match.scorers.forEach((g) => { bump(goalFull, goalLast, g.name); if (g.assist) bump(assistFull, assistLast, g.assist); });
  const goalsOf = (name: string) => goalFull.get(evNorm(name)) ?? goalLast.get(evLast(name)) ?? 0;
  const assistsOf = (name: string) => assistFull.get(evNorm(name)) ?? assistLast.get(evLast(name)) ?? 0;
  const cardByName = new Map<string, "yellow" | "red">();
  match.cards.forEach((c) => {
    const n = (c.name || "").toLowerCase();
    if (c.type === "red" || !cardByName.has(n)) cardByName.set(n, c.type === "red" ? "red" : "yellow");
  });
  const subOut = new Map<string, string | number>();
  match.subs.filter((s) => s.team === teamCode).forEach((s) => {
    if (s.playerOut) subOut.set(s.playerOut.toLowerCase(), s.minute ?? "");
  });
  // Player of the match gets the blue pill + star. Prefer the match-wide best
  // (passed in); else fall back to this team's best across XI + bench.
  let maxRating = 0;
  if (getRating) {
    const consider = (nm: string) => { const r = getRating(nm); if (r != null && r > maxRating) maxRating = r; };
    placed.forEach(({ p }) => consider(p.name));
    (lineup.bench || []).forEach((p) => consider(p.name));
  }
  const starRating = motmRating != null ? motmRating : maxRating;

  return (
    <div className="pitch" style={{ ["--ppl-w" as string]: `${wPx}px`, ["--ppl-card" as string]: `${cardPx}px` } as React.CSSProperties}>
      <div className="pitch-lines" />
      {placed.map(({ p, xPct, yPct }, i) => {
        const nm = (p.name || "").toLowerCase();
        const fmId = fotmobIdByShirt?.get(String(p.jersey ?? p.shirtNumber ?? "").trim());
        return (
          // Key by the STABLE shirt number (falls back to name), NOT the layout index —
          // so when FotMob coords arrive and the layout switches, each player UPDATES in
          // place (photo shimmer→fade) instead of remounting and re-flashing.
          <PitchPlayer
            key={String(p.jersey ?? p.shirtNumber ?? p.name)}
            p={p}
            photos={lineupPhotoSources(p.name, p.espnId, db, fmId)}
            color={color}
            x={xPct}
            y={yPct}
            goals={goalsOf(p.name)}
            assists={assistsOf(p.name)}
            card={cardByName.get(nm)}
            subOut={subOut.get(nm)}
            rating={getRating ? getRating(p.name) : null}
            motm={!!getRating && starRating > 0 && getRating(p.name) === starRating}
            onClick={() => onPlayer(p.name, p.espnId, fmId)}
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
        /* Clearly-visible ghost shimmer while a player's photo loads (the default
           .img-skel is too subtle on the dark pitch) — a brighter sweep, still round. */
        .ppl-img.img-skel{ background:linear-gradient(100deg, var(--surface-3) 18%, var(--surface-hi) 50%, var(--surface-3) 82%); background-size:220% 100%; }
        .ppl-fallnum{ font-family:var(--font-display); font-weight:800; font-size:calc(var(--ppl-card,54px) * .44); color:#fff; text-shadow:0 1px 3px rgba(0,0,0,.5); }
        .ppl-name{ font-size:clamp(9px, calc(var(--ppl-card,54px) * .2), 11px); font-weight:800; color:#fff; text-shadow:0 1px 3px rgba(0,0,0,.95);
          white-space:nowrap; max-width:var(--ppl-w,72px); overflow:hidden; text-overflow:ellipsis; }
        .ppl-name-num{ color:var(--ink-3); margin-right:3px; }
        /* Match's player gets a gold ring; the photo stays borderless otherwise. */
        .ppl-card.motm .ppl-img{ box-shadow:0 0 0 2px var(--gold), 0 0 11px -1px color-mix(in srgb,var(--gold) 70%,transparent), 0 6px 14px -6px rgba(0,0,0,.8); }
        /* FotMob-clean badges — one small element per corner, none over the face:
           sub-off minute ABOVE · rating top-right · card bottom-left · goal/assist bottom-right. */
        .ppl-min{ position:absolute; top:-12px; left:50%; transform:translateX(-50%); display:flex; align-items:center; gap:2px;
          font-family:var(--font-display); font-size:8.5px; font-weight:800; color:var(--ink-2); white-space:nowrap; text-shadow:0 1px 2px rgba(0,0,0,.9); }
        .ppl-min .arr{ color:var(--loss); }
        .ppl-rt{ position:absolute; right:-4px; top:-4px; min-width:18px; height:16px; padding:0 3px; border-radius:7px;
          display:inline-flex; align-items:center; justify-content:center; gap:1px; font-family:var(--font-display); font-size:9.5px; font-weight:800;
          color:#fff; border:1.5px solid rgba(7,26,16,.92); box-shadow:0 1px 3px rgba(0,0,0,.5); }
        .ppl-rt .star{ font-size:8px; }
        .ppl-mark{ position:absolute; display:grid; place-items:center; font-family:var(--font-display); font-weight:800; line-height:1;
          border:1.5px solid rgba(7,26,16,.92); box-shadow:0 1px 3px rgba(0,0,0,.5); }
        /* goal + assist sit together at bottom-right (both show when a player did both) */
        .ppl-marks{ position:absolute; right:-5px; bottom:-3px; display:flex; align-items:center; gap:2px; }
        .ppl-marks .ppl-mark{ position:static; }
        .ppl-mark.goal{ min-width:15px; height:15px; padding:0 2px; border-radius:8px; background:#fff; color:#0a0712; font-size:8.5px; }
        .ppl-mark.assist{ min-width:15px; height:15px; padding:0 2px; border-radius:8px; background:var(--cool); color:#fff; font-size:8.5px; }
        .ppl-mark.card{ position:absolute; left:-3px; bottom:-3px; width:10px; height:13px; border-radius:2px; }
        .ppl-mark.card.y{ background:var(--gold); } .ppl-mark.card.r{ background:var(--loss); }
        .ppl:active .ppl-card{ transform:scale(.93); }
        .ppl{ background:none; }
      `}</style>
    </div>
  );
}

function PitchPlayer({
  p,
  photos,
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
  photos: string[];
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
  const key = photos.join("|");
  const [idx, setIdx] = useState(0);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => setIdx(0), [key]); // reset the fallback chain when the player changes
  const last = (p.name || "").split(" ").slice(-1)[0];
  const num = p.jersey || p.shirtNumber;
  const cur = idx < photos.length ? photos[idx] : null;
  useEffect(() => setLoaded(false), [cur]); // ghost-shimmer until the (new) photo paints
  return (
    <button className="ppl" style={{ left: `${x}%`, top: `${y}%` }} onClick={onClick}>
      <div className={`ppl-card${motm ? " motm" : ""}`}>
        {subOut !== undefined && (
          <span className="ppl-min" title={`Utbytt ${subOut}'`}><span className="arr">↓</span>{subOut}'</span>
        )}
        <div className={`ppl-img${cur && !loaded ? " img-skel" : ""}`} style={!cur ? { background: `linear-gradient(160deg, ${color}, color-mix(in srgb, ${color} 45%, #000))` } : undefined}>
          {cur ? (
            <img src={cur} alt="" decoding="async" onLoad={() => setLoaded(true)} onError={() => setIdx((i) => i + 1)} style={{ opacity: loaded ? 1 : 0, transition: "opacity .3s ease" }} />
          ) : (
            <span className="ppl-fallnum">{num || initials(p.name)}</span>
          )}
        </div>
        {rating != null && (
          <span className="ppl-rt" style={{ background: motm ? MOTM_BLUE : ratingColor(rating) }}>
            {motm && <span className="star" title="Matchens spelare">★</span>}{rating.toFixed(1)}
          </span>
        )}
        {(goals > 0 || assists > 0) && (
          <span className="ppl-marks">
            {goals > 0 && <span className="ppl-mark goal" title="Mål">⚽{goals > 1 ? goals : ""}</span>}
            {assists > 0 && <span className="ppl-mark assist" title={assists > 1 ? `${assists} assist` : "Assist"}>A{assists > 1 ? assists : ""}</span>}
          </span>
        )}
        {card && <span className={`ppl-mark card ${card === "red" ? "r" : "y"}`} title={card === "red" ? "Rött kort" : "Gult kort"} />}
      </div>
      <span className="ppl-name">{num ? <span className="ppl-name-num">{num}</span> : null}{last}</span>
    </button>
  );
}

// A bench player — same circular look as the pitch, plus their position. Styles
// live in globals.css (.bp*). Used by the match view and the team view.
export function BenchPlayer({
  p,
  photos,
  rating,
  goals = 0,
  assists = 0,
  card,
  cameAt,
  forName,
  motm,
  onClick,
}: {
  p: RawLineupPlayer;
  photos: string[];
  rating?: number | null;
  goals?: number;
  assists?: number;
  card?: "yellow" | "red";
  cameAt?: string | number;
  forName?: string;
  motm?: boolean;
  onClick: () => void;
}) {
  const num = p.jersey || p.shirtNumber;
  const last = (p.name || "").split(" ").slice(-1)[0];
  const pos = posLabel(p.position);
  return (
    <button className="bp" onClick={onClick}>
      <span className={`bp-ph${motm ? " motm" : ""}`}>
        <PlayerImg srcs={photos} name={p.name} size={48} radius={24} fontSize={17} />
        {rating != null && (
          <span className="bp-rt num" style={{ background: motm ? MOTM_BLUE : ratingColor(rating) }}>
            {motm && <span className="bp-rt-star">★</span>}{rating.toFixed(1)}
          </span>
        )}
        {cameAt != null && <span className="bp-in num">↑{cameAt}'</span>}
        {goals > 0 && <span className="bp-ev goal">⚽{goals > 1 ? goals : ""}</span>}
        {goals === 0 && assists > 0 && <span className="bp-ev assist">A</span>}
        {card && <span className={`bp-ev card ${card === "red" ? "r" : "y"}`} />}
      </span>
      <span className="bp-name">{num ? <span className="bp-num">{num}</span> : null}{last}</span>
      {(pos || forName) && (
        <span className="bp-pos">{[pos, forName ? `för ${forName.split(" ").slice(-1)[0]}` : ""].filter(Boolean).join(" · ")}</span>
      )}
    </button>
  );
}
