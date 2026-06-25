import { useMemo } from "react";
import { useData } from "../../state/dataset";
import { useSheets } from "../../state/sheets";
import { Avatar } from "../../components/Avatar";
import { Flag } from "../../lib/flags";
import { classifyTip, outcomeOf, type TipResult } from "../../data/scoring";
import { svDayMonth } from "../../lib/format";
import type { Dataset, Match, PlayerStanding } from "../../data/types";

interface Stat {
  p: PlayerStanding;
  played: number;
  exact: number;
  correct: number;
  hitRate: number; // (exact + correct) / played
  recent: TipResult[]; // last few results, newest last
}

function computeStats(ds: Dataset): Stat[] {
  const played = ds.allMatches
    .filter((m) => m.status === "played" && m.ga != null && m.gb != null)
    .sort((a, b) => +a.kickoff - +b.kickoff);
  return ds.players
    .map((p) => {
      const mine = played.filter((m) => p.tips[m.id]);
      let exact = 0, correct = 0;
      mine.forEach((m) => {
        const r = classifyTip(p.tips[m.id], m.ga!, m.gb!).result;
        if (r === "exact") exact++;
        else if (r === "outcome") correct++;
      });
      return {
        p,
        played: mine.length,
        exact,
        correct,
        hitRate: mine.length ? (exact + correct) / mine.length : 0,
        recent: mine.slice(-6).map((m) => classifyTip(p.tips[m.id], m.ga!, m.gb!).result),
      };
    })
    .filter((s) => s.played > 0);
}

const RES_COLOR: Record<TipResult, string> = { exact: "var(--gold)", outcome: "var(--win)", floor: "var(--ink-3)" };

export function InsightsView() {
  const ds = useData();
  const stats = useMemo(() => computeStats(ds), [ds]);

  return (
    <div className="view container" style={{ maxWidth: 860 }}>
      <div className="section-head" style={{ marginTop: 6 }}>
        <div className="section-title">Insikter</div>
      </div>

      <StatsTable stats={stats} />
      <PoolConsensus ds={ds} />

      <style>{`
        .ins2-grid{ display:grid; grid-template-columns:22px 30px minmax(0,1fr) 50px 38px 70px; align-items:center; gap:9px; }
        .ins2-head{ padding:11px 14px; border-bottom:1px solid var(--line); }
        .ins2-head span{ font-family:var(--font-display); text-transform:uppercase; letter-spacing:.05em; font-weight:800; font-size:9.5px; color:var(--ink-3); }
        .ins2-row{ width:100%; padding:9px 14px; text-align:left; border-bottom:1px solid var(--line); transition:background .12s; }
        .ins2-row:last-child{ border-bottom:none; }
        .ins2-row:hover{ background:var(--surface-2); }
        .ins2-rk{ color:var(--ink-3); font-size:13px; text-align:center; }
        .ins2-nm{ font-weight:700; font-size:13.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .ins2-hr{ text-align:right; }
        .ins2-hr .num{ font-size:13.5px; font-weight:800; }
        .ins2-bar{ display:block; height:4px; border-radius:999px; background:var(--surface-3); overflow:hidden; margin-top:3px; }
        .ins2-bar i{ display:block; height:100%; border-radius:999px; background:var(--grad-soft); }
        .ins2-ex{ text-align:center; font-size:14px; color:var(--gold); }
        .ins2-form{ display:flex; gap:3px; justify-content:flex-end; }
        .ins2-form i{ width:8px; height:8px; border-radius:50%; flex:0 0 auto; }
        .cons-bar{ display:flex; height:9px; border-radius:999px; overflow:hidden; gap:2px; margin:9px 0 7px; }
      `}</style>
    </div>
  );
}

