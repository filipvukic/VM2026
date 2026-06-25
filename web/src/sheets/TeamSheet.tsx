import { lazy, Suspense, useMemo, useState } from "react";
import { useData, useCoaches, usePlayersDb } from "../state/dataset";
import { useSheets } from "../state/sheets";
import { useMatchStats } from "../state/matchStats";
import { Sheet, type SheetChrome } from "../components/Sheet";
import { GroupTable } from "../components/GroupTable";
import { PlayerImg } from "../components/PlayerImg";
import { Pitch, BenchPlayer } from "../components/Pitch";
import { Flag, groupColor } from "../lib/flags";
import { FormDots } from "../components/FormDots";
import { lineupPhotoSources } from "../lib/playerPhoto";
import { WC_HISTORY, FIFA_RANKING, FIFA_RANKING_DATE, TEAM_DETAILS } from "../data/static/history";
import { svDayMonth } from "../lib/format";

// Heavy (Three.js) — only loaded when a team sheet's globe actually renders.
const CountryGlobe = lazy(() => import("../features/globe/CountryGlobe"));

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
  const [tab, setTab] = useState<"stats" | "squad" | "matches">("stats");

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

      {/* the globe is one of the first things you see */}
      {t.iso && (
        <div style={{ marginTop: 12 }}>
          <Suspense fallback={<div className="card card-pad dim" style={{ textAlign: "center", padding: 28 }}>Laddar klot…</div>}>
            <CountryGlobe iso={t.iso} name={t.name} active={chrome.interactive !== false} />
          </Suspense>
        </div>
      )}

      {/* tabs */}
      <div className="ts-tabs">
        {([["stats", "Statistik"], ["squad", "Trupp"], ["matches", "Matcher"]] as const).map(([id, label]) => (
          <button key={id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      <div key={tab} className="ts-content">
        {tab === "stats" && (
          <>
            {t.group && <GroupTable letter={t.group} highlight={[code]} />}
            <TeamStatsCompare ds={ds} code={code} />
            <div className="card card-pad" style={{ marginTop: 12 }}>
              <div className="kicker" style={{ marginBottom: 8 }}>Form</div>
              <FormDots form={ds.forms[code] || []} />
            </div>
            {hist && (
              <div className="card card-pad" style={{ marginTop: 12 }}>
                <div className="kicker" style={{ marginBottom: 12 }}>VM-historik</div>
                <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
                  <Mini label="VM-titlar" value={String(hist.titles)} hot={hist.titles > 0} />
                  {hist.apps != null && <Mini label="Slutspel" value={String(hist.apps)} />}
                  {hist.best && <div style={{ flex: 1, minWidth: 140 }}><div className="kicker">Bästa resultat</div><div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{hist.best}</div></div>}
                </div>
              </div>
            )}
          </>
        )}

        {tab === "squad" && (
          <>
            {(coachName || detail?.stars) && (
              <div className="card card-pad">
                {coachName && (
                  <button onClick={() => openCoach(code)} style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", textAlign: "left", marginBottom: detail?.stars ? 12 : 0 }}>
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
              </div>
            )}
            <LatestLineup code={code} color={t.c1 || "var(--cool)"} />
          </>
        )}

        {tab === "matches" && (
          <>
            {matches.length > 0 ? (
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
            ) : (
              <div className="dim" style={{ padding: 16, textAlign: "center" }}>Inga matcher ännu.</div>
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
          </>
        )}
      </div>

      <style>{`
        .ts-tabs{ display:flex; gap:4px; margin-top:16px; background:var(--surface); border:1px solid var(--line-2); border-radius:var(--r-pill); padding:3px; }
        .ts-tabs button{ flex:1 1 0; min-width:0; padding:9px 8px; border-radius:var(--r-pill); font-weight:800; font-size:13px; color:var(--ink-3); }
        .ts-tabs button.on{ background:var(--grad-soft); color:#fff; }
        .ts-content{ margin-top:14px; animation:tsIn .26s cubic-bezier(.2,.7,.2,1); }
        @keyframes tsIn{ from{ opacity:0; transform:translateY(6px); } to{ opacity:1; transform:none; } }
      `}</style>
    </Sheet>
  );
}

const ratingNorm = (s: string) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

// The team's most recent match line-up (starting XI + bench) — shows who they have
// and how they set up. Uses FotMob coords/ratings when available (same as the
// match view), else falls back to formation rows.
function LatestLineup({ code, color }: { code: string; color: string }) {
  const ds = useData();
  const openFb = useSheets((s) => s.openFbPlayer);
  const db = usePlayersDb();
  const m = [...ds.allMatches]
    .filter((x) => x.home === code || x.away === code)
    .sort((a, b) => +b.kickoff - +a.kickoff)
    .find((x) => {
      const lu = x.home === code ? x.homeLineup : x.awayLineup;
      return !!lu?.lineup?.length;
    });
  const detail = useMatchStats(m?._realId ?? null);
  if (!m) return null;
  const isHome = m.home === code;
  const rawLu = isHome ? m.homeLineup : m.awayLineup;
  if (!rawLu?.lineup?.length) return null;
  const sideKey = isHome ? "home" : "away";
  const coords = detail?.lineup?.[sideKey];
  const fmFormation = detail?.formations?.[sideKey];
  const lu = fmFormation ? { ...rawLu, formation: fmFormation } : rawLu;

  const rFull = new Map<string, number>(), rLast = new Map<string, number>();
  (detail?.players || []).forEach((p) => {
    if (p.tla !== code || p.rating == null) return;
    const fn = ratingNorm(p.name), ln = ratingNorm((p.name || "").split(" ").slice(-1)[0]);
    rFull.set(fn, p.rating);
    if (ln && !rLast.has(ln)) rLast.set(ln, p.rating);
  });
  const getRating = (name: string): number | null =>
    rFull.get(ratingNorm(name)) ?? rLast.get(ratingNorm((name || "").split(" ").slice(-1)[0])) ?? null;
  // Best rating across the WHOLE match (both teams) — so the blue+star marks the
  // match's player, not just this team's best. If the opponent had the best, none
  // of this team's players gets the star (correct).
  const matchMaxRating = (detail?.players || []).reduce((mx, p) => (p.rating != null && p.rating > mx ? p.rating : mx), 0);
  // shirt → FotMob player id (this team), for the correct/official FotMob photo.
  const fotmobIdByShirt = new Map<string, string>();
  (detail?.players || []).forEach((p) => {
    if (p.tla === code && p.shirt != null && p.fmId) fotmobIdByShirt.set(String(p.shirt).trim(), String(p.fmId));
  });

  const opp = isHome ? m.away : m.home;
  const oppT = opp ? ds.teams[opp] : null;
  const formation = fmFormation || lu.formation;

  const subIn = new Map<string, { at?: string | number; forName?: string }>();
  m.subs.filter((s) => s.team === code).forEach((s) => {
    if (s.playerIn) subIn.set(s.playerIn, { at: s.minute, forName: s.playerOut });
  });
  const goalNames = new Set(m.scorers.map((g) => (g.name || "").toLowerCase()));
  const assistNames = new Set(m.scorers.filter((g) => g.assist).map((g) => (g.assist || "").toLowerCase()));

  return (
    <div style={{ marginTop: 14 }}>
      <div className="kicker" style={{ marginBottom: 6 }}>Senaste laguppställning</div>
      <div className="dim" style={{ fontSize: 12, marginBottom: 10 }}>
        mot {oppT?.name || "?"} · {svDayMonth(m.kickoff)}{formation ? ` · ${formation}` : ""}
      </div>
      <Pitch lineup={lu} color={color} match={m} teamCode={code} onPlayer={openFb} getRating={getRating} coords={coords} motmRating={matchMaxRating} fotmobIdByShirt={fotmobIdByShirt} />
      {lu.bench && lu.bench.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="kicker" style={{ marginBottom: 10 }}>Avbytarbänk</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(82px,1fr))", gap: 10 }}>
            {lu.bench.map((p, i) => {
              const came = subIn.get(p.name);
              const nm = (p.name || "").toLowerCase();
              const benchFmId = fotmobIdByShirt.get(String(p.jersey ?? p.shirtNumber ?? "").trim());
              return (
                <BenchPlayer
                  key={i}
                  p={p}
                  photos={lineupPhotoSources(p.name, p.espnId, db, benchFmId)}
                  rating={getRating(p.name)}
                  goals={goalNames.has(nm) ? 1 : 0}
                  assists={assistNames.has(nm) ? 1 : 0}
                  cameAt={came?.at}
                  forName={came?.forName}
                  motm={matchMaxRating > 0 && getRating(p.name) === matchMaxRating}
                  onClick={() => openFb(p.name, p.espnId, benchFmId)}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface Agg { played: number; gf: number; ga: number; possSum: number; possN: number; shots: number; shotsN: number; xgSum: number; xgN: number; w: number; d: number; l: number }
// Aggregate every WC team's stats over its PLAYED matches (oriented per team), so we
// can both show a team's numbers AND rank it against the rest of the tournament.
function allTeamAggs(ds: ReturnType<typeof useData>): Record<string, Agg> {
  const agg: Record<string, Agg> = {};
  const get = (c: string) => (agg[c] ||= { played: 0, gf: 0, ga: 0, possSum: 0, possN: 0, shots: 0, shotsN: 0, xgSum: 0, xgN: 0, w: 0, d: 0, l: 0 });
  ds.allMatches.forEach((m) => {
    if (m.status !== "played" || m.ga == null || m.gb == null) return;
    ([[m.home, 0], [m.away, 1]] as const).forEach(([code, idx]) => {
      if (!code) return;
      const a = get(code);
      const my = idx === 0 ? m.ga! : m.gb!, opp = idx === 0 ? m.gb! : m.ga!;
      a.played++; a.gf += my; a.ga += opp;
      if (my > opp) a.w++; else if (my < opp) a.l++; else a.d++;
      const s = m.stats;
      if (s) {
        if (s.poss?.[idx] != null) { a.possSum += s.poss[idx]; a.possN++; }
        if (s.shots?.[idx] != null) { a.shots += s.shots[idx]; a.shotsN++; }
      }
      if (m.xg && m.xg[idx] != null) { a.xgSum += m.xg[idx]!; a.xgN++; }
    });
  });
  return agg;
}

// Team stats with the team's RANK among all WC teams that have played — "#2 av 24".
function TeamStatsCompare({ ds, code }: { ds: ReturnType<typeof useData>; code: string }) {
  const aggs = useMemo(() => allTeamAggs(ds), [ds]);
  const me = aggs[code];
  if (!me || me.played === 0) return null;
  const codes = Object.keys(aggs).filter((c) => aggs[c].played > 0);
  // rank `code` by metric(agg) (best first); lowerBetter for "conceded". null metric skips.
  const rankOf = (metric: (a: Agg) => number | null, lowerBetter = false) => {
    const vals = codes.map((c) => ({ c, v: metric(aggs[c]) })).filter((x) => x.v != null) as { c: string; v: number }[];
    vals.sort((a, b) => (lowerBetter ? a.v - b.v : b.v - a.v));
    const i = vals.findIndex((x) => x.c === code);
    return i < 0 ? null : { rank: i + 1, of: vals.length };
  };
  const avgPoss = (a: Agg) => (a.possN ? a.possSum / a.possN : null);
  const shotsPg = (a: Agg) => (a.shotsN ? a.shots / a.shotsN : null);

  const rows: { label: string; value: string; r: { rank: number; of: number } | null; hot?: boolean }[] = [
    { label: "Mål gjorda", value: String(me.gf), r: rankOf((a) => a.gf), hot: true },
    { label: "Insläppta mål", value: String(me.ga), r: rankOf((a) => a.ga, true) },
  ];
  if (me.possN) rows.push({ label: "Bollinnehav (snitt)", value: `${Math.round(me.possSum / me.possN)}%`, r: rankOf(avgPoss) });
  if (me.shotsN) rows.push({ label: "Skott per match", value: (me.shots / me.shotsN).toFixed(1), r: rankOf(shotsPg) });
  if (me.xgN) rows.push({ label: "xG totalt", value: me.xgSum.toFixed(1), r: rankOf((a) => (a.xgN ? a.xgSum : null)) });

  const medal = (rank: number) => (rank === 1 ? "var(--gold)" : rank === 2 ? "#cfd6e6" : rank === 3 ? "#e8965a" : "var(--ink-3)");
  return (
    <div className="card card-pad" style={{ marginTop: 12 }}>
      <div className="section-head" style={{ margin: "0 0 12px" }}>
        <div className="kicker">Statistik · plats i VM</div>
        <span className="dim" style={{ fontSize: 10.5 }}>{me.w}V {me.d}O {me.l}F · {me.played} matcher</span>
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {rows.map((row) => (
          <div key={row.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="dim" style={{ flex: 1, fontSize: 12.5, fontWeight: 700 }}>{row.label}</span>
            <span className="num" style={{ fontSize: 17, fontWeight: 800, color: row.hot ? "var(--gold)" : "var(--ink)", minWidth: 34, textAlign: "right" }}>{row.value}</span>
            {row.r && (
              <span className="num" title={`Plats ${row.r.rank} av ${row.r.of} lag`} style={{ flex: "0 0 auto", width: 58, textAlign: "right", fontSize: 12, fontWeight: 800, color: medal(row.r.rank) }}>
                #{row.r.rank}<span className="dim" style={{ fontWeight: 700 }}>/{row.r.of}</span>
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="dim" style={{ fontSize: 10, marginTop: 10 }}>#-platsen = lagets ranking bland alla VM-lag som spelat.</div>
    </div>
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
