import { useMemo, useState } from "react";
import { useData } from "../state/dataset";
import { useSheets } from "../state/sheets";
import { Flag, groupColor } from "../lib/flags";
import { isLive } from "../lib/liveState";
import { classifyTip } from "../data/scoring";
import { Avatar } from "../components/Avatar";
import type { Dataset } from "../data/types";

function groupTipLeaders(ds: Dataset, letter: string) {
  const matches = ds.matches.filter((m) => m.group === letter && m.status === "played" && m.home && m.away);
  if (!matches.length) return [];
  const scores = ds.players.map((p) => {
    let pts = 0,
      exact = 0;
    matches.forEach((m) => {
      const tip = p.tips[m.id];
      if (tip) {
        const c = classifyTip(tip, m.ga!, m.gb!);
        pts += c.points;
        if (c.result === "exact") exact++;
      }
    });
    return { id: p.id, name: p.name, color: p.color, photo: p.photo, pts, exact };
  });
  return scores.sort((a, b) => b.pts - a.pts || b.exact - a.exact || a.name.localeCompare(b.name));
}

function GroupTipBoard({ leaders }: { leaders: ReturnType<typeof groupTipLeaders> }) {
  const openPlayer = useSheets((s) => s.openPlayer);
  const [open, setOpen] = useState(false);
  const leader = leaders[0];
  return (
    <div style={{ borderTop: "1px solid var(--line)", background: "var(--bg-2)" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, padding: "10px 14px", textAlign: "left" }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="kicker" style={{ fontSize: 9.5 }}>Bästa tippare i gruppen</div>
          {leader && (
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 4 }}>
              <Avatar name={leader.name} photo={leader.photo} color={leader.color} size={20} />
              <span style={{ fontSize: 12.5, fontWeight: 800 }}>{leader.name}</span>
              <span className="num" style={{ fontSize: 12 }}>{leader.pts}p</span>
            </div>
          )}
        </div>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--ink-3)" strokeWidth="2.4" style={{ transition: "transform .25s", transform: open ? "rotate(180deg)" : "none" }}>
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div style={{ maxHeight: open ? leaders.length * 40 + 16 : 0, overflow: "hidden", transition: "max-height .32s cubic-bezier(.2,.7,.2,1)" }}>
        <div style={{ padding: "0 14px 12px" }}>
          {leaders.map((l, i) => (
            <button key={l.id} className="gt-tipboard-row" onClick={() => openPlayer(l.id)}>
              <span className="num" style={{ width: 16, color: i === 0 ? "var(--gold)" : "var(--ink-3)", fontSize: 12 }}>{i + 1}</span>
              <Avatar name={l.name} photo={l.photo} color={l.color} size={24} />
              <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700 }}>{l.name}</span>
              {l.exact > 0 && <span className="dim" style={{ fontSize: 10 }}>{l.exact}× exakt</span>}
              <span className="num" style={{ fontSize: 12.5, width: 28, textAlign: "right" }}>{l.pts}p</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function GroupsView() {
  const ds = useData();
  const openTeam = useSheets((s) => s.openTeam);
  const [focus, setFocus] = useState<string | null>(null);
  const letters = ds.groupLetters;
  const shown = focus ? [focus] : letters;

  return (
    <div className="view container">
      <div className="section-head" style={{ marginTop: 6 }}>
        <div className="section-title">Grupper</div>
        <div className="kicker">Topp 2 + 8 bästa treor → slutspel</div>
      </div>

      {/* group jump chips */}
      <div className="chip-row">
        <button className={`gchip ${!focus ? "on" : ""}`} onClick={() => setFocus(null)}>Alla</button>
        {letters.map((L) => (
          <button
            key={L}
            className={`gchip ${focus === L ? "on" : ""}`}
            onClick={() => setFocus(focus === L ? null : L)}
            style={focus === L ? { background: groupColor(L), color: "#0a0712", borderColor: "transparent" } : {}}
          >
            {L}
          </button>
        ))}
      </div>

      <div className="group-grid">
        {shown.map((L) => (
          <GroupCard key={L} letter={L} ds={ds} onTeam={openTeam} leaders={groupTipLeaders(ds, L)} />
        ))}
      </div>

      <style>{`
        .chip-row{ display:flex; gap:6px; flex-wrap:wrap; margin-bottom:16px; }
        .gchip{ min-width:34px; height:32px; padding:0 12px; border-radius:var(--r-pill); border:1px solid var(--line-2); background:var(--surface); color:var(--ink-2); font-weight:800; font-size:13px; font-family:var(--font-display); display:inline-flex; align-items:center; justify-content:center; }
        .gchip.on{ color:var(--ink); border-color:var(--line-3); }
        .group-grid{ display:grid; gap:14px; grid-template-columns:minmax(0,1fr); align-items:start; }
        @media(min-width:640px){ .group-grid{ grid-template-columns:minmax(0,1fr) minmax(0,1fr); } }
        @media(min-width:1040px){ .group-grid{ grid-template-columns:repeat(3,minmax(0,1fr)); } }
      `}</style>
    </div>
  );
}

function GroupCard({
  letter,
  ds,
  onTeam,
  leaders,
}: {
  letter: string;
  ds: Dataset;
  onTeam: (c: string) => void;
  leaders: ReturnType<typeof groupTipLeaders>;
}) {
  const rows = ds.groupTables[letter] || [];
  const color = groupColor(letter);
  // which teams are playing live RIGHT NOW (per team, not per group)
  const liveTeams = new Set(ds.allMatches.filter(isLive).flatMap((m) => [m.home, m.away]));
  const host = useMemo(() => {
    const m = ds.matches.find((x) => x.group === letter && x.venue?.city);
    return m?.venue?.city || null;
  }, [ds, letter]);

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: "1px solid var(--line)" }}>
        <span
          className="num"
          style={{ width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", background: color, color: "#0a0712", fontSize: 17 }}
        >
          {letter}
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: ".03em" }}>
            Grupp {letter}
          </div>
          {host && <div className="dim" style={{ fontSize: 10.5 }}>{host}</div>}
        </div>
      </div>

      <div style={{ padding: "4px 6px 8px" }}>
        <div className="gt-head">
          <span style={{ width: 20 }} />
          <span style={{ flex: 1 }} />
          <span>SP</span>
          <span>MS</span>
          <span style={{ color: "var(--ink)" }}>P</span>
        </div>
        {rows.map((r) => {
          const t = ds.teams[r.code];
          const tbd = r.code.indexOf("TBD") === 0;
          const qual = r.pos <= 2 ? "var(--win)" : r.pos === 3 ? "var(--gold)" : "transparent";
          return (
            <button
              key={r.code}
              className="gt-row"
              disabled={tbd}
              onClick={() => !tbd && onTeam(r.code)}
              style={{ opacity: tbd ? 0.5 : 1 }}
            >
              <span className="num" style={{ width: 20, textAlign: "center", color: "var(--ink-3)", fontSize: 13, borderLeft: `3px solid ${qual}`, paddingLeft: 5 }}>
                {r.pos}
              </span>
              <span style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <Flag iso={t?.iso} code={r.code} size={18} />
                <span style={{ fontWeight: 700, fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {tbd ? "Att lottas" : t?.name || r.code}
                </span>
                {liveTeams.has(r.code) && (
                  <span className="live-pill" style={{ fontSize: 8.5, padding: "1px 6px", flexShrink: 0 }}>
                    <span className="live-dot" />LIVE
                  </span>
                )}
              </span>
              <span className="gt-num">{r.sp}</span>
              <span className="gt-num" style={{ color: r.ms > 0 ? "var(--win)" : r.ms < 0 ? "var(--loss)" : "var(--ink-2)" }}>
                {r.ms > 0 ? "+" : ""}{r.ms}
              </span>
              <span className="gt-num num" style={{ color: "var(--ink)", fontSize: 15 }}>{r.p}</span>
            </button>
          );
        })}
      </div>

      {leaders.length > 0 && <GroupTipBoard leaders={leaders} />}

      <style>{`
        .gt-tipboard-row{ width:100%; display:flex; align-items:center; gap:8px; padding:4px 0; text-align:left; }
        .gt-head{ display:flex; align-items:center; gap:6px; padding:6px 8px 4px; font-size:10px; font-weight:800; letter-spacing:.06em; color:var(--ink-3); }
        .gt-head > span:not([style*=flex]):not([style*=width]){ width:30px; text-align:center; }
        .gt-row{ width:100%; display:flex; align-items:center; gap:6px; padding:7px 8px; text-align:left; border-radius:8px; transition:background .12s; }
        .gt-row:not(:disabled):hover{ background:var(--surface-2); }
        .gt-num{ width:30px; text-align:center; font-size:12.5px; font-weight:700; color:var(--ink-2); font-variant-numeric:tabular-nums; }
      `}</style>
    </div>
  );
}
