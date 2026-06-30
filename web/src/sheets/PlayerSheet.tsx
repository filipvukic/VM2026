import { useEffect, useRef } from "react";
import { useData } from "../state/dataset";
import { useSheets } from "../state/sheets";
import { Sheet, type SheetChrome } from "../components/Sheet";
import { Avatar } from "../components/Avatar";
import { Flag } from "../lib/flags";
import { classifyTip } from "../data/scoring";
import { svDayMonth } from "../lib/format";
import { fixName } from "../data/static/names";
import { isLive } from "../lib/liveState";
import { liveMinuteText } from "../lib/liveMinute";
import { useNow } from "../state/useNow";
import type { BonusSlot } from "../data/types";

const BONUS_LABEL: Record<BonusSlot, string> = {
  winner: "Vinnare", silver: "Silver", bronze: "Brons",
  topscorer: "Skyttekung", bestplayer: "Bästa spelare", youngplayer: "Bästa unga", keeper: "Bästa målvakt",
};

// Colour a graded tip by its score: exact (5) gold, right outcome (2) green,
// consolation (1) muted.
const ptsBg = (pts: number) => (pts === 5 ? "var(--gold)" : pts === 2 ? "var(--win)" : "var(--surface-3)");
const ptsFg = (pts: number) => (pts >= 2 ? "#0a0712" : "var(--ink-2)");

