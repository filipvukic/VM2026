import { useMemo, useState } from "react";
import { useData } from "../state/dataset";
import { useSheets } from "../state/sheets";
import { MatchCard } from "../components/MatchCard";
import { Flag } from "../lib/flags";
import { svDayLabel, svDateKey } from "../lib/format";
import { isLive, isEnded } from "../lib/liveState";
import type { Dataset, Match } from "../data/types";

type Mode = "list" | "bracket";
type Filter = "all" | "live" | "upcoming" | "played";

export function ScheduleView() {
  const ds = useData();
  const [mode, setMode] = useState<Mode>("list");

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
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    let list = ds.allMatches.slice().sort((a, b) => +a.kickoff - +b.kickoff);
    if (filter === "live") list = list.filter(isLive);
    else if (filter === "upcoming") list = list.filter((m) => m.status === "upcoming");
    else if (filter === "played") list = list.filter(isEnded);
    return list;
  }, [ds, filter]);

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
        <div key={key} style={{ marginBottom: 22 }}>
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
function Bracket({ ds }: { ds: Dataset }) {
  const openMatch = useSheets((s) => s.openMatch);
  const ko = ds.knockout;
  const cols: { label: string; ms: Match[] }[] = [
    { label: "16-del", ms: ko.r32 },
    { label: "8-del", ms: ko.r16 },
    { label: "Kvart", ms: ko.qf },
    { label: "Semi", ms: ko.sf },
    { label: "Final", ms: ko.final },
  ];
  return (
    <div>
      <div className="bracket">
        {cols.map((c) => (
          <div key={c.label} className="bcol">
            <div className="kicker" style={{ textAlign: "center", marginBottom: 8 }}>{c.label}</div>
            <div className="bcol-inner">
              {c.ms.map((m) => (
                <BracketCell key={m.id} m={m} ds={ds} onOpen={() => m._realId && openMatch(m.id)} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="section-head"><div className="section-title" style={{ fontSize: 18 }}>Match om tredjepris</div></div>
      <div style={{ maxWidth: 340 }}>
        {ko.third.map((m) => (
          <BracketCell key={m.id} m={m} ds={ds} onOpen={() => m._realId && openMatch(m.id)} />
        ))}
      </div>

      <style>{`
        .bracket{ display:flex; gap:14px; overflow-x:auto; padding-bottom:14px; scrollbar-width:thin; }
        .bcol{ flex:0 0 220px; }
        .bcol-inner{ display:flex; flex-direction:column; gap:10px; height:100%; justify-content:space-around; }
      `}</style>
    </div>
  );
}

function BracketCell({ m, ds, onOpen }: { m: Match; ds: Dataset; onOpen: () => void }) {
  const Side = ({ code, proj, label }: { code: string | null; proj?: string | null; label?: string | null }) => {
    const t = code ? ds.teams[code] : null;
    const projName = proj ? ds.teams[proj]?.name : null;
    const isWin = m.status === "played" && m.winner === code;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 8px", opacity: m.status === "played" && m.winner && !isWin ? 0.5 : 1 }}>
        <Flag iso={t?.iso} code={code} size={16} />
        <span style={{ flex: 1, minWidth: 0, fontWeight: isWin ? 800 : 700, fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: t ? "var(--ink)" : "var(--ink-3)" }}>
          {t ? t.name : projName ? projName : label || "TBD"}
        </span>
        {(m.status === "played" || m.status === "live") && code && (
          <span className="num" style={{ fontSize: 14 }}>{(m.winner === code || m.ga != null ? (code === m.home ? m.ga : m.gb) : "") ?? ""}</span>
        )}
      </div>
    );
  };
  const clickable = !!m._realId;
  return (
    <button
      className="card"
      onClick={clickable ? onOpen : undefined}
      style={{ width: "100%", padding: 0, borderRadius: "var(--r-md)", cursor: clickable ? "pointer" : "default", overflow: "hidden" }}
    >
      <Side code={m.home} proj={m.projHome} label={m.fromA} />
      <div style={{ height: 1, background: "var(--line)" }} />
      <Side code={m.away} proj={m.projAway} label={m.fromB} />
    </button>
  );
}
