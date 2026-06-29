import { useState } from "react";
import { usePlayersDb, useData } from "../state/dataset";
import { useSheets } from "../state/sheets";
import { Sheet, type SheetChrome } from "../components/Sheet";
import { Flag } from "../lib/flags";
import { PlayerImg } from "../components/PlayerImg";
import { findPlayer, playerPhotoSources, idxNorm } from "../lib/playerPhoto";
import { isoFor } from "../data/static/names";
import { starTeam } from "../data/stars";
import { useStatsIndex, useMatchStats } from "../state/matchStats";
import { PlayerMatchPanel } from "../components/PlayerMatchPanel";
import { WikiLink } from "../components/WikiLink";
import { ratingColor } from "../lib/rating";

function age(born?: string | null): number | null {
  if (!born) return null;
  const y = parseInt(born.slice(0, 4), 10);
  if (!y) return null;
  return 2026 - y;
}

const norm = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function wcStats(ds: ReturnType<typeof useData>, name: string) {
  const nm = norm(name);
  let goals = 0, assists = 0, yellow = 0, red = 0, apps = 0;
  ds.allMatches.forEach((m) => {
    if (m.status === "upcoming") return;
    m.scorers.forEach((g) => {
      if (norm(g.name) === nm) goals++;
      if (g.assist && norm(g.assist) === nm) assists++;
    });
    m.cards.forEach((c) => {
      if (norm(c.name) === nm) (c.type === "red" ? red++ : yellow++);
    });
    const inXI = (lu: typeof m.homeLineup) => lu?.lineup?.some((p) => norm(p.name) === nm);
    const cameOn = m.subs.some((s) => norm(s.playerIn || "") === nm);
    if (inXI(m.homeLineup) || inXI(m.awayLineup) || cameOn) apps++;
  });
  return { goals, assists, yellow, red, apps };
}

export function FootballPlayerSheet({ name, espnId, fmId: fmIdProp, ...chrome }: { name: string; espnId?: string | null; fmId?: string | null } & SheetChrome) {
  const db = usePlayersDb();
  const ds = useData();
  const openTeam = useSheets((s) => s.openTeam);
  const p = findPlayer(name, db, espnId);
  // Shared resolver → the SAME picture everywhere this player shows up (bonus page,
  // scorer lists, pitch, this sheet). When opened from a pitch we get the line-up's
  // own FotMob id (recovered by shirt); prefer it so the two ALWAYS match.
  const statsIndex = useStatsIndex();
  const photoSrcs = playerPhotoSources(name, db, statsIndex, espnId, fmIdProp);
  const wc = wcStats(ds, p?.name || name);
  const hasWc = wc.apps > 0 || wc.goals > 0;
  // Fall back to national-team context (flag, team) for stars not yet in players.json.
  const natCode = p ? null : starTeam(name);
  const natTeam = natCode ? ds.teams[natCode] : null;
  const natIso = p ? isoFor(p.nationality, null) : natTeam?.iso || null;
  const a = age(p?.born);

  return (
    <Sheet {...chrome} accent="var(--cool)" maxWidth={520}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <PlayerImg srcs={photoSrcs} name={p?.name || name} size={88} radius={18} fontSize={30} zoomable />
        <div style={{ minWidth: 0 }}>
          <div className="display" style={{ fontSize: 24, lineHeight: 1 }}>{p?.name || name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 8, flexWrap: "wrap" }}>
            {natIso && <Flag iso={natIso} size={16} />}
            {p?.nationality && <span className="dim" style={{ fontSize: 12.5, fontWeight: 700 }}>{p.nationality}</span>}
            {!p && natTeam && <span className="dim" style={{ fontSize: 12.5, fontWeight: 700 }}>{natTeam.name}</span>}
            {p?.position && <span className="chip" style={{ fontSize: 10.5 }}>{p.position}</span>}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <WikiLink query={p?.name || name} />
      </div>

      {p ? (
        <>
          {p.team && (
            <div className="card card-pad" style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12 }}>
              {p.teamBadge && <img src={p.teamBadge} alt="" style={{ width: 38, height: 38, objectFit: "contain" }} onError={(e) => ((e.currentTarget.style.display = "none"))} />}
              <div>
                <div style={{ fontWeight: 800 }}>{p.team}</div>
                <div className="dim" style={{ fontSize: 11.5 }}>{[p.teamLeague, p.teamCountry].filter(Boolean).join(" · ")}</div>
              </div>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(80px,1fr))", gap: 10, marginTop: 14 }}>
            {a != null && <Fact label="Ålder" value={`${a} år`} />}
            {p.height && <Fact label="Längd" value={p.height} />}
            {p.weight && <Fact label="Vikt" value={p.weight} />}
            {p.foot && <Fact label="Fot" value={p.foot} />}
            {p.natJersey && <Fact label="Tröja" value={`#${p.natJersey}`} />}
            {p.birthPlace && <Fact label="Född" value={p.birthPlace} wide />}
          </div>
        </>
      ) : natTeam ? (
        <button className="card card-pad" onClick={() => openTeam(natCode!)} style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left" }}>
          <Flag iso={natTeam.iso} code={natCode} size={34} />
          <div>
            <div style={{ fontWeight: 800 }}>Stjärna i {natTeam.name}</div>
            <div className="dim" style={{ fontSize: 11.5 }}>Mer info kommer när laget spelat sin första match.</div>
          </div>
        </button>
      ) : (
        <div className="dim" style={{ marginTop: 20, fontSize: 13, textAlign: "center" }}>Ingen utökad spelarinfo tillgänglig ännu.</div>
      )}

      {/* WC stats */}
      <div style={{ marginTop: 16 }}>
        <div className="kicker" style={{ marginBottom: 10 }}>I detta VM</div>
        {hasWc ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(72px,1fr))", gap: 10 }}>
            <Fact label="Matcher" value={String(wc.apps)} />
            <Fact label="Mål" value={String(wc.goals)} />
            <Fact label="Assist" value={String(wc.assists)} />
            {wc.yellow > 0 && <Fact label="Gula" value={String(wc.yellow)} />}
            {wc.red > 0 && <Fact label="Röda" value={String(wc.red)} />}
          </div>
        ) : (
          <div className="dim" style={{ fontSize: 12.5 }}>Har inte spelat någon VM-match ännu.</div>
        )}
      </div>

      <PlayerMatchHistory name={p?.name || name} />
    </Sheet>
  );
}

