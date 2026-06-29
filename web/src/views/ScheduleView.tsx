import { useEffect, useMemo, useRef, useState } from "react";
import { useData } from "../state/dataset";
import { useSheets } from "../state/sheets";
import { useScheduleUI, type SchedFilter } from "../state/scheduleUi";
import { useKoBets } from "../state/koBets";
import { MatchCard } from "../components/MatchCard";
import { Flag } from "../lib/flags";
import { svDayLabel, svDateKey, svDayMonth } from "../lib/format";
import { isLive, isEnded } from "../lib/liveState";
import { broadcastForPair } from "../data/static/broadcasts";
import type { Dataset, Match } from "../data/types";

type Filter = SchedFilter;

export function ScheduleView() {
  const ds = useData();
  const mode = useScheduleUI((s) => s.mode);
  const setMode = useScheduleUI((s) => s.setMode);

  return (
    <div className="view container">
      <div className="section-head" style={{ marginTop: 6 }}>
        <div className="section-title">Matcher</div>
        <div className="seg">
          <button className={mode === "list" ? "on" : ""} onClick={() => setMode("list")}>Schema</button>
          <button className={mode === "bracket" ? "on" : ""} onClick={() => setMode("bracket")}>Slutspel</button>
        </div>
      </div>

      {mode === "list" ? <ScheduleList ds={ds} /> : <Bracket ds={ds} />}

      <style>{`
        .seg{ display:inline-flex; background:var(--surface); border:1px solid var(--line-2); border-radius:var(--r-pill); padding:3px; gap:2px; }
        .seg button{ padding:6px 14px; border-radius:var(--r-pill); font-weight:800; font-size:12.5px; color:var(--ink-3); }
        .seg button.on{ background:var(--grad-soft); color:#fff; }
      `}</style>
    </div>
  );
}