export function PlayerSheet({ id, ...chrome }: { id: string } & SheetChrome) {
  const ds = useData();
  const openMatch = useSheets((s) => s.openMatch);
  const openTeam = useSheets((s) => s.openTeam);
  const openFbPlayer = useSheets((s) => s.openFbPlayer);
  const now = useNow(30_000); // tick the live minute while the sheet is open
  const p = ds.players.find((x) => x.id === id);
  if (!p) return null;

  // Matches being played right now (so a tipster's profile shows the live action +
  // how their tip is doing against the running score).
  const live = ds.allMatches.filter(isLive).sort((a, b) => +a.kickoff - +b.kickoff);
  const updatedAt = ds.updatedAt ? new Date(ds.updatedAt).getTime() : null;

  // chronological: the WC's first played match at the top
  const tipped = ds.allMatches
    .filter((m) => p.tips[m.id])
    .sort((a, b) => +a.kickoff - +b.kickoff);
  // the next match this player has tipped that hasn't finished (live or upcoming)
  const nextId = tipped.find((m) => m.status !== "played")?.id;
  const nextRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = nextRef.current;
    if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "center" }), 250);
  }, [nextId]);

  // Standing context + accuracy.
  const N = ds.players.length;
  const leaderTotal = ds.players.reduce((mx, x) => Math.max(mx, x.total), 0);
  const behindLeader = Math.max(0, leaderTotal - p.total);
  const rank = p.rank;
  const medalBg = rank === 1 ? "var(--gold)" : rank === 2 ? "#cfd6e6" : rank === 3 ? "#e8965a" : "var(--surface-3)";
  const medalFg = rank <= 3 ? "#0a0712" : "var(--ink-2)";
  const graded = p.exact + p.correct + p.other;
  const hitRate = graded ? Math.round(((p.exact + p.correct) / graded) * 100) : 0;

  // Rank by hit rate among everyone who's had a tip graded — a different story than the
  // points table (a steady tipster can out-rank a high scorer here). Ties broken by
  // exacts, then by sample size.
  const hitRank = (() => {
    const rated = ds.players
      .map((x) => { const g = x.exact + x.correct + x.other; return { id: x.id, g, hr: g ? (x.exact + x.correct) / g : -1, ex: x.exact }; })
      .filter((x) => x.g > 0)
      .sort((a, b) => b.hr - a.hr || b.ex - a.ex || b.g - a.g);
    const i = rated.findIndex((x) => x.id === p.id);
    return i >= 0 ? { rank: i + 1, of: rated.length } : null;
  })();
  const hrMedal = !hitRank ? "var(--surface-3)" : hitRank.rank === 1 ? "var(--gold)" : hitRank.rank === 2 ? "#cfd6e6" : hitRank.rank === 3 ? "#e8965a" : "var(--surface-3)";
  const hrFg = hitRank && hitRank.rank <= 3 ? "#0a0712" : "var(--ink-2)";

  // Form: the most recent graded tips as a colour strip.
  const form = tipped
    .filter((m) => m.status === "played" && m.ga != null && m.gb != null)
    .slice(-14)
    .map((m) => ({ m, pts: classifyTip(p.tips[m.id]!, m.ga!, m.gb!).points }));

  return (
    <Sheet {...chrome} accent={p.color}>
      {/* HERO — identity at a glance: who, where they rank, how many points */}
      <div
        className="pl-hero"
        style={{ background: `linear-gradient(150deg, color-mix(in srgb, ${p.color} 26%, var(--surface-2)), var(--surface-2) 64%)` }}
      >
        <Avatar name={p.name} photo={p.photo} color={p.color} size={66} ring={rank <= 3 ? "var(--gold)" : null} zoomable />
        <div className="pl-id">
          <div className="display pl-name">{p.name}</div>
          <div className="pl-rankrow">
            <span className="pl-medal" style={{ background: medalBg, color: medalFg }}>#{rank}</span>
            <span className="pl-rankof dim">av {N} spelare</span>
          </div>
        </div>
        <div className="pl-total">
          <div><span className="pl-total-n">{p.total}</span><span className="pl-total-p">p</span></div>
          <div className="pl-gap" style={{ color: rank === 1 ? "var(--gold)" : "var(--ink-3)" }}>
            {rank === 1 ? "🏆 Leder ligan" : `${behindLeader} p efter ledaren`}
          </div>
        </div>
      </div>

      {/* key numbers */}
      <div className="pl-stats">
        <StatChip label="Matchpoäng" value={p.points} />
        <StatChip label="Bonuspoäng" value={p.bonusPts} />
        <StatChip label="Träffsäkerhet" value={`${hitRate}%`} accent="var(--cool-2)" />
      </div>

      {/* accuracy breakdown */}
      {graded > 0 && (
        <div className="card card-pad" style={{ marginTop: 12 }}>
          <div className="pl-sec">
            <div className="kicker">Träffbild</div>
            {hitRank && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span className="pl-hrank" style={{ background: hrMedal, color: hrFg }}>#{hitRank.rank}</span>
                <span className="dim" style={{ fontSize: 10.5, fontWeight: 800 }}>av {hitRank.of} i träffsäkerhet</span>
              </span>
            )}
          </div>
          <div className="pl-accbar">
            {p.exact > 0 && <div style={{ width: `${(p.exact / graded) * 100}%`, background: "var(--gold)" }} />}
            {p.correct > 0 && <div style={{ width: `${(p.correct / graded) * 100}%`, background: "var(--win)" }} />}
            {p.other > 0 && <div style={{ width: `${(p.other / graded) * 100}%`, background: "var(--surface-3)" }} />}
          </div>
          <div className="pl-legend">
            <Leg color="var(--gold)" label="Exakt" n={p.exact} />
            <Leg color="var(--win)" label="Rätt utgång" n={p.correct} />
            <Leg color="var(--surface-3)" label="Tröstpoäng" n={p.other} />
          </div>
        </div>
      )}

      {/* form strip */}
      {form.length > 0 && (
        <div className="card card-pad" style={{ marginTop: 12 }}>
          <div className="pl-sec">
            <div className="kicker">Form · senaste {form.length}</div>
            <span className="dim" style={{ fontSize: 10.5 }}>äldst → senast</span>
          </div>
          <div className="pl-form">
            {form.map(({ m, pts }) => (
              <button
                key={m.id}
                onClick={() => m._realId && openMatch(m.id)}
                className="pl-fdot"
                style={{ background: ptsBg(pts), color: ptsFg(pts) }}
                title={`${ds.teams[m.home!]?.name || "?"} ${m.ga}–${m.gb} ${ds.teams[m.away!]?.name || "?"} · tippade ${p.tips[m.id]![0]}–${p.tips[m.id]![1]} · ${pts}p`}
              >
                {pts}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* live now — current results of matches being played + this player's tip */}
      {live.length > 0 && (
        <div className="card card-pad" style={{ marginTop: 12, border: "1px solid color-mix(in srgb, var(--hot) 30%, var(--line-2))", background: "color-mix(in srgb, var(--hot) 5%, var(--surface))" }}>
          <div className="kicker" style={{ marginBottom: 10, display: "inline-flex", alignItems: "center", gap: 8, color: "var(--hot-2)" }}>
            <span className="live-dot" style={{ background: "var(--hot)" }} />Pågår nu
          </div>
          <div style={{ display: "grid", gap: 7 }}>
            {live.map((m) => {
              const tip = p.tips[m.id];
              const home = m.home ? ds.teams[m.home] : null;
              const away = m.away ? ds.teams[m.away] : null;
              const res = tip && m.ga != null && m.gb != null ? classifyTip(tip, m.ga, m.gb).result : null;
              const tipCol = res === "exact" ? "var(--gold)" : res === "outcome" ? "var(--win)" : res === "floor" ? "var(--ink-3)" : "var(--ink-2)";
              return (
                <button key={m.id} onClick={() => m._realId && openMatch(m.id)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 9px", borderRadius: 9, background: "var(--surface)", width: "100%", textAlign: "left", minWidth: 0 }}>
                  <span className="live-pill" style={{ flex: "0 0 auto", fontSize: 8.5, padding: "2px 6px" }}><span className="live-dot" style={{ width: 5, height: 5 }} />{liveMinuteText(m, updatedAt, now)}</span>
                  <Flag iso={home?.iso} code={m.home} size={15} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{home?.name || "?"}</span>
                  <span className="num" style={{ flex: "0 0 auto", fontSize: 15, fontWeight: 800, color: "var(--hot)" }}>{m.ga ?? 0}–{m.gb ?? 0}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{away?.name || "?"}</span>
                  <Flag iso={away?.iso} code={m.away} size={15} />
                  <span className="num" title="tips" style={{ flex: "0 0 auto", width: 46, textAlign: "right", fontSize: 11.5, fontWeight: 800, color: tipCol }}>{tip ? `${tip[0]}–${tip[1]}` : "–"}</span>
                </button>
              );
            })}
          </div>
          <div className="dim" style={{ fontSize: 10, marginTop: 8 }}>Live-resultat · {p.name}s tips till höger (guld = exakt, grön = rätt utgång just nu).</div>
        </div>
      )}

      {/* bonus picks */}
      <div className="card card-pad" style={{ marginTop: 12 }}>
        <div className="kicker" style={{ marginBottom: 10 }}>Bonustips</div>
        <div className="pl-bonus">
          {(Object.keys(BONUS_LABEL) as BonusSlot[]).map((k) => {
            const v = p.bonus[k];
            const isTeam = k === "winner" || k === "silver" || k === "bronze";
            const teamCode = isTeam ? (v as string | null) : null;
            const t = teamCode ? ds.teams[teamCode] : null;
            const text = isTeam ? t?.name || "—" : Array.isArray(v) ? fixName(v[0]) : "—";
            const actual = ds.bonusActual?.[mapKey(k)];
            const correct = actual && isTeam ? actual === t?.name || ds.teams[teamCode!]?.name === actual : actual && !isTeam && text !== "—" ? actual.toLowerCase().includes(text.toLowerCase()) : false;
            const playerName = !isTeam && text !== "—" ? text : null;
            const clickable = !!teamCode || !!playerName;
            const open = () => { if (teamCode) openTeam(teamCode); else if (playerName) openFbPlayer(playerName); };
            return (
              <button key={k} onClick={clickable ? open : undefined} disabled={!clickable}
                className="pl-bcard" style={{ borderColor: correct ? "color-mix(in srgb, var(--win) 45%, transparent)" : undefined }}>
                <div className="kicker" style={{ fontSize: 9.5 }}>{BONUS_LABEL[k]}</div>
                <div className="pl-brow">
                  {t && <Flag iso={t.iso} code={teamCode} size={16} />}
                  <span className="pl-bval" style={{ color: clickable ? "var(--cool-2)" : "var(--ink-3)" }}>{text}</span>
                  {correct && <span className="chip solid" style={{ background: "var(--win)", color: "#0a0712", fontSize: 8.5, padding: "1px 5px", flex: "0 0 auto" }}>RÄTT</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* match tips */}
      {tipped.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="pl-sec" style={{ marginBottom: 9 }}>
            <div className="kicker">Matchtips</div>
            <span className="dim" style={{ fontSize: 10.5, fontWeight: 800 }}>{tipped.length} tips</span>
          </div>
          <div className="mt-legend">
            <span><b style={{ color: "var(--gold)" }}>✓ Exakt</b> 5p</span>
            <span><b style={{ color: "var(--win)" }}>✓ Rätt utgång</b> 2p</span>
            <span><b style={{ color: "var(--loss)" }}>✗ Fel</b> 1p</span>
          </div>
          <div className="mt-list">
            {tipped.map((m) => {
              const tip = p.tips[m.id]!;
              const home = m.home ? ds.teams[m.home] : null;
              const away = m.away ? ds.teams[m.away] : null;
              const played = m.status === "played" && m.ga != null && m.gb != null;
              const liveM = isLive(m);
              const pts = played ? classifyTip(tip, m.ga!, m.gb!).points : null;
              const openThis = () => m._realId && openMatch(m.id);
              const isNext = m.id === nextId;
              const state = played ? (pts === 5 ? "exact" : pts === 2 ? "win" : "floor") : liveM ? "live" : "up";
              return (
                <div key={m.id} ref={isNext ? nextRef : undefined} className={`mt-row mt-${state}${isNext ? " mt-next" : ""}`}>
                  {isNext && <span className="mt-nextbadge">NÄSTA</span>}
                  <button className="mt-date" onClick={openThis}>{svDayMonth(m.kickoff)}</button>
                  <button className="mt-team mt-home" onClick={() => m.home && openTeam(m.home)} disabled={!m.home}>
                    <span className="mt-name">{home?.name || m.fromA || "?"}</span>
                    <Flag iso={home?.iso} code={m.home} size={14} />
                  </button>
                  <button className="mt-score" onClick={openThis}>
                    <span className="mt-sline"><span className="mt-slab">DU</span><span className="mt-tip">{tip[0]}–{tip[1]}</span></span>
                    {played ? (
                      <span className="mt-sline"><span className="mt-slab">FACIT</span><span className="mt-facit">{m.ga}–{m.gb}</span></span>
                    ) : liveM ? (
                      <span className="mt-sline"><span className="mt-slab mt-livew">NU</span><span className="mt-facit mt-livew">{m.ga ?? 0}–{m.gb ?? 0}</span></span>
                    ) : (
                      <span className="mt-sline"><span className="mt-slab">·</span><span className="mt-when">kommande</span></span>
                    )}
                  </button>
                  <button className="mt-team mt-away" onClick={() => m.away && openTeam(m.away)} disabled={!m.away}>
                    <Flag iso={away?.iso} code={m.away} size={14} />
                    <span className="mt-name">{away?.name || m.fromB || "?"}</span>
                  </button>
                  {played && <span className="mt-res">{pts! >= 2 ? "✓" : "✗"}</span>}
                  {pts != null ? (
                    <span className="mt-pts" style={{ background: ptsBg(pts), color: ptsFg(pts) }}>{pts}</span>
                  ) : (
                    <span className="mt-pts mt-pts-empty" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <style>{`
        .pl-hero{ display:flex; align-items:center; gap:13px; padding:15px 16px; border-radius:var(--r-lg); border:1px solid var(--line-2); }
        .pl-id{ flex:1; min-width:0; }
        .pl-name{ font-size:24px; line-height:1.04; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .pl-rankrow{ display:flex; align-items:center; gap:8px; margin-top:7px; }
        .pl-medal{ font-weight:900; font-size:12.5px; padding:2px 9px; border-radius:var(--r-pill); letter-spacing:.02em; }
        .pl-rankof{ font-size:11.5px; font-weight:700; }
        .pl-total{ flex:0 0 auto; text-align:right; }
        .pl-total-n{ font-size:30px; font-weight:900; font-variant-numeric:tabular-nums; line-height:1; }
        .pl-total-p{ font-size:14px; font-weight:800; color:var(--ink-3); margin-left:2px; }
        .pl-gap{ font-size:10px; font-weight:800; margin-top:3px; white-space:nowrap; }
        .pl-stats{ display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-top:12px; }
        .pl-stat{ background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:11px 6px; text-align:center; }
        .pl-stat .v{ font-size:21px; font-weight:900; font-variant-numeric:tabular-nums; }
        .pl-stat .k{ font-size:9px; margin-top:2px; }
        .pl-sec{ display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
        .pl-accbar{ display:flex; height:12px; border-radius:7px; overflow:hidden; background:var(--surface-3); }
        .pl-accbar > div{ transition:width .4s ease; }
        .pl-legend{ display:flex; gap:16px; margin-top:11px; flex-wrap:wrap; }
        .pl-leg{ display:flex; align-items:center; gap:6px; font-size:11.5px; font-weight:700; }
        .pl-leg .d{ width:9px; height:9px; border-radius:3px; }
        .pl-leg .n{ font-variant-numeric:tabular-nums; color:var(--ink); } .pl-leg .l{ color:var(--ink-3); }
        .pl-form{ display:flex; gap:6px; flex-wrap:wrap; }
        .pl-fdot{ width:30px; height:30px; border-radius:8px; font-weight:900; font-size:12.5px; display:grid; place-items:center; font-variant-numeric:tabular-nums; transition:transform .12s; }
        .pl-fdot:active{ transform:scale(.9); }
        .pl-bonus{ display:grid; grid-template-columns:1fr 1fr; gap:7px; }
        .pl-bcard{ background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:8px 10px; text-align:left; min-width:0; }
        .pl-brow{ display:flex; align-items:center; gap:7px; margin-top:4px; }
        .pl-bval{ flex:1; min-width:0; font-weight:800; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        @media(max-width:380px){ .pl-bonus{ grid-template-columns:1fr; } }
        .pl-hrank{ font-weight:900; font-size:11.5px; padding:2px 8px; border-radius:var(--r-pill); letter-spacing:.02em; font-variant-numeric:tabular-nums; }

        /* match tips — every track is tight + min-width:0 so the row can never exceed
           the sheet width on a narrow phone (names ellipsis instead of pushing wide). */
        .mt-legend{ display:flex; gap:14px; flex-wrap:wrap; font-size:10.5px; font-weight:700; color:var(--ink-3); margin-bottom:10px; }
        .mt-legend b{ font-weight:900; }
        .mt-list{ display:grid; gap:6px; }
        .mt-row{ box-sizing:border-box; max-width:100%; overflow:hidden; position:relative; display:flex; align-items:center; gap:6px;
          padding:7px 8px; border-radius:var(--r-md); background:var(--surface); border:1px solid var(--line);
          border-left:3px solid transparent; transition:border-color .15s; }
        .mt-row.mt-exact{ border-left-color:var(--gold); background:color-mix(in srgb, var(--gold) 11%, var(--surface)); }
        .mt-row.mt-win{ border-left-color:var(--win); background:color-mix(in srgb, var(--win) 9%, var(--surface)); }
        .mt-row.mt-floor{ border-left-color:var(--loss); background:color-mix(in srgb, var(--loss) 8%, var(--surface)); }
        .mt-exact .mt-facit{ color:var(--gold); } .mt-win .mt-facit{ color:var(--win); } .mt-floor .mt-facit{ color:var(--loss); }
        .mt-res{ flex:0 0 auto; font-size:11px; font-weight:900; }
        .mt-exact .mt-res{ color:var(--gold); } .mt-win .mt-res{ color:var(--win); } .mt-floor .mt-res{ color:var(--loss); }
        .mt-row.mt-live{ border-left-color:var(--hot); background:color-mix(in srgb, var(--hot) 6%, var(--surface)); }
        .mt-row.mt-next{ border:1.5px solid var(--cool); border-left:3px solid var(--cool); background:color-mix(in srgb, var(--cool) 11%, var(--surface)); margin-top:5px; }
        .mt-date{ flex:0 0 auto; width:30px; padding:0; text-align:left; font-size:9.5px; font-weight:800; line-height:1.15; color:var(--ink-3); }
        .mt-team{ flex:1 1 0; min-width:0; display:flex; align-items:center; gap:5px; padding:0; }
        .mt-home{ justify-content:flex-end; }
        .mt-name{ min-width:0; font-size:11.5px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:var(--cool-2); }
        .mt-home .mt-name{ text-align:right; }
        .mt-team:disabled .mt-name{ color:var(--ink-2); }
        .mt-score{ flex:0 0 auto; width:62px; display:flex; flex-direction:column; align-items:stretch; gap:1px; padding:0; }
        .mt-sline{ display:flex; align-items:baseline; justify-content:flex-end; gap:4px; min-width:0; }
        .mt-slab{ flex:0 0 auto; font-size:6.5px; font-weight:900; letter-spacing:.04em; color:var(--ink-3); }
        .mt-tip{ font-size:13px; font-weight:900; line-height:1.15; font-variant-numeric:tabular-nums; color:var(--ink); }
        .mt-facit{ font-size:11px; font-weight:900; color:var(--ink-2); font-variant-numeric:tabular-nums; line-height:1.1; }
        .mt-when{ font-size:8px; font-weight:900; letter-spacing:.04em; text-transform:uppercase; color:var(--ink-3); }
        .mt-livew{ color:var(--hot); }
        .mt-pts{ flex:0 0 auto; width:20px; height:20px; border-radius:6px; display:grid; place-items:center;
          font-size:11px; font-weight:900; font-variant-numeric:tabular-nums; }
        .mt-pts-empty{ background:transparent; }
        .mt-nextbadge{ position:absolute; top:-7px; left:9px; font-size:8px; font-weight:900; letter-spacing:.05em;
          padding:1px 7px; border-radius:var(--r-pill); background:var(--cool); color:#0a0712; }
      `}</style>
    </Sheet>
  );
}

function StatChip({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div className="pl-stat">
      <div className="v" style={{ color: accent || "var(--ink)" }}>{value}</div>
      <div className="kicker k">{label}</div>
    </div>
  );
}

function Leg({ color, label, n }: { color: string; label: string; n: number }) {
  return (
    <div className="pl-leg">
      <span className="d" style={{ background: color }} />
      <span className="n">{n}</span>
      <span className="l">{label}</span>
    </div>
  );
}

function mapKey(k: BonusSlot): "winner" | "silver" | "bronze" | "top_scorer" | "best_player" | "best_young" | "best_keeper" {
  const map: Record<BonusSlot, "winner" | "silver" | "bronze" | "top_scorer" | "best_player" | "best_young" | "best_keeper"> = {
    winner: "winner", silver: "silver", bronze: "bronze",
    topscorer: "top_scorer", bestplayer: "best_player", youngplayer: "best_young", keeper: "best_keeper",
  };
  return map[k];
}
