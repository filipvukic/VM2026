import { lazy, Suspense } from "react";
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

      {/* 3D globe + country facts */}
      {t.iso && (
        <div style={{ marginTop: 14 }}>
          <Suspense fallback={<div className="card card-pad dim" style={{ textAlign: "center", padding: 28 }}>Laddar klot…</div>}>
            <CountryGlobe iso={t.iso} name={t.name} active={chrome.interactive !== false} />
          </Suspense>
        </div>
      )}

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

      <LatestLineup code={code} color={t.c1 || "var(--cool)"} />

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

function Mini({ label, value, hot }: { label: string; value: string; hot?: boolean }) {
  return (
    <div>
      <div className="num" style={{ fontSize: 24, color: hot ? "var(--gold)" : "var(--ink)" }}>{value}</div>
      <div className="kicker">{label}</div>
    </div>
  );
}
