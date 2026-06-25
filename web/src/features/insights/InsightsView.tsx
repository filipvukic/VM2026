import { useMemo } from "react";
import { useData } from "../../state/dataset";
import { useSheets } from "../../state/sheets";
import { Avatar } from "../../components/Avatar";
import { classifyTip, type TipResult } from "../../data/scoring";
import type { Dataset, PlayerStanding } from "../../data/types";

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
  const openPlayer = useSheets((s) => s.openPlayer);
  const ranked = useMemo(
    () => [...stats].sort((a, b) => b.hitRate - a.hitRate || b.exact - a.exact || b.p.total - a.p.total),
    [stats]
  );

  return (
    <div className="view container" style={{ maxWidth: 820 }}>
      <div className="section-head" style={{ marginTop: 6 }}>
        <div className="section-title">Insikter</div>
        <div className="kicker">sorterat på träffsäkerhet</div>
      </div>

      {!ranked.length ? (
        <div className="card card-pad dim" style={{ textAlign: "center" }}>Statistiken dyker upp när matcher börjat spelas.</div>
      ) : (
        <>
          <div className="card" style={{ overflow: "hidden" }}>
            <div className="ins2-grid ins2-head">
              <span></span>
              <span></span>
              <span>Spelare</span>
              <span style={{ textAlign: "right" }}>Träff%</span>
              <span style={{ textAlign: "right" }}>Poäng</span>
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
                <span className="ins2-pts num">{s.p.total}</span>
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
            <b>Träff%</b> = andel tippade matcher med rätt utgång eller exakt. <b>Poäng</b> = total i ligan.
            Form = senaste matcherna — <b style={{ color: "var(--gold)" }}>guld</b> exakt,{" "}
            <b style={{ color: "var(--win)" }}>grön</b> rätt utgång, grått tröstpoäng.
          </div>
        </>
      )}

      <style>{`
        .ins2-grid{ display:grid; grid-template-columns:18px 30px minmax(0,1fr) 48px 42px 62px; align-items:center; gap:8px; }
        .ins2-head{ padding:11px 13px; border-bottom:1px solid var(--line); }
        .ins2-head span{ font-family:var(--font-display); text-transform:uppercase; letter-spacing:.05em; font-weight:800; font-size:9.5px; color:var(--ink-3); }
        .ins2-row{ width:100%; padding:9px 13px; text-align:left; border-bottom:1px solid var(--line); transition:background .12s; }
        .ins2-row:last-child{ border-bottom:none; }
        .ins2-row:hover{ background:var(--surface-2); }
        .ins2-rk{ color:var(--ink-3); font-size:12.5px; text-align:center; }
        .ins2-nm{ font-weight:700; font-size:13.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .ins2-hr{ text-align:right; }
        .ins2-hr .num{ font-size:13px; font-weight:800; }
        .ins2-bar{ display:block; height:4px; border-radius:999px; background:var(--surface-3); overflow:hidden; margin-top:3px; }
        .ins2-bar i{ display:block; height:100%; border-radius:999px; background:var(--grad-soft); }
        .ins2-pts{ text-align:right; font-size:15px; font-weight:800; color:var(--gold); }
        .ins2-form{ display:flex; gap:3px; justify-content:flex-end; }
        .ins2-form i{ width:8px; height:8px; border-radius:50%; flex:0 0 auto; }
      `}</style>
    </div>
  );
}
