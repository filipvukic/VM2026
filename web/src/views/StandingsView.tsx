import { useMemo } from "react";
import { useData } from "../state/dataset";
import { useSheets } from "../state/sheets";
import { Avatar } from "../components/Avatar";
import { MatchCard } from "../components/MatchCard";
import { Flag } from "../lib/flags";
import { computeMovement } from "../features/insights/movement";
import { isLive } from "../lib/liveState";
import { PRIZES } from "../data/static/names";
import { kr, svTime, svDateKey, svDayLabel } from "../lib/format";
import { asset } from "../lib/assets";

const MEDAL = ["var(--gold)", "#cfd6e6", "#e8965a"];

function Delta({ d }: { d: number }) {
  if (!d) return <span className="dim" style={{ fontSize: 10, fontWeight: 800 }}>—</span>;
  const up = d > 0;
  return (
    <span className="num" style={{ fontSize: 11, fontWeight: 800, color: up ? "var(--win)" : "var(--loss)" }}>
      {up ? "▲" : "▼"}{Math.abs(d)}
    </span>
  );
}

export function StandingsView() {
  const ds = useData();
  const openPlayer = useSheets((s) => s.openPlayer);
  const openMatch = useSheets((s) => s.openMatch);

  const st = ds.standings;
  const maxTotal = Math.max(1, ...st.map((p) => p.total));
  const top3 = st.slice(0, 3);
  const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean);

  const move = useMemo(() => computeMovement(ds), [ds]);

  const live = ds.allMatches.filter(isLive);
  const upcoming = ds.allMatches.filter((m) => m.status === "upcoming").sort((a, b) => +a.kickoff - +b.kickoff);
  const next = upcoming[0] || null;
  // Matches strip for the home: live + today, else the next few upcoming.
  const todayKey = svDateKey(ds.now);
  const todayMatches = ds.allMatches
    .filter((m) => svDateKey(m.kickoff) === todayKey)
    .sort((a, b) => +a.kickoff - +b.kickoff);
  const homeMatches = (todayMatches.length ? todayMatches : upcoming.slice(0, 4));
  const homeMatchesTitle = todayMatches.length ? (live.length ? "Live & idag" : "Idag") : "Kommande matcher";
  const climber = [...st].sort((a, b) => move[b.id].deltaRank - move[a.id].deltaRank)[0];
  const hasMovement = st.some((p) => move[p.id].pointsToday > 0);

  return (
    <div className="view container">
      {/* HERO */}
      <div className="hero">
        <div className="hero-shine" />
        <img className="hero-logo" src={asset("images/wc2026-logo.svg")} alt="" aria-hidden />
        <div className="hero-inner">
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="hero-host">
              <Flag iso="us" size={15} /><Flag iso="mx" size={15} /><Flag iso="ca" size={15} />
              <span className="kicker" style={{ fontSize: 10 }}>USA · Mexiko · Kanada 2026</span>
            </div>
            <h1 className="hero-title">Tippnings<span className="accent">ligan</span></h1>
            <div className="hero-stats">
              <span><b className="num">{kr(ds.pot.total)}</b> pott</span>
              <span><b className="num">{st.length}</b> spelare</span>
              <span><b className="num">{ds.allMatches.filter((m) => m.status === "played").length}</b>/{ds.allMatches.length} spelade</span>
            </div>
          </div>
          {(live[0] || next) && (
            <button className="hero-match" onClick={() => openMatch((live[0] || next)!.id)}>
              <div className="kicker" style={{ fontSize: 9, color: live[0] ? "var(--hot-2)" : "var(--ink-3)" }}>
                {live[0] ? "● PÅGÅR NU" : `NÄSTA · ${svTime((next as any).kickoff)}`}
              </div>
              <MiniScore m={(live[0] || next)!} ds={ds} />
            </button>
          )}
        </div>
      </div>

      {/* podium */}
      {podiumOrder.length === 3 && (
        <div className="podium">
          {podiumOrder.map((p) => {
            const pos = p.rank;
            const h = pos === 1 ? 116 : pos === 2 ? 86 : 70;
            const m = move[p.id];
            return (
              <button key={p.id} className="podium-col" onClick={() => openPlayer(p.id)}>
                {pos === 1 && <div className="crown">♛</div>}
                <Avatar name={p.name} photo={p.photo} color={p.color} size={pos === 1 ? 64 : 50} ring={MEDAL[pos - 1]} />
                <div style={{ fontWeight: 800, marginTop: 8, fontSize: 14 }}>{p.name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span className="num" style={{ fontSize: 22, color: MEDAL[pos - 1] }}>{p.total}</span>
                  {m.pointsToday > 0 && <span className="num" style={{ fontSize: 10, color: "var(--win)" }}>+{m.pointsToday}</span>}
                </div>
                <div className="podium-step" style={{ height: h, background: `linear-gradient(180deg, color-mix(in srgb, ${MEDAL[pos - 1]} 36%, var(--surface-2)), var(--surface))` }}>
                  <div className="num" style={{ fontSize: 32, color: MEDAL[pos - 1] }}>{pos}</div>
                  <div className="chip" style={{ marginTop: 4 }}>{kr(PRIZES[pos - 1] || 0)}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* today's climber callout */}
      {hasMovement && climber && move[climber.id].deltaRank > 0 && (
        <button className="climber" onClick={() => openPlayer(climber.id)}>
          <span style={{ fontSize: 18 }}>🚀</span>
          <Avatar name={climber.name} photo={climber.photo} color={climber.color} size={28} />
          <span style={{ fontWeight: 800 }}>{climber.name}</span>
          <span className="dim" style={{ fontSize: 12.5 }}>dagens klättrare</span>
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <Delta d={move[climber.id].deltaRank} />
            <span className="num" style={{ color: "var(--win)" }}>+{move[climber.id].pointsToday}p idag</span>
          </span>
        </button>
      )}

      {/* live & today / upcoming matches strip */}
      {homeMatches.length > 0 && (
        <>
          <div className="section-head" style={{ margin: "22px 0 10px" }}>
            <div className="section-title" style={{ fontSize: 18 }}>{homeMatchesTitle}</div>
            {!todayMatches.length && next && <span className="chip">{svDayLabel(next.kickoff, ds.now)}</span>}
          </div>
          <div className="home-matches">
            {homeMatches.map((m) => (
              <MatchCard key={m.id} match={m} onOpen={() => openMatch(m.id)} compact />
            ))}
          </div>
        </>
      )}

      {/* full table */}
      <div className="section-head">
        <div className="section-title">Tabell</div>
        <div className="kicker">{hasMovement ? "▲▼ = rörelse idag" : "poäng · exakta som tie-break"}</div>
      </div>
      <div className="card" style={{ overflow: "hidden" }}>
        {st.map((p, i) => {
          const m = move[p.id];
          return (
            <button
              key={p.id}
              onClick={() => openPlayer(p.id)}
              className="lb-row"
              style={{ borderBottom: i < st.length - 1 ? "1px solid var(--line)" : "none" }}
            >
              <div className="lb-rank num" style={{ color: p.rank <= 3 ? MEDAL[p.rank - 1] : "var(--ink-3)" }}>{p.rank}</div>
              {hasMovement && <div style={{ width: 26, textAlign: "center" }}><Delta d={m.deltaRank} /></div>}
              <Avatar name={p.name} photo={p.photo} color={p.color} size={36} ring={p.rank <= 3 ? MEDAL[p.rank - 1] : null} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ fontWeight: 800, fontSize: 15 }}>{p.name}</span>
                  {m.pointsToday > 0 && <span className="num" style={{ fontSize: 10.5, color: "var(--win)" }}>+{m.pointsToday} idag</span>}
                </div>
                <div className="bar" style={{ marginTop: 6 }}>
                  <div className="bar-fill" style={{ width: `${(p.total / maxTotal) * 100}%`, background: "var(--grad-soft)" }} />
                </div>
              </div>
              <div style={{ textAlign: "right", minWidth: 60 }}>
                <div className="num" style={{ fontSize: 20 }}>{p.total}</div>
                <div className="dim" style={{ fontSize: 10.5, fontWeight: 700 }}>{p.exact} exakta{p.bonusPts ? ` · ${p.bonusPts}b` : ""}</div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="dim" style={{ textAlign: "center", fontSize: 11.5, margin: "16px 0 4px" }}>
        Uppdaterad {ds.updatedAt ? svTime(new Date(ds.updatedAt)) : "—"} · potten fördelas 50/30/20
      </div>

      <style>{`
        .hero{ position:relative; overflow:hidden; border-radius:var(--r-xl); border:1px solid var(--line-2);
          background:linear-gradient(120deg, #2a1148, #3a0f33 55%, #2a1148);
          box-shadow:var(--shadow); margin-bottom:18px; }
        .hero::before{ content:""; position:absolute; inset:0; background:
          radial-gradient(80% 120% at 85% -10%, rgba(255,45,110,.5), transparent 60%),
          radial-gradient(70% 120% at 10% 110%, rgba(122,43,255,.45), transparent 60%); }
        .hero-shine{ position:absolute; top:0; bottom:0; width:40%; left:-60%;
          background:linear-gradient(100deg, transparent, rgba(255,255,255,.13), transparent);
          animation:heroShine 6s ease-in-out infinite; }
        @keyframes heroShine{ 0%{ left:-60%; } 55%,100%{ left:130%; } }
        .hero-logo{ position:absolute; right:-26px; top:50%; transform:translateY(-50%) rotate(-8deg);
          width:230px; height:230px; opacity:.10; pointer-events:none; filter:drop-shadow(0 0 30px rgba(255,255,255,.3)); }
        .hero-inner{ position:relative; display:flex; gap:18px; flex-wrap:wrap; align-items:center; padding:22px; }
        .hero-host{ display:flex; align-items:center; gap:6px; }
        .hero-title{ font-family:var(--font-hero); font-size:clamp(34px,9vw,60px); line-height:.92; letter-spacing:.01em; margin:8px 0 12px; text-transform:uppercase; }
        .hero-title .accent{ background:var(--grad); -webkit-background-clip:text; background-clip:text; color:transparent; }
        .hero-stats{ display:flex; gap:18px; flex-wrap:wrap; font-size:12.5px; color:var(--ink-2); }
        .hero-stats b{ color:var(--ink); font-size:16px; margin-right:4px; }
        .hero-match{ background:rgba(0,0,0,.28); border:1px solid var(--line-2); border-radius:var(--r-lg); padding:12px 16px; min-width:200px; text-align:left; }
        .home-matches{ display:grid; gap:9px; grid-template-columns:minmax(0,1fr); }
        @media(min-width:560px){ .home-matches{ grid-template-columns:minmax(0,1fr) minmax(0,1fr); } }
        @media(min-width:920px){ .home-matches{ grid-template-columns:repeat(3,minmax(0,1fr)); } }
        .podium{ display:flex; align-items:flex-end; justify-content:center; gap:10px; margin:20px 0 8px; }
        .podium-col{ display:flex; flex-direction:column; align-items:center; flex:1; max-width:160px; position:relative; }
        .crown{ position:absolute; top:-18px; font-size:20px; color:var(--gold); filter:drop-shadow(0 2px 6px rgba(255,203,69,.6)); }
        .podium-step{ width:100%; border-radius:var(--r-md) var(--r-md) 0 0; border:1px solid var(--line-2); border-bottom:none; margin-top:10px; display:flex; flex-direction:column; align-items:center; padding-top:12px; gap:2px; }
        .climber{ width:100%; display:flex; align-items:center; gap:10px; padding:11px 14px; margin:14px 0 0; border-radius:var(--r-md);
          background:color-mix(in srgb, var(--win) 12%, var(--surface)); border:1px solid color-mix(in srgb,var(--win) 30%, transparent); }
        .lb-row{ width:100%; display:flex; align-items:center; gap:11px; padding:11px 14px; text-align:left; transition:background .15s; }
        .lb-row:hover{ background:var(--surface-2); }
        .lb-rank{ width:24px; text-align:center; font-size:18px; }
        .bar{ height:7px; border-radius:999px; background:var(--surface-3); overflow:hidden; }
        .bar-fill{ height:100%; border-radius:999px; transform-origin:left; animation:barGrow .7s cubic-bezier(.2,.7,.2,1); }
      `}</style>
    </div>
  );
}

function MiniScore({ m, ds }: { m: any; ds: ReturnType<typeof useData> }) {
  const home = m.home ? ds.teams[m.home] : null;
  const away = m.away ? ds.teams[m.away] : null;
  const played = m.status === "played" || m.status === "live";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
      <Flag iso={home?.iso} code={m.home} size={20} />
      <span className="num" style={{ fontSize: 18 }}>{played ? `${m.ga ?? 0}–${m.gb ?? 0}` : "vs"}</span>
      <Flag iso={away?.iso} code={m.away} size={20} />
      <span style={{ fontSize: 12, fontWeight: 700, marginLeft: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 110 }}>
        {(home?.name || m.fromA || "TBD").slice(0, 12)} – {(away?.name || m.fromB || "TBD").slice(0, 12)}
      </span>
    </div>
  );
}
