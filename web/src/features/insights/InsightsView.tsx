import { useMemo, useState } from "react";
import { useData } from "../../state/dataset";
import { useSheets } from "../../state/sheets";
import { Avatar } from "../../components/Avatar";
import { Flag } from "../../lib/flags";
import { classifyTip, type TipResult } from "../../data/scoring";
import type { Dataset, Match, PlayerStanding } from "../../data/types";

interface Stat {
  p: PlayerStanding;
  played: number;
  exact: number;
  correct: number;
  hitRate: number;
  recent: TipResult[];
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
        p, played: mine.length, exact, correct,
        hitRate: mine.length ? (exact + correct) / mine.length : 0,
        recent: mine.slice(-6).map((m) => classifyTip(p.tips[m.id], m.ga!, m.gb!).result),
      };
    })
    .filter((s) => s.played > 0);
}

const RES_COLOR: Record<TipResult, string> = { exact: "var(--gold)", outcome: "var(--win)", floor: "var(--ink-3)" };
type SortKey = "hitRate" | "exact" | "total";

export function InsightsView() {
  const ds = useData();
  const stats = useMemo(() => computeStats(ds), [ds]);
  const openPlayer = useSheets((s) => s.openPlayer);
  const [sort, setSort] = useState<SortKey>("hitRate");
  const ranked = useMemo(
    () => [...stats].sort((a, b) =>
      sort === "total"
        ? b.p.total - a.p.total || b.hitRate - a.hitRate
        : sort === "exact"
          ? b.exact - a.exact || b.hitRate - a.hitRate || b.p.total - a.p.total
          : b.hitRate - a.hitRate || b.exact - a.exact || b.p.total - a.p.total
    ),
    [stats, sort]
  );

  return (
    <div className="view container" style={{ maxWidth: 820 }}>
      <div className="section-head" style={{ marginTop: 6 }}>
        <div className="section-title">Insikter</div>
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
              <button className={`ins2-sort${sort === "hitRate" ? " on" : ""}`} onClick={() => setSort("hitRate")}>Träff%{sort === "hitRate" ? " ↓" : ""}</button>
              <button className={`ins2-sort${sort === "exact" ? " on" : ""}`} onClick={() => setSort("exact")}>Exakt{sort === "exact" ? " ↓" : ""}</button>
              <button className={`ins2-sort${sort === "total" ? " on" : ""}`} onClick={() => setSort("total")}>Poäng{sort === "total" ? " ↓" : ""}</button>
              <span className="ins2-fh">Form</span>
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
                <span className="ins2-pts num">{s.p.total}</span>
                <span className="ins2-form">
                  {Array.from({ length: 6 }).map((_, j) => {
                    const r = s.recent[s.recent.length - 6 + j];
                    return <i key={j} style={{ background: r ? RES_COLOR[r] : "var(--surface-3)" }} />;
                  })}
                </span>
              </button>
            ))}
          </div>
          <div className="dim" style={{ fontSize: 11, margin: "10px 2px 0" }}>
            <b>Träff%</b> = andel rätt utgång eller exakt. Form = senaste matcherna —{" "}
            <b style={{ color: "var(--gold)" }}>guld</b> exakt, <b style={{ color: "var(--win)" }}>grön</b> rätt utgång, grått tröst.
          </div>

          <FormGrid ds={ds} />
        </>
      )}

      <style>{`
        /* mobile: drop the inline Form dots (the Formrutnät heatmap below shows the same
           thing) so the name + stat columns get real breathing room. Form returns ≥560px. */
        /* wider avatar track = breathing room between photo and name; stat columns are
           CENTERED (not right-pinned) so they read airy; Form is compact + only ≥560px. */
        .ins2-grid{ display:grid; grid-template-columns:16px 34px minmax(0,1fr) 48px 34px 42px; align-items:center; gap:8px; }
        .ins2-fh, .ins2-form{ display:none; }
        @media(min-width:560px){
          .ins2-grid{ grid-template-columns:16px 36px minmax(0,1fr) 54px 40px 46px 46px; gap:10px; }
          .ins2-fh{ display:block; } .ins2-form{ display:flex; }
        }
        .ins2-head{ padding:10px 13px; border-bottom:1px solid var(--line); }
        .ins2-head > span, .ins2-fh, .ins2-sort{ font-family:var(--font-display); text-transform:uppercase; letter-spacing:.05em; font-weight:800; font-size:9.5px; color:var(--ink-3); }
        .ins2-fh{ text-align:center; }
        .ins2-sort{ text-align:center; cursor:pointer; white-space:nowrap; }
        .ins2-sort.on{ color:var(--gold); }
        .ins2-row{ width:100%; padding:9px 13px; text-align:left; border-bottom:1px solid var(--line); transition:background .12s; }
        .ins2-row:last-child{ border-bottom:none; }
        .ins2-row:hover{ background:var(--surface-2); }
        .ins2-rk{ color:var(--ink-3); font-size:12.5px; text-align:center; }
        .ins2-nm{ font-weight:700; font-size:13.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .ins2-hr{ text-align:center; }
        .ins2-hr .num{ font-size:13px; font-weight:800; }
        .ins2-bar{ display:block; height:4px; border-radius:999px; background:var(--surface-3); overflow:hidden; margin-top:3px; }
        .ins2-bar i{ display:block; height:100%; border-radius:999px; background:var(--grad-soft); }
        .ins2-ex{ text-align:center; font-size:14px; font-weight:800; color:var(--ink); }
        .ins2-pts{ text-align:center; font-size:15px; font-weight:800; color:var(--gold); }
        .ins2-form{ gap:2px; justify-content:center; }
        .ins2-form i{ width:6px; height:6px; border-radius:50%; flex:0 0 auto; }
        .fg-scroll{ overflow-x:auto; scrollbar-width:thin; }
        .fg{ display:grid; }
        .fg-cell{ display:grid; place-items:center; }
      `}</style>
    </div>
  );
}