const shortDate = (d?: string) => (d && d.length >= 10 ? `${parseInt(d.slice(8, 10), 10)}/${parseInt(d.slice(5, 7), 10)}` : "");

// Per-match performance from FotMob: a clickable list of every match the player
// has stats for (rating per match), expanding to that match's heatmap/shots/stats.
function PlayerMatchHistory({ name }: { name: string }) {
  const ds = useData();
  const index = useStatsIndex();
  const entry = index?.players[idxNorm(name)];
  const [sel, setSel] = useState<string | null>(null);
  const selId = sel ?? entry?.fx[0]?.id ?? null;
  const stats = useMatchStats(selId); // hook always called (null id is a no-op)
  if (!entry || !entry.fx.length) return null;
  const myTla = stats?.players.find((p) => p.optaId === entry.opta)?.tla ?? null;
  const oppName = (fid: string) => {
    const fx = index!.fixtures[fid];
    if (!fx) return "";
    const opp = myTla ? (myTla === fx.h ? fx.a : fx.h) : fx.a;
    return ds.teams[opp]?.name || opp;
  };
  const selPl = stats?.players.find((p) => p.optaId === entry.opta);
  return (
    <div style={{ marginTop: 18 }}>
      <div className="kicker" style={{ marginBottom: 10 }}>Prestation per match ({entry.fx.length})</div>
      <div style={{ display: "grid", gap: 5, marginBottom: entry.fx.length > 1 ? 14 : 10 }}>
        {entry.fx.map((it) => {
          const fx = index!.fixtures[it.id];
          const on = it.id === selId;
          return (
            <button key={it.id} onClick={() => setSel(it.id)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: 9, width: "100%", textAlign: "left", background: on ? "var(--surface-2)" : "var(--surface)", border: `1px solid ${on ? "var(--line-3)" : "transparent"}` }}>
              {it.r != null && <span className="num" style={{ fontSize: 13, fontWeight: 800, padding: "2px 7px", borderRadius: 7, background: ratingColor(it.r), color: "#0a0712", minWidth: 38, textAlign: "center" }}>{it.r.toFixed(1)}</span>}
              <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>mot {oppName(it.id)}</span>
              <span className="dim" style={{ fontSize: 10.5 }}>{shortDate(fx?.d)}</span>
            </button>
          );
        })}
      </div>
      {stats && <PlayerMatchPanel stats={stats} optaId={entry.opta} subtitle={selPl?.gk ? "Målvakt" : selPl?.pos || undefined} />}
    </div>
  );
}

function Fact({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className="card" style={{ padding: "10px 11px", gridColumn: wide ? "1 / -1" : undefined }}>
      <div className="num" style={{ fontSize: 16 }}>{value}</div>
      <div className="kicker" style={{ fontSize: 8.5, marginTop: 2 }}>{label}</div>
    </div>
  );
}