function ScheduleList({ ds }: { ds: Dataset }) {
  const openMatch = useSheets((s) => s.openMatch);
  const filter = useScheduleUI((s) => s.filter);
  const setFilter = useScheduleUI((s) => s.setFilter);
  const nextRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    let list = ds.allMatches.slice().sort((a, b) => +a.kickoff - +b.kickoff);
    if (filter === "live") list = list.filter(isLive);
    else if (filter === "upcoming") list = list.filter((m) => m.status === "upcoming");
    else if (filter === "played") list = list.filter(isEnded);
    return list;
  }, [ds, filter]);

  // Day key of the "next" match (a live one, else the first upcoming) so opening
  // the tab jumps straight there instead of starting at the long played list.
  const nextKey = useMemo(() => {
    const target = ds.allMatches.filter(isLive).sort((a, b) => +a.kickoff - +b.kickoff)[0]
      || ds.allMatches.filter((m) => m.status === "upcoming").sort((a, b) => +a.kickoff - +b.kickoff)[0];
    return target ? svDateKey(target.kickoff) : null;
  }, [ds]);

  // Scroll to it once when the tab opens (smooth). Only when the unfiltered list
  // is shown (the default), so it doesn't fight an explicit filter choice.
  useEffect(() => {
    if (filter === "all" && nextRef.current) {
      nextRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // group by day
  const byDay = useMemo(() => {
    const map = new Map<string, Match[]>();
    filtered.forEach((m) => {
      const k = svDateKey(m.kickoff);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(m);
    });
    return [...map.entries()];
  }, [filtered]);

  const counts = useMemo(
    () => ({
      all: ds.allMatches.length,
      live: ds.allMatches.filter(isLive).length,
      upcoming: ds.allMatches.filter((m) => m.status === "upcoming").length,
      played: ds.allMatches.filter(isEnded).length,
    }),
    [ds]
  );

  const F: { k: Filter; label: string }[] = [
    { k: "all", label: `Alla ${counts.all}` },
    { k: "live", label: `Live ${counts.live}` },
    { k: "upcoming", label: `Kommande ${counts.upcoming}` },
    { k: "played", label: `Spelade ${counts.played}` },
  ];

  return (
    <>
      <div className="filter-row">
        {F.map((f) => (
          <button
            key={f.k}
            className={`fchip ${filter === f.k ? "on" : ""} ${f.k === "live" && counts.live ? "live" : ""}`}
            onClick={() => setFilter(f.k)}
            disabled={f.k === "live" && !counts.live}
          >
            {f.k === "live" && counts.live > 0 && <span className="live-dot" style={{ background: "var(--hot)" }} />}
            {f.label}
          </button>
        ))}
      </div>

      {byDay.length === 0 && <div className="dim" style={{ textAlign: "center", padding: 40 }}>Inga matcher.</div>}

      {byDay.map(([key, ms]) => (
        <div
          key={key}
          ref={key === nextKey ? nextRef : undefined}
          style={{ marginBottom: 22, scrollMarginTop: "calc(var(--header-h) + 64px)" }}
        >
          <div className="day-head">
            <span>{svDayLabel(ms[0].kickoff, ds.now)}</span>
            <span className="dim" style={{ fontWeight: 700 }}>{ms.length} matcher</span>
          </div>
          <div className="day-grid">
            {ms.map((m) => (
              <MatchCard key={m.id} match={m} onOpen={() => openMatch(m.id)} />
            ))}
          </div>
        </div>
      ))}

      <style>{`
        .filter-row{ display:flex; gap:8px; flex-wrap:wrap; margin-bottom:18px; position:sticky; top:calc(var(--header-h) + 52px); z-index:5; padding:4px 0; }
        @media(max-width:919px){ .filter-row{ top:0; position:relative; } }
        .fchip{ display:inline-flex; align-items:center; gap:6px; padding:7px 13px; border-radius:var(--r-pill); border:1px solid var(--line-2); background:var(--surface); color:var(--ink-2); font-weight:800; font-size:12.5px; }
        .fchip.on{ background:var(--ink); color:var(--bg); border-color:transparent; }
        .fchip.live.on{ background:var(--hot); color:#fff; }
        .fchip:disabled{ opacity:.4; }
        .day-head{ display:flex; align-items:baseline; justify-content:space-between; margin:0 2px 9px; font-family:var(--font-display); text-transform:uppercase; letter-spacing:.04em; font-weight:800; font-size:15px; }
        /* minmax(0,1fr) (not bare 1fr) so a long team name can't widen the column
           past the screen — names clip via ellipsis instead. */
        .day-grid{ display:grid; gap:9px; grid-template-columns:minmax(0,1fr); }
        @media(min-width:760px){ .day-grid{ grid-template-columns:minmax(0,1fr) minmax(0,1fr); } }
        @media(min-width:1100px){ .day-grid{ grid-template-columns:repeat(3,minmax(0,1fr)); } }
      `}</style>
    </>
  );
}

// ---------------- bracket ----------------
// A round selector + a vertical list of that round's matches. The old design was one
// tall, horizontally-scrolling tree — on mobile that container is taller than the
// viewport AND scrolls sideways, so a vertical drag got trapped (you couldn't scroll
// the page). A per-round list scrolls normally and reads cleanly on a phone.
function Bracket({ ds }: { ds: Dataset }) {
  const openMatch = useSheets((s) => s.openMatch);
  const ko = ds.knockout;
  const rounds = [
    { key: "r32", tab: "16-del", title: "Sextondelsfinal", ms: ko.r32 },
    { key: "r16", tab: "8-del", title: "Åttondelsfinal", ms: ko.r16 },
    { key: "qf", tab: "Kvart", title: "Kvartsfinal", ms: ko.qf },
    { key: "sf", tab: "Semi", title: "Semifinal", ms: ko.sf },
    { key: "final", tab: "Final", title: "Final", ms: ko.final },
    { key: "third", tab: "Brons", title: "Match om tredjepris", ms: ko.third },
  ].filter((r) => r.ms && r.ms.length);
  const [round, setRound] = useState<string>("r32");
  const active = rounds.find((r) => r.key === round) || rounds[0];
  const koName = useKoBets((s) => s.name);
  const openBet = useKoBets((s) => s.setSheet);

  return (
    <div>
      <button className="bk-cta" onClick={() => openBet(true)}>
        <span className="bk-cta-ic">✏️</span>
        <span className="bk-cta-txt">
          <b>Slutspelstips</b>
          <span className="dim">{koName ? `Inloggad som ${koName} · ändra dina tips` : "Logga in med din kod och tippa slutspelet"}</span>
        </span>
        <span className="bk-cta-go">›</span>
      </button>

      <div className="bk-rounds">
        {rounds.map((r) => (
          <button key={r.key} className={r.key === active.key ? "on" : ""} onClick={() => setRound(r.key)}>
            {r.tab}
          </button>
        ))}
      </div>

      <div className="section-head" style={{ margin: "4px 2px 10px" }}>
        <div className="section-title" style={{ fontSize: 18 }}>{active.title}</div>
        <div className="kicker">{active.ms.length} {active.ms.length === 1 ? "match" : "matcher"}</div>
      </div>

      <div className="bk-list">
        {active.ms.map((m) => (
          <BracketCell key={m.id} m={m} ds={ds} onOpen={() => m._realId && openMatch(m.id)} />
        ))}
      </div>

      <style>{`
        .bk-cta{ display:flex; align-items:center; gap:12px; width:100%; text-align:left; padding:12px 14px; margin-bottom:14px;
          border-radius:var(--r-lg); border:1px solid color-mix(in srgb, var(--cool) 40%, var(--line-2));
          background:linear-gradient(135deg, color-mix(in srgb, var(--cool) 16%, var(--surface)), var(--surface)); }
        .bk-cta-ic{ font-size:20px; flex:0 0 auto; }
        .bk-cta-txt{ flex:1; min-width:0; display:flex; flex-direction:column; }
        .bk-cta-txt b{ font-size:14.5px; } .bk-cta-txt .dim{ font-size:11.5px; font-weight:700; }
        .bk-cta-go{ color:var(--ink-3); font-size:20px; font-weight:700; flex:0 0 auto; }
        .bk-rounds{ display:flex; gap:3px; background:var(--surface); border:1px solid var(--line-2);
          border-radius:var(--r-pill); padding:3px; overflow-x:auto; scrollbar-width:none; }
        .bk-rounds::-webkit-scrollbar{ display:none; }
        .bk-rounds button{ flex:1 1 0; min-width:fit-content; padding:8px 10px; border-radius:var(--r-pill);
          font-weight:800; font-size:12.5px; color:var(--ink-3); white-space:nowrap; transition:color .15s; }
        .bk-rounds button.on{ background:var(--grad-soft); color:#fff; }
        .bk-list{ display:grid; gap:10px; max-width:480px; }
        .bc{ width:100%; padding:0; border-radius:var(--r-md); overflow:hidden; background:var(--surface); border:1px solid var(--line); text-align:left; transition:border-color .15s, background .15s, transform .12s; }
        .bc:not(.nolink):hover{ background:var(--surface-2); }
        .bc:not(.nolink):active{ transform:scale(.99); }
        .bc.nolink{ cursor:default; }
        .bc.live{ border-color:color-mix(in srgb, var(--hot) 45%, var(--line)); box-shadow:0 0 0 1px color-mix(in srgb, var(--hot) 18%, transparent); }
        .bc-side{ display:flex; align-items:center; gap:9px; padding:9px 12px; }
        .bc-side.win{ background:color-mix(in srgb, var(--win) 9%, transparent); }
        .bc-side.dim{ opacity:.45; }
        .bc-nm{ flex:1; min-width:0; font-weight:700; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .bc-side.win .bc-nm{ font-weight:800; }
        .bc-chk{ color:var(--win); font-size:11px; font-weight:900; flex:0 0 auto; }
        .bc-sc{ font-family:var(--font-display); font-weight:800; font-size:16px; font-variant-numeric:tabular-nums; min-width:14px; text-align:right; flex:0 0 auto; }
        .bc-div{ height:1px; background:var(--line); }
        .bc-meta{ padding:5px 12px; font-size:9px; font-weight:800; letter-spacing:.05em; text-transform:uppercase; color:var(--ink-3);
          background:color-mix(in srgb, var(--surface-3) 45%, transparent); border-top:1px solid var(--line); display:flex; align-items:center; gap:6px; }
        .bc.live .bc-meta{ color:var(--hot); }
        .bc-meta .live-dot{ width:5px; height:5px; }
      `}</style>
    </div>
  );
}

function BracketCell({ m, ds, onOpen }: { m: Match; ds: Dataset; onOpen: () => void }) {
  const played = m.status === "played" && m.ga != null && m.gb != null;
  const live = isLive(m);
  const clickable = !!m._realId;
  const Side = ({ code, proj, label, score, win }: { code: string | null; proj?: string | null; label?: string | null; score: number | null; win: boolean }) => {
    const t = code ? ds.teams[code] : null;
    const nm = t ? t.name : proj ? ds.teams[proj]?.name : null;
    return (
      <div className={`bc-side${win ? " win" : ""}${played && m.winner && !win ? " dim" : ""}`}>
        <Flag iso={t?.iso} code={code} size={17} />
        <span className="bc-nm" style={{ color: t ? undefined : "var(--ink-3)" }}>{nm || label || "Lottas"}</span>
        {win && <span className="bc-chk">✓</span>}
        {(played || live) && code && <span className="bc-sc">{score ?? 0}</span>}
      </div>
    );
  };
  const home = m.home ? ds.teams[m.home] : null, away = m.away ? ds.teams[m.away] : null;
  const bc = !played && !live ? broadcastForPair(m.home, m.away, home?.name, away?.name, m.fifa) : null;
  return (
    <button className={`bc${live ? " live" : ""}${clickable ? "" : " nolink"}`} onClick={clickable ? onOpen : undefined} disabled={!clickable}>
      <Side code={m.home} proj={m.projHome} label={m.fromA} score={m.ga} win={played && m.winner === m.home} />
      <div className="bc-div" />
      <Side code={m.away} proj={m.projAway} label={m.fromB} score={m.gb} win={played && m.winner === m.away} />
      <div className="bc-meta">
        {live ? (<><span className="live-dot" />Pågår</>) : played ? (m.pen ? "Slut · straffar" : "Slut") : (
          <>{m.kickoff ? svDayMonth(m.kickoff) : "TBD"}{bc?.broadcaster ? ` · ${bc.label}` : ""}</>
        )}
      </div>
    </button>
  );
}
