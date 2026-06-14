import { useState } from "react";
import { useData } from "../state/dataset";
import { useSheets } from "../state/sheets";
import { Flag } from "../lib/flags";
import { FIFA_RANKING, FIFA_RANKING_DATE, WC_HISTORY } from "../data/static/history";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function RankingView() {
  const ds = useData();
  const openTeam = useSheets((s) => s.openTeam);
  const [q, setQ] = useState("");

  const teams = Object.values(ds.teams)
    .filter((t) => t.code.indexOf("TBD") !== 0 && t.name !== "Att lottas")
    .map((t) => ({ ...t, rank: FIFA_RANKING[t.code] ?? 999 }))
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));

  const maxRank = Math.max(...teams.map((t) => (t.rank === 999 ? 0 : t.rank)), 1);
  const nq = norm(q.trim());
  const shown = nq ? teams.filter((t) => norm(t.name).includes(nq) || norm(t.code).includes(nq)) : teams;

  return (
    <div className="view container" style={{ maxWidth: 760 }}>
      <div className="section-head" style={{ marginTop: 6 }}>
        <div className="section-title">Ranking</div>
        <div className="kicker">FIFA · {FIFA_RANKING_DATE}</div>
      </div>

      <div style={{ position: "relative", marginBottom: 14 }}>
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="var(--ink-3)" strokeWidth="2.2" style={{ position: "absolute", left: 13, top: 12 }}>
          <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.2-3.2" strokeLinecap="round" />
        </svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Sök lag…"
          style={{ width: "100%", padding: "10px 12px 10px 38px", borderRadius: "var(--r-md)", background: "var(--surface)", border: "1px solid var(--line-2)", color: "var(--ink)", fontSize: 14, fontWeight: 600, outline: "none" }}
        />
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        {shown.length === 0 && <div className="dim" style={{ padding: 24, textAlign: "center" }}>Inga lag matchar "{q}".</div>}
        {shown.map((t, i) => {
          const hist = WC_HISTORY[t.code];
          const ranked = t.rank !== 999;
          return (
            <button
              key={t.code}
              onClick={() => openTeam(t.code)}
              className="rk-row"
              style={{ borderBottom: i < shown.length - 1 ? "1px solid var(--line)" : "none" }}
            >
              <span className="num" style={{ width: 34, textAlign: "center", fontSize: 17, color: i < 3 ? "var(--gold)" : "var(--ink-3)" }}>
                {ranked ? t.rank : "–"}
              </span>
              <Flag iso={t.iso} code={t.code} size={26} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 14.5 }}>{t.name}</div>
                <div className="dim" style={{ fontSize: 11 }}>
                  {t.group ? `Grupp ${t.group}` : ""}{hist?.titles ? ` · ${hist.titles} VM-guld` : ""}
                </div>
              </div>
              {ranked && (
                <div className="rk-bar" style={{ width: 70 }}>
                  <div style={{ height: "100%", borderRadius: 999, width: `${Math.max(6, (1 - (t.rank - 1) / maxRank) * 100)}%`, background: i < 3 ? "var(--grad-gold)" : "var(--grad-soft)" }} />
                </div>
              )}
              <span className="num dim" style={{ width: 24, textAlign: "right" }}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M9 6l6 6-6 6" strokeLinecap="round" /></svg>
              </span>
            </button>
          );
        })}
      </div>
      <div className="dim" style={{ textAlign: "center", fontSize: 11, margin: "14px 0" }}>
        Officiell FIFA-ranking ({FIFA_RANKING_DATE}). Tryck på ett lag för mer info.
      </div>

      <style>{`
        .rk-row{ width:100%; display:flex; align-items:center; gap:11px; padding:10px 14px; text-align:left; transition:background .12s; }
        .rk-row:hover{ background:var(--surface-2); }
        .rk-bar{ height:7px; border-radius:999px; background:var(--surface-3); overflow:hidden; }
        @media(max-width:520px){ .rk-bar{ display:none; } }
      `}</style>
    </div>
  );
}