// Fun: a form heatmap — every player vs the last played matches, each cell coloured
// by how their tip did (gold=exact, green=right outcome, grey=consolation, blank=no
// tip). See at a glance who's hot and who nailed which match. Tap a column to open
// the match, a row to open the player.
function FormGrid({ ds }: { ds: Dataset }) {
  const openPlayer = useSheets((s) => s.openPlayer);
  const openMatch = useSheets((s) => s.openMatch);
  const recent: Match[] = ds.allMatches
    .filter((m) => m.status === "played" && m.ga != null && m.gb != null)
    .sort((a, b) => +a.kickoff - +b.kickoff)
    .slice(-8);
  if (recent.length < 2) return null;
  const players = ds.standings; // leaderboard order
  const cols = recent.length;

  return (
    <div style={{ marginTop: 22 }}>
      <div className="section-head">
        <div className="section-title" style={{ fontSize: 19 }}>Formrutnät</div>
        <div className="kicker">senaste {cols} matcherna</div>
      </div>
      <div className="card fg-scroll">
        <div className="fg" style={{ gridTemplateColumns: `132px repeat(${cols}, 30px)`, minWidth: 132 + cols * 30 }}>
          {/* header */}
          <div style={{ padding: "8px 0 8px 12px" }} />
          {recent.map((m) => {
            const h = m.home ? ds.teams[m.home] : null, a = m.away ? ds.teams[m.away] : null;
            return (
              <button key={m.id} className="fg-cell" onClick={() => m._realId && openMatch(m.id)} style={{ flexDirection: "column", gap: 2, padding: "7px 0" }} title={`${h?.name || "?"}–${a?.name || "?"}`}>
                <Flag iso={h?.iso} code={m.home} size={11} />
                <Flag iso={a?.iso} code={m.away} size={11} />
              </button>
            );
          })}
          {/* rows */}
          {players.map((p) => (
            <FgRow key={p.id} p={p} recent={recent} onPlayer={() => openPlayer(p.id)} onMatch={openMatch} />
          ))}
        </div>
      </div>
    </div>
  );
}

function FgRow({ p, recent, onPlayer, onMatch }: { p: PlayerStanding; recent: Match[]; onPlayer: () => void; onMatch: (id: string) => void }) {
  return (
    <>
      <button onClick={onPlayer} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px 5px 12px", textAlign: "left", borderTop: "1px solid var(--line)", minWidth: 0 }}>
        <Avatar name={p.name} photo={p.photo} color={p.color} size={22} />
        <span style={{ minWidth: 0, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
      </button>
      {recent.map((m) => {
        const tip = p.tips[m.id];
        const r = tip && m.ga != null && m.gb != null ? classifyTip(tip, m.ga, m.gb).result : null;
        const pts = r === "exact" ? 5 : r === "outcome" ? 2 : r === "floor" ? 1 : null;
        return (
          <button key={m.id} className="fg-cell" onClick={() => m._realId && onMatch(m.id)} style={{ borderTop: "1px solid var(--line)" }} title={tip ? `${p.name}: ${tip[0]}–${tip[1]} (${pts}p)` : "inget tips"}>
            <span style={{ width: 19, height: 19, borderRadius: 6, display: "grid", placeItems: "center", fontSize: 10, fontWeight: 800, color: r === "exact" ? "#0a0712" : "#fff", background: r ? RES_COLOR[r] : "var(--surface-3)" }}>
              {pts ?? ""}
            </span>
          </button>
        );
      })}
    </>
  );
}
