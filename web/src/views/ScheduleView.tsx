import { useEffect, useMemo, useRef, useState } from "react";
import { useData } from "../state/dataset";
import { useSheets } from "../state/sheets";
import { useScheduleUI, type SchedFilter } from "../state/scheduleUi";
import { useKoBets } from "../state/koBets";
import { MatchCard } from "../components/MatchCard";
import { BracketCircle } from "../components/BracketCircle";
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
    <div className="view container md-view">
      {mode === "list" ? <ScheduleList ds={ds} /> : <Bracket ds={ds} />}

      {/* Mode toggle floats at the bottom (above the nav) so it never sits on top of
          the schedule and pushes the day/Kommande labels around. */}
      <div className="md-seg-float">
        <div className="md-seg" data-active={mode}>
          <button className={mode === "list" ? "on" : ""} onClick={() => setMode("list")}>Spelschema</button>
          <button className={mode === "bracket" ? "on" : ""} onClick={() => setMode("bracket")}>Slutspel</button>
          <span className="md-seg-thumb" aria-hidden />
        </div>
      </div>

      <style>{`
        .md-view{ padding-bottom:72px; }
        .md-seg-float{ position:fixed; left:50%; transform:translateX(-50%); z-index:61;
          bottom:calc(var(--nav-h) + env(safe-area-inset-bottom) + 12px); width:min(420px, calc(100vw - 28px)); }
        @media(min-width:920px){ .md-seg-float{ bottom:22px; width:380px; } }
        /* frosted-glass floating segmented control with a sliding gradient thumb */
        .md-seg{ position:relative; display:grid; grid-template-columns:1fr 1fr; padding:5px; border-radius:16px;
          background:color-mix(in srgb, var(--surface-2) 78%, transparent); backdrop-filter:blur(18px) saturate(1.5);
          -webkit-backdrop-filter:blur(18px) saturate(1.5); border:1px solid var(--line-2);
          box-shadow:0 10px 34px rgba(0,0,0,.45); }
        .md-seg button{ position:relative; z-index:1; padding:12px 8px; border-radius:12px; font-weight:800; font-size:14.5px; color:var(--ink-3); transition:color .22s ease; }
        .md-seg button.on{ color:#fff; }
        .md-seg-thumb{ position:absolute; z-index:0; top:5px; left:5px; bottom:5px; width:calc(50% - 5px); border-radius:12px;
          background:var(--grad-soft); box-shadow:0 3px 12px color-mix(in srgb, var(--cool) 40%, transparent);
          transition:transform .28s cubic-bezier(.3,.85,.3,1); }
        .md-seg[data-active="bracket"] .md-seg-thumb{ transform:translateX(100%); }
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
        .filter-row{ display:flex; gap:8px; flex-wrap:wrap; margin:2px 0 18px; position:sticky; top:calc(var(--header-h) + 6px); z-index:5; padding:6px 0; background:var(--bg); }
        @media(max-width:919px){ .filter-row{ top:0; position:relative; background:transparent; } }
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
  const [view, setView] = useState<"tree" | "list">("tree");
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

      <div className="bk-view">
        <button className={view === "tree" ? "on" : ""} onClick={() => setView("tree")}>Cirkel</button>
        <button className={view === "list" ? "on" : ""} onClick={() => setView("list")}>Lista</button>
      </div>

      {view === "tree" ? (
        <>
          <BracketCircle ds={ds} onOpen={(id) => openMatch(id)} />
          <div className="bc-hint">Tryck på ett lag för att öppna matchen · mitten = mästaren 🏆</div>
        </>
      ) : (
        <>
          <div className="bk-rounds">
            {rounds.map((r) => (
              <button key={r.key} className={r.key === active.key ? "on" : ""} onClick={() => setRound(r.key)}>
                {r.tab}
              </button>
            ))}
          </div>
          <div className="section-head" style={{ margin: "20px 2px 14px" }}>
            <div className="section-title" style={{ fontSize: 18 }}>{active.title}</div>
            <div className="kicker">{active.ms.length} {active.ms.length === 1 ? "match" : "matcher"}</div>
          </div>
          <div className="bk-list">
            {active.ms.map((m) => (
              <BracketCell key={m.id} m={m} ds={ds} onOpen={() => m._realId && openMatch(m.id)} />
            ))}
          </div>
        </>
      )}

      <style>{`
        .bk-view{ display:inline-flex; gap:3px; background:var(--surface); border:1px solid var(--line-2); border-radius:var(--r-pill); padding:3px; margin-bottom:14px; }
        .bk-view button{ padding:7px 18px; border-radius:var(--r-pill); font-weight:800; font-size:12.5px; color:var(--ink-3); }
        .bk-view button.on{ background:var(--grad-soft); color:#fff; }
        .bt-scroll{ overflow-x:auto; overflow-y:hidden; padding:2px 2px 10px; scrollbar-width:thin; -webkit-overflow-scrolling:touch; }
        .bt{ display:flex; gap:0; height:560px; min-width:max-content; }
        .bt-col{ display:flex; flex-direction:column; width:90px; flex:0 0 90px; }
        .bt-col-h{ text-align:center; font-size:9px; font-weight:800; text-transform:uppercase; letter-spacing:.06em; color:var(--ink-3); height:13px; line-height:13px; margin-bottom:11px; }
        .bt-col-h.final{ color:var(--gold); font-size:10px; }
        .bt-col-body{ flex:1; display:flex; flex-direction:column; }
        .bt-slot{ flex:1 1 0; display:flex; align-items:center; min-height:0; }
        .bt-empty{ width:100%; height:40px; border:1px dashed var(--line); border-radius:9px; opacity:.5; }
        /* connector columns — spine ties each pair of feeders, stub runs to the parent.
           Geometry is in %, so it stays aligned at any height (feeders land at 25%/75%). */
        .bt-conn{ display:flex; flex-direction:column; flex:0 0 14px; }
        .bt-conn-h{ height:13px; margin-bottom:11px; }
        .bt-conn-body{ flex:1; display:flex; flex-direction:column; }
        .bt-conn-item{ flex:1 1 0; position:relative; }
        .bt-conn.pair .bt-conn-item::before{ content:''; position:absolute; top:25%; height:50%; width:2px; background:color-mix(in srgb, var(--ink-3) 38%, var(--line-2)); border-radius:1px; }
        .bt-conn.pair:not(.mir) .bt-conn-item::before{ left:0; }
        .bt-conn.pair.mir .bt-conn-item::before{ right:0; }
        .bt-conn-item::after{ content:''; position:absolute; left:0; right:0; top:calc(50% - 1px); height:2px; background:color-mix(in srgb, var(--ink-3) 38%, var(--line-2)); border-radius:1px; }
        /* ring is OUTSET (box-shadow, not border) so the winner's green fills the row
           edge-to-edge with no 1px frame showing on the sides. */
        .btc{ background:var(--surface); border-radius:9px; overflow:hidden; width:100%; text-align:left; box-shadow:0 0 0 1px var(--line); transition:box-shadow .15s; position:relative; }
        .btc:not(.nolink):active{ transform:scale(.97); }
        .btc.nolink{ cursor:default; }
        .btc.live{ box-shadow:0 0 0 1.5px color-mix(in srgb, var(--hot) 60%, var(--line)); }
        .btc.final{ box-shadow:0 0 0 1.5px var(--gold); background:color-mix(in srgb, var(--gold) 9%, var(--surface)); }
        .btc.final.live{ box-shadow:0 0 0 2px color-mix(in srgb, var(--hot) 60%, var(--gold)); }
        .btc-side{ display:flex; align-items:center; gap:5px; padding:5px 7px; }
        .btc-side.win{ background:color-mix(in srgb, var(--win) 26%, var(--surface)); }
        .btc-side.dim{ opacity:.42; }
        .btc-dot{ width:14px; height:10px; border-radius:3px; background:var(--surface-3); flex:0 0 auto; }
        .btc-code{ flex:1; min-width:0; font-size:11px; font-weight:800; letter-spacing:.02em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .btc-side.win .btc-code{ color:color-mix(in srgb, var(--win) 52%, var(--ink)); }
        .btc-sc{ font-family:var(--font-display); font-weight:800; font-size:12px; font-variant-numeric:tabular-nums; flex:0 0 auto; }
        .btc-side.win .btc-sc{ color:color-mix(in srgb, var(--win) 52%, var(--ink)); }
        .btc-div{ height:1px; background:var(--line); }
        .bt-bronze{ margin-top:18px; }
        .bt-hint{ font-size:10.5px; color:var(--ink-3); text-align:center; margin-top:10px; }
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

// --- proper two-sided bracket tree ---
// Columns by FIFA match number, left half → final → right half; each later-round match
// sits (via equal-height slots) between the two it's fed by, and a connector column
// between every pair of rounds draws the bracket spine + a stub to the parent match.
const TREE_COLS: { label: string; fifas: number[] }[] = [
  { label: "16-del", fifas: [73, 75, 74, 77, 83, 84, 81, 82] },
  { label: "8-del", fifas: [89, 90, 93, 94] },
  { label: "Kvart", fifas: [97, 98] },
  { label: "Semi", fifas: [101] },
  { label: "Final", fifas: [104] },
  { label: "Semi", fifas: [102] },
  { label: "Kvart", fifas: [99, 100] },
  { label: "8-del", fifas: [91, 92, 95, 96] },
  { label: "16-del", fifas: [76, 78, 79, 80, 86, 88, 85, 87] },
];
// One connector between each adjacent pair of columns; count = number of parent
// (centre-side) matches. "pair" = two feeders into one parent (draw the spine);
// "single" = the semi→final links (just a straight line). side = which way it points.
const TREE_CONNS: { type: "pair" | "single"; side: "L" | "R"; count: number }[] = [
  { type: "pair", side: "L", count: 4 },
  { type: "pair", side: "L", count: 2 },
  { type: "pair", side: "L", count: 1 },
  { type: "single", side: "L", count: 1 },
  { type: "single", side: "R", count: 1 },
  { type: "pair", side: "R", count: 1 },
  { type: "pair", side: "R", count: 2 },
  { type: "pair", side: "R", count: 4 },
];

function Conn({ type, side, count }: { type: "pair" | "single"; side: "L" | "R"; count: number }) {
  return (
    <div className={`bt-conn ${type}${side === "R" ? " mir" : ""}`} aria-hidden>
      <div className="bt-conn-h" />
      <div className="bt-conn-body">
        {Array.from({ length: count }).map((_, i) => <div key={i} className="bt-conn-item" />)}
      </div>
    </div>
  );
}

function BracketTree({ ds, onOpen }: { ds: Dataset; onOpen: (id: string) => void }) {
  const byFifa: Record<number, Match> = {};
  [...ds.knockout.r32, ...ds.knockout.r16, ...ds.knockout.qf, ...ds.knockout.sf, ...ds.knockout.final, ...ds.knockout.third].forEach((m) => {
    if (m.fifa != null) byFifa[m.fifa] = m;
  });
  const bronze = ds.knockout.third[0];
  const cols = TREE_COLS.flatMap((c, ci) => {
    const col = (
      <div key={`c${ci}`} className="bt-col">
        <div className={`bt-col-h${c.label === "Final" ? " final" : ""}`}>{c.label === "Final" ? "🏆 Final" : c.label}</div>
        <div className="bt-col-body">
          {c.fifas.map((f) => (
            <div key={f} className="bt-slot">
              {byFifa[f] ? <TreeCell m={byFifa[f]} ds={ds} onOpen={onOpen} final={f === 104} /> : <div className="bt-empty" />}
            </div>
          ))}
        </div>
      </div>
    );
    return ci < TREE_CONNS.length ? [col, <Conn key={`x${ci}`} {...TREE_CONNS[ci]} />] : [col];
  });
  return (
    <div>
      <div className="bt-scroll">
        <div className="bt">{cols}</div>
      </div>
      {bronze && (
        <div className="bt-bronze">
          <div className="kicker" style={{ marginBottom: 6 }}>Bronsmatch</div>
          <div style={{ maxWidth: 200 }}>
            <TreeCell m={bronze} ds={ds} onOpen={onOpen} />
          </div>
        </div>
      )}
      <div className="bt-hint">↔ dra i sidled för att se hela trädet</div>
    </div>
  );
}

function TreeCell({ m, ds, onOpen, final }: { m: Match; ds: Dataset; onOpen: (id: string) => void; final?: boolean }) {
  const played = m.status === "played" && m.ga != null && m.gb != null;
  const live = isLive(m);
  const Side = ({ code, proj, score, win }: { code: string | null; proj?: string | null; score: number | null; win: boolean }) => {
    // Use the projected (already-decided) winner's flag too, not just confirmed slots,
    // so propagated teams show their real flag instead of a "?" box.
    const realCode = code || proj || null;
    const t = realCode ? ds.teams[realCode] : null;
    return (
      <div className={`btc-side${win ? " win" : ""}${played && m.winner && !win ? " dim" : ""}`}>
        {t ? <Flag iso={t.iso} code={realCode} size={14} /> : <span className="btc-dot" aria-hidden />}
        <span className="btc-code">{realCode || ""}</span>
        {(played || live) && code && <span className="btc-sc">{score ?? 0}</span>}
      </div>
    );
  };
  return (
    <button className={`btc${live ? " live" : ""}${final ? " final" : ""}${m._realId ? "" : " nolink"}`} onClick={() => m._realId && onOpen(m.id)} disabled={!m._realId}>
      <Side code={m.home} proj={m.projHome} score={m.ga} win={played && m.winner === m.home} />
      <div className="btc-div" />
      <Side code={m.away} proj={m.projAway} score={m.gb} win={played && m.winner === m.away} />
    </button>
  );
}
