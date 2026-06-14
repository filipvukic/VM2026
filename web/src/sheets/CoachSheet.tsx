import { useData, useCoaches } from "../state/dataset";
import { useSheets } from "../state/sheets";
import { Sheet, type SheetChrome } from "../components/Sheet";
import { PlayerImg } from "../components/PlayerImg";
import { Flag, groupColor } from "../lib/flags";
import { FormDots } from "../components/FormDots";
import { isoFor } from "../data/static/names";
import { TEAM_DETAILS } from "../data/static/history";

export function CoachSheet({ code, ...chrome }: { code: string } & SheetChrome) {
  const ds = useData();
  const coaches = useCoaches();
  const openTeam = useSheets((s) => s.openTeam);
  const t = ds.teams[code];
  const c = coaches?.[code];
  const name = c?.name || TEAM_DETAILS[code]?.coach;
  if (!t || !name) return null;

  // team's WC record (the coach's tournament so far)
  const played = ds.allMatches.filter((m) => (m.home === code || m.away === code) && m.status === "played" && m.ga != null);
  let w = 0, d = 0, l = 0, gf = 0, ga = 0;
  played.forEach((m) => {
    const us = m.home === code ? m.ga! : m.gb!;
    const them = m.home === code ? m.gb! : m.ga!;
    gf += us; ga += them;
    if (us > them) w++; else if (us < them) l++; else d++;
  });
  const natIso = c?.countryCode ? isoFor(null, c.countryCode) : isoFor(c?.country, null);

  return (
    <Sheet {...chrome} accent={groupColor(t.group)} maxWidth={520}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <PlayerImg src={c?.photo} name={name} size={84} radius={18} fontSize={28} />
        <div style={{ minWidth: 0 }}>
          <div className="kicker">Förbundskapten</div>
          <div className="display" style={{ fontSize: 24, lineHeight: 1.05 }}>{name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 8, flexWrap: "wrap" }}>
            {natIso && <Flag iso={natIso} size={16} />}
            {c?.country && <span className="dim" style={{ fontSize: 12.5, fontWeight: 700 }}>{c.country}</span>}
            {c?.age != null && <span className="chip" style={{ fontSize: 10.5 }}>{c.age} år</span>}
          </div>
        </div>
      </div>

      {/* leads team */}
      <button className="card card-pad" onClick={() => openTeam(code)} style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left" }}>
        <Flag iso={t.iso} code={code} size={32} />
        <div>
          <div style={{ fontWeight: 800 }}>{t.name}</div>
          <div className="dim" style={{ fontSize: 11.5 }}>{t.group ? `Grupp ${t.group}` : "Slutspel"}</div>
        </div>
      </button>

      {/* career record with this national team (from FotMob) */}
      {c?.career && c.career.games > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="kicker" style={{ marginBottom: 10 }}>Som {t.name}s förbundskapten</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
            <Kpi label="Matcher" value={c.career.games} />
            <Kpi label="Vinster" value={c.career.win} accent="var(--win)" />
            <Kpi label="Oavgjort" value={c.career.draw} />
            <Kpi label="Förluster" value={c.career.loss} accent="var(--loss)" />
          </div>
          {c.career.winPct != null && (
            <div className="dim" style={{ fontSize: 12, marginTop: 10 }}>
              Vinstprocent: <b style={{ color: "var(--ink)" }}>{Math.round(c.career.winPct * 100)}%</b>
            </div>
          )}
        </div>
      )}

      {/* WC record under this coach */}
      <div style={{ marginTop: 16 }}>
        <div className="kicker" style={{ marginBottom: 10 }}>I detta VM</div>
        {played.length ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
              <Kpi label="Matcher" value={played.length} />
              <Kpi label="Vinster" value={w} accent="var(--win)" />
              <Kpi label="Oavgjort" value={d} />
              <Kpi label="Förluster" value={l} accent="var(--loss)" />
            </div>
            <div className="dim" style={{ fontSize: 12, marginTop: 10 }}>Mål: {gf}–{ga} · form:</div>
            <div style={{ marginTop: 6 }}><FormDots form={ds.forms[code] || []} /></div>
          </>
        ) : (
          <div className="dim" style={{ fontSize: 12.5 }}>Laget har inte spelat någon VM-match ännu.</div>
        )}
      </div>
    </Sheet>
  );
}

function Kpi({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="card" style={{ padding: "10px 8px", textAlign: "center" }}>
      <div className="num" style={{ fontSize: 22, color: accent || "var(--ink)" }}>{value}</div>
      <div className="kicker" style={{ fontSize: 8.5 }}>{label}</div>
    </div>
  );
}