function StatsTable({ stats }: { stats: Stat[] }) {
  const openPlayer = useSheets((s) => s.openPlayer);
  if (!stats.length)
    return <div className="card card-pad dim" style={{ textAlign: "center" }}>Statistiken dyker upp när matcher börjat spelas.</div>;
  const ranked = [...stats].sort((a, b) => b.hitRate - a.hitRate || b.exact - a.exact || b.played - a.played);

  return (
    <>
      <div className="card" style={{ overflow: "hidden" }}>
        <div className="ins2-grid ins2-head">
          <span></span>
          <span></span>
          <span>Spelare</span>
          <span style={{ textAlign: "right" }}>Träff%</span>
          <span style={{ textAlign: "center" }}>Exakta</span>
          <span style={{ textAlign: "right" }}>Form</span>
        </div>
        {ranked.map((s, i) => (
          <button key={s.p.id} className="ins2-grid ins2-row" onClick={() => openPlayer(s.p.id)}>
            <span className="ins2-rk num">{i + 1}</span>
            <Avatar name={s.p.name} photo={s.p.photo} color={s.p.color} size={30} />
            <span className="ins2-nm">{s.p.name}</span>
            <span className="ins2-hr">
              <span className="num">{Math.round(s.hitRate * 100)}%</span>
              <span className="ins2-bar"><i style={{ width: `${s.hitRate * 100}%` }} /></span>
            </span>
            <span className="ins2-ex num">{s.exact}</span>
            <span className="ins2-form">
              {/* pad to 6 so the column stays aligned even with few games played */}
              {Array.from({ length: 6 }).map((_, j) => {
                const r = s.recent[s.recent.length - 6 + j];
                return <i key={j} style={{ background: r ? RES_COLOR[r] : "var(--surface-3)" }} />;
              })}
            </span>
          </button>
        ))}
      </div>
      <div className="dim" style={{ fontSize: 11, margin: "10px 2px 0" }}>
        Sorterat på <b>träffsäkerhet</b> (andel tippade matcher med rätt utgång eller exakt). Form = senaste matcherna —{" "}
        <b style={{ color: "var(--gold)" }}>guld</b> exakt, <b style={{ color: "var(--win)" }}>grön</b> rätt utgång, grått tröstpoäng.
      </div>
    </>
  );
}

function PoolConsensus({ ds }: { ds: Dataset }) {
  const openMatch = useSheets((s) => s.openMatch);
  const upcoming = ds.allMatches
    .filter((m) => m.status === "upcoming" && m.home && m.away && m.tippas && m.tips.length > 0)
    .sort((a, b) => +a.kickoff - +b.kickoff)
    .slice(0, 5);
  if (!upcoming.length) return null;

  return (
    <div style={{ marginTop: 22 }}>
      <div className="section-head">
        <div className="section-title" style={{ fontSize: 19 }}>Vad tror poolen?</div>
        <div className="kicker">kommande matcher</div>
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {upcoming.map((m) => <ConsensusRow key={m.id} m={m} ds={ds} onOpen={() => openMatch(m.id)} />)}
      </div>
    </div>
  );
}

function ConsensusRow({ m, ds, onOpen }: { m: Match; ds: Dataset; onOpen: () => void }) {
  const home = m.home ? ds.teams[m.home] : null;
  const away = m.away ? ds.teams[m.away] : null;
  let H = 0, D = 0, A = 0;
  const score = new Map<string, number>();
  m.tips.forEach((t) => {
    const o = outcomeOf(t.tip[0], t.tip[1]);
    if (o === "H") H++; else if (o === "X") D++; else A++;
    const k = `${t.tip[0]}–${t.tip[1]}`;
    score.set(k, (score.get(k) || 0) + 1);
  });
  const total = m.tips.length || 1;
  const [modalTip, modalN] = [...score.entries()].sort((a, b) => b[1] - a[1])[0] || ["", 0];
  const lead = H >= D && H >= A ? "H" : A >= D && A >= H ? "A" : "X";

  return (
    <button className="card card-pad" onClick={onOpen} style={{ width: "100%", textAlign: "left" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
        <Flag iso={home?.iso} code={m.home} size={18} />
        <span style={{ fontWeight: lead === "H" ? 800 : 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{home?.name || "?"}</span>
        <span className="dim" style={{ fontSize: 11 }}>vs</span>
        <span style={{ fontWeight: lead === "A" ? 800 : 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{away?.name || "?"}</span>
        <Flag iso={away?.iso} code={m.away} size={18} />
        <span className="dim num" style={{ marginLeft: "auto", fontSize: 11, flexShrink: 0 }}>{svDayMonth(m.kickoff)}</span>
      </div>
      <div className="cons-bar">
        <div style={{ width: `${(H / total) * 100}%`, background: "var(--hot)" }} />
        <div style={{ width: `${(D / total) * 100}%`, background: "var(--ink-3)" }} />
        <div style={{ width: `${(A / total) * 100}%`, background: "var(--cool)" }} />
      </div>
      <div className="dim" style={{ fontSize: 11.5 }}>
        <b style={{ color: "var(--hot-2)" }}>{Math.round((H / total) * 100)}%</b> {home?.name} ·{" "}
        <b>{Math.round((D / total) * 100)}%</b> oavgjort ·{" "}
        <b style={{ color: "var(--cool-2)" }}>{Math.round((A / total) * 100)}%</b> {away?.name}
        {modalN > 0 && <> · vanligaste tips <b className="num" style={{ color: "var(--ink)" }}>{modalTip}</b> ({modalN} st)</>}
      </div>
    </button>
  );
}
