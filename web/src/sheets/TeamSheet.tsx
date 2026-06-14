import { useData, useCoaches } from "../state/dataset";
import { useSheets } from "../state/sheets";
import { Sheet, type SheetChrome } from "../components/Sheet";
import { GroupTable } from "../components/GroupTable";
import { PlayerImg } from "../components/PlayerImg";
import { Flag, groupColor } from "../lib/flags";
import { FormDots } from "../components/FormDots";
import { WC_HISTORY, FIFA_RANKING, FIFA_RANKING_DATE, TEAM_DETAILS } from "../data/static/history";
import { svDayMonth } from "../lib/format";

export function TeamSheet({ code, ...chrome }: { code: string } & SheetChrome) {
  const ds = useData();
  const openMatch = useSheets((s) => s.openMatch);
  const openFb = useSheets((s) => s.openFbPlayer);
  const openCoach = useSheets((s) => s.openCoach);
  const coaches = useCoaches();
  const t = ds.teams[code];
  if (!t) return null;
  const hist = WC_HISTORY[code];
  const detail = TEAM_DETAILS[code];
  const coachRec = coaches?.[code] || null;
  const coachName = coachRec?.name || detail?.coach;
  const rank = FIFA_RANKING[code];
  const matches = ds.allMatches.filter((m) => m.home === code || m.away === code).sort((a, b) => +a.kickoff - +b.kickoff);
  const fans = ds.players.filter((p) => p.bonus.winner === code || p.bonus.silver === code || p.bonus.bronze === code);

  return (
    <Sheet {...chrome} accent={groupColor(t.group)}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8 }}>
        <Flag iso={t.iso} code={code} size={52} />
        <div>
          <div className="display" style={{ fontSize: 28 }}>{t.name}</div>
          <div className="dim" style={{ fontSize: 12.5, fontWeight: 700 }}>
            {t.group ? `Grupp ${t.group}` : ""}{rank ? ` · FIFA #${rank} (${FIFA_RANKING_DATE})` : ""}
          </div>
        </div>
      </div>

      {/* group standings */}
      {t.group && <div style={{ marginTop: 12 }}><GroupTable letter={t.group} highlight={[code]} /></div>}

      {(coachName || hist || detail?.stars) && (
        <div className="card card-pad" style={{ marginTop: 12 }}>
          {coachName && (
            <button onClick={() => openCoach(code)} style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", textAlign: "left", marginBottom: detail?.stars || hist ? 12 : 0 }}>
              {coachRec?.photo ? <PlayerImg src={coachRec.photo} name={coachName} size={36} radius={50} fontSize={13} /> : null}
              <div>
                <div className="kicker">Förbundskapten ›</div>
                <div style={{ fontWeight: 800, marginTop: 2 }}>{coachName}</div>
              </div>
            </button>
          )}
          {detail?.stars && (
            <div>
              <div className="kicker" style={{ marginBottom: 6 }}>Nyckelspelare</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {detail.stars.map((s) => <button key={s} className="chip" onClick={() => openFb(s)}>{s}</button>)}
              </div>
            </div>
          )}
          {hist && (
            <div style={{ display: "flex", gap: 18, marginTop: 14, flexWrap: "wrap" }}>
              <Mini label="VM-titlar" value={String(hist.titles)} hot={hist.titles > 0} />
              {hist.apps != null && <Mini label="Slutspel" value={String(hist.apps)} />}
              {hist.best && <div style={{ flex: 1, minWidth: 140 }}><div className="kicker">Bästa resultat</div><div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{hist.best}</div></div>}
            </div>
          )}
        </div>
      )}

      <div className="card card-pad" style={{ marginTop: 12 }}>
        <div className="kicker" style={{ marginBottom: 8 }}>Form</div>
        <FormDots form={ds.forms[code] || []} />
      </div>

      {matches.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="kicker" style={{ marginBottom: 8 }}>Matcher i VM</div>
          <div style={{ display: "grid", gap: 7 }}>
            {matches.map((m) => {
              const opp = m.home === code ? m.away : m.home;
              const oppT = opp ? ds.teams[opp] : null;
              return (
                <button key={m.id} className="card" onClick={() => openMatch(m.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: "var(--r-md)", width: "100%", textAlign: "left" }}>
                  <span className="dim" style={{ width: 52, fontSize: 11, fontWeight: 700 }}>{svDayMonth(m.kickoff)}</span>
                  <Flag iso={oppT?.iso} code={opp} size={18} />
                  <span style={{ flex: 1, fontWeight: 700, fontSize: 13.5 }}>{oppT?.name || m.fromA || m.fromB || "TBD"}</span>
                  {m.status === "played" ? <span className="num">{m.home === code ? m.ga : m.gb}–{m.home === code ? m.gb : m.ga}</span> : <span className="dim" style={{ fontSize: 12 }}>{m.stage === "group" ? `Grupp ${m.group}` : "Slutspel"}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {fans.length > 0 && (
        <div className="card card-pad" style={{ marginTop: 14 }}>
          <div className="kicker" style={{ marginBottom: 8 }}>Tror på {t.name}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {fans.map((p) => {
              const role = p.bonus.winner === code ? "vinnare" : p.bonus.silver === code ? "silver" : "brons";
              return <span key={p.id} className="chip"><span style={{ width: 7, height: 7, borderRadius: "50%", background: p.color, display: "inline-block" }} />{p.name} · {role}</span>;
            })}
          </div>
        </div>
      )}
    </Sheet>
  );
}

function Mini({ label, value, hot }: { label: string; value: string; hot?: boolean }) {
  return (
    <div>
      <div className="num" style={{ fontSize: 24, color: hot ? "var(--gold)" : "var(--ink)" }}>{value}</div>
      <div className="kicker">{label}</div>
    </div>
  );
}
