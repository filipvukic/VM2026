import { useMemo } from "react";
import { useData } from "../../state/dataset";
import { useSheets } from "../../state/sheets";
import { useNow } from "../../state/useNow";
import { MatchCard } from "../../components/MatchCard";
import { svDateKey, svDayLabel, svTime } from "../../lib/format";
import type { Dataset, Match } from "../../data/types";

export function LiveCenterView() {
  const ds = useData();
  const now = useNow(1000);
  const openMatch = useSheets((s) => s.openMatch);

  const { live, todayUpcoming, todayPlayed, next } = useMemo(() => groupToday(ds), [ds]);

  return (
    <div className="view container" style={{ maxWidth: 980 }}>
      <div className="section-head" style={{ marginTop: 6 }}>
        <div className="section-title">Live</div>
        {live.length > 0 ? (
          <span className="live-pill"><span className="live-dot" />{live.length} pågår</span>
        ) : (
          <span className="chip">{svDayLabel(new Date(now), new Date(now))}</span>
        )}
      </div>

      {live.length > 0 && (
        <div className="live-grid" style={{ marginBottom: 22 }}>
          {live.map((m) => (
            <MatchCard key={m.id} match={m} onOpen={() => openMatch(m.id)} />
          ))}
        </div>
      )}

      {live.length === 0 && next && <NextKickoff m={next} now={now} ds={ds} onOpen={() => openMatch(next.id)} />}

      {todayUpcoming.length > 0 && (
        <>
          <div className="section-head"><div className="section-title" style={{ fontSize: 18 }}>{live.length ? "Senare idag" : "Idag"}</div></div>
          <div className="live-grid">
            {todayUpcoming.map((m) => (
              <MatchCard key={m.id} match={m} onOpen={() => openMatch(m.id)} />
            ))}
          </div>
        </>
      )}

      {todayPlayed.length > 0 && (
        <>
          <div className="section-head"><div className="section-title" style={{ fontSize: 18 }}>Färdigspelat idag</div></div>
          <div className="live-grid">
            {todayPlayed.map((m) => (
              <MatchCard key={m.id} match={m} onOpen={() => openMatch(m.id)} />
            ))}
          </div>
        </>
      )}

      {live.length === 0 && todayUpcoming.length === 0 && todayPlayed.length === 0 && !next && (
        <div className="dim" style={{ textAlign: "center", padding: 50 }}>Inga matcher just nu.</div>
      )}

      <style>{`
        .live-grid{ display:grid; gap:10px; grid-template-columns:1fr; }
        @media(min-width:760px){ .live-grid{ grid-template-columns:1fr 1fr; } }
      `}</style>
    </div>
  );
}

function groupToday(ds: Dataset) {
  const today = svDateKey(ds.now);
  const live = ds.allMatches.filter((m) => m.status === "live");
  const todays = ds.allMatches.filter((m) => svDateKey(m.kickoff) === today && m.status !== "live");
  const todayUpcoming = todays.filter((m) => m.status === "upcoming").sort((a, b) => +a.kickoff - +b.kickoff);
  const todayPlayed = todays.filter((m) => m.status === "played").sort((a, b) => +b.kickoff - +a.kickoff);
  const next = ds.allMatches.filter((m) => m.status === "upcoming").sort((a, b) => +a.kickoff - +b.kickoff)[0] || null;
  return { live, todayUpcoming, todayPlayed, next };
}

function NextKickoff({ m, now, ds, onOpen }: { m: Match; now: number; ds: Dataset; onOpen: () => void }) {
  const diff = Math.max(0, +m.kickoff - now);
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const min = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const home = m.home ? ds.teams[m.home] : null;
  const away = m.away ? ds.teams[m.away] : null;
  return (
    <button onClick={onOpen} className="card" style={{ width: "100%", padding: 22, marginBottom: 22, textAlign: "center", background: "linear-gradient(120deg, color-mix(in srgb,var(--hot) 18%, var(--surface)), var(--surface))" }}>
      <div className="kicker" style={{ color: "var(--hot-2)" }}>Nästa avspark · {svDayLabel(m.kickoff, ds.now)} {svTime(m.kickoff)}</div>
      <div className="display" style={{ fontSize: "clamp(20px,5vw,30px)", margin: "10px 0 14px" }}>
        {home?.name || m.fromA || "TBD"} <span className="dim">vs</span> {away?.name || m.fromB || "TBD"}
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 14 }}>
        {[[d, "dgr"], [h, "tim"], [min, "min"], [s, "sek"]].map(([v, l]) => (
          <div key={l as string}>
            <div className="num" style={{ fontSize: "clamp(28px,8vw,44px)", color: "var(--ink)" }}>{String(v).padStart(2, "0")}</div>
            <div className="kicker" style={{ fontSize: 9 }}>{l}</div>
          </div>
        ))}
      </div>
    </button>
  );
}
