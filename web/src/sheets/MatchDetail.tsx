import { useState } from "react";
import { useData, usePlayersDb, useCoaches } from "../state/dataset";
import { useSheets } from "../state/sheets";
import { Sheet, type SheetChrome } from "../components/Sheet";
import { Pitch, BenchPlayer } from "../components/Pitch";
import { GroupTable } from "../components/GroupTable";
import { PlayerImg } from "../components/PlayerImg";
import { Avatar } from "../components/Avatar";
import { lineupPhotoSources } from "../lib/playerPhoto";
import { liveMinuteText } from "../lib/liveMinute";
import { isLive } from "../lib/liveState";
import { useNow } from "../state/useNow";
import { useMatchStats, liveStatsUrl } from "../state/matchStats";
import { PlayerMatchPanel } from "../components/PlayerMatchPanel";
import { Shotmap } from "../components/Shotmap";
import { ratingColor } from "../lib/rating";
import { Flag, groupColor } from "../lib/flags";
import { TLA_TO_ISO, NAME_TO_ISO } from "../data/static/names";
import { TEAM_DETAILS } from "../data/static/history";
import { broadcastForPair } from "../data/static/broadcasts";
import { svFullDate, svTime } from "../lib/format";
import { winChance, winChanceFromEspn } from "../data/odds";
import { useFixtureOdds } from "../state/fixtureOdds";
import { classifyTip, type TipResult } from "../data/scoring";
import { reg90Score } from "../lib/reg90";
import { useKoBets, koFid } from "../state/koBets";
import type { Dataset, Match, MatchStats } from "../data/types";

// Points each team gets from THIS match (3 win / 1 draw / 0 loss) — shown in the
// group table tab so you see how the match shifts the standings.
function matchDeltas(m: Match): Record<string, number> | undefined {
  if ((m.status !== "played" && m.status !== "live") || m.ga == null || m.gb == null || !m.home || !m.away) return undefined;
  const hp = m.ga > m.gb ? 3 : m.ga < m.gb ? 0 : 1;
  const ap = m.gb > m.ga ? 3 : m.gb < m.ga ? 0 : 1;
  return { [m.home]: hp, [m.away]: ap };
}

function venueIso(v?: Match["venue"]): string | null {
  if (!v) return null;
  if (v.cc && TLA_TO_ISO[v.cc.toUpperCase()]) return TLA_TO_ISO[v.cc.toUpperCase()];
  const c = (v.country || "").toLowerCase();
  if (c === "usa" || c === "united states") return "us";
  if (c === "mexico" || c === "mexiko") return "mx";
  if (c === "canada" || c === "kanada") return "ca";
  return NAME_TO_ISO[c] || null;
}

type Tab = "overview" | "lineup" | "stats" | "table" | "tips";

export function MatchDetail({ id, ...chrome }: { id: string } & SheetChrome) {
  const ds = useData();
  const openTeam = useSheets((s) => s.openTeam);
  const m = ds.allMatches.find((x) => x.id === id);
  // Open straight on everyone's tips — that's the first thing you want to see for a
  // match, whether it's about to be played or already finished. (Match overview /
  // events are one tap away.)
  // KO matches are tippable per-person (slutspelstips) even before the engine merges
  // everyone's tips — so the Tips tab is the default for them too, showing your bet.
  const isKoTippable = !!m && m.stage === "ko" && !!m._realId;
  const wantTips = !!m && ((m.tippas && m.tips.length > 0) || isKoTippable);
  const [tab, setTab] = useState<Tab>(wantTips ? "tips" : "overview");
  const now = useNow(m && isLive(m) ? 30_000 : 0);
  if (!m) return null;

  const home = m.home ? ds.teams[m.home] : null;
  const away = m.away ? ds.teams[m.away] : null;
  const accent = m.group ? groupColor(m.group) : "var(--cool)";
  const live = isLive(m);
  const played = m.status === "played" || (m.status === "live" && !!m.likelyEnded);
  const vIso = venueIso(m.venue);
  // Where to watch on Swedish TV — only useful before/while it airs, not after.
  const bc = !played ? broadcastForPair(m.home, m.away, home?.name, away?.name, m.fifa) : null;

  const hasPitch = !!(m.homeLineup?.lineup?.length || m.awayLineup?.lineup?.length);
  const hasStats = !!m.stats || played || live; // detailed FotMob stats load async too
  const hasTips = (m.tippas && m.tips.length > 0) || isKoTippable;
  const hasTable = m.stage === "group" && !!m.group;
  // Tips first (it's the default + what you most want to see), then the rest. Short
  // labels so all visible tabs fit the sheet width with no horizontal scroll.
  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: "tips", label: "Tips", show: hasTips },
    { id: "overview", label: "Match", show: true },
    { id: "lineup", label: "Elva", show: hasPitch },
    { id: "stats", label: "Stats", show: hasStats },
    { id: "table", label: "Tabell", show: hasTable },
  ];

  return (
    <Sheet {...chrome} accent={accent}>
      {/* hero */}
      <div style={{ textAlign: "center" }}>
        <div className="kicker" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          {vIso && <Flag iso={vIso} size={13} />}
          {m.stage === "group" ? `Grupp ${m.group}` : m.round} · {svFullDate(m.kickoff)}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 14 }}>
          <TeamHead code={m.home} name={home?.name || m.fromA} iso={home?.iso} onClick={() => m.home && openTeam(m.home)} />
          <div style={{ minWidth: 92 }}>
            {played || live ? (
              <div className="num" style={{ fontSize: 46, lineHeight: 1, color: live ? "var(--hot)" : "var(--ink)" }}>
                {m.ga ?? 0}<span style={{ opacity: 0.3 }}>:</span>{m.gb ?? 0}
              </div>
            ) : (
              <div className="num" style={{ fontSize: 30 }}>{svTime(m.kickoff)}</div>
            )}
            {m.pen && <div className="dim" style={{ fontSize: 11, fontWeight: 800 }}>straffar {m.pen[0]}–{m.pen[1]}</div>}
            <div style={{ marginTop: 6 }}>
              {live ? <span className="live-pill"><span className="live-dot" />{liveMinuteText(m, ds.updatedAt ? new Date(ds.updatedAt).getTime() : null, now)}</span>
                : played ? <span className="chip">Slutspelad</span>
                : <span className="chip">Avspark {svTime(m.kickoff)}</span>}
            </div>
          </div>
          <TeamHead code={m.away} name={away?.name || m.fromB} iso={away?.iso} onClick={() => m.away && openTeam(m.away)} />
        </div>
        {m.venue?.stadium && (
          <div className="dim" style={{ fontSize: 12, marginTop: 12, display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
            {vIso && <Flag iso={vIso} size={12} />}
            {m.venue.stadium}{m.venue.city ? `, ${m.venue.city}` : ""}{m.attendance ? ` · ${m.attendance.toLocaleString("sv-SE")} i publiken` : ""}
          </div>
        )}
        {bc && !bc.tv4Url && (
          <div style={{ marginTop: 14 }}>
            <a className="md-tv" href={bc.url} target="_blank" rel="noopener noreferrer">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2.5" y="7" width="19" height="12.5" rx="2" /><path d="M8 3.2l4 3.8 4-3.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Visas på <b>{bc.label}</b></span>
              {bc.free && <span className="md-tv-free">GRATIS</span>}
              <span className="md-tv-go">Öppna ›</span>
            </a>
          </div>
        )}
        {bc && bc.tv4Url && (
          // Knockout: rights are split SVT/TV4 with no per-match listing, so offer both
          // (SVT link = a search on the two teams; TV4 = its WC hub).
          <div style={{ marginTop: 14 }}>
            <div className="kicker" style={{ marginBottom: 7 }}>Visas på SVT eller TV4 · slutspel</div>
            <div style={{ display: "flex", gap: 8 }}>
              <a className="md-tv" href={bc.url} target="_blank" rel="noopener noreferrer" style={{ flex: 1 }}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2.5" y="7" width="19" height="12.5" rx="2" /><path d="M8 3.2l4 3.8 4-3.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                <span><b>SVT Play</b></span>
                <span className="md-tv-free">GRATIS</span>
                <span className="md-tv-go">›</span>
              </a>
              <a className="md-tv" href={bc.tv4Url} target="_blank" rel="noopener noreferrer" style={{ flex: 1 }}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2.5" y="7" width="19" height="12.5" rx="2" /><path d="M8 3.2l4 3.8 4-3.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                <span><b>TV4 Play</b></span>
                <span className="md-tv-go">›</span>
              </a>
            </div>
          </div>
        )}
      </div>

      {/* tabs */}
      {tabs.filter((t) => t.show).length > 1 && (
        <div className="md-tabs">
          {tabs.filter((t) => t.show).map((t) => (
            <button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>
      )}

      <div key={tab} className="md-tab-content" style={{ marginTop: 14 }}>
        {tab === "overview" && <Overview m={m} />}
        {tab === "lineup" && <PitchTab m={m} ds={ds} />}
        {tab === "stats" && <StatsTab m={m} ds={ds} />}
        {tab === "table" && m.group && (
          <div>
            <div className="kicker" style={{ marginBottom: 8 }}>Tabell · Grupp {m.group}</div>
            <GroupTable letter={m.group} highlight={[m.home, m.away]} deltas={matchDeltas(m)} />
            {(played || live) && (
              <div className="dim" style={{ fontSize: 11, marginTop: 8, textAlign: "center" }}>
                +X = poäng {live ? "som matchen ger just nu" : "den här matchen gav"}
              </div>
            )}
          </div>
        )}
        {tab === "tips" && (
          <>
            {isKoTippable && <KoTipBlock m={m} ds={ds} />}
            {m.tippas && m.tips.length > 0 ? (
              <PoolResults m={m} ds={ds} />
            ) : !isKoTippable ? (
              <div className="dim" style={{ padding: 16, textAlign: "center" }}>Inga tips för den här matchen.</div>
            ) : null}
          </>
        )}
      </div>

      <style>{`
        .md-tabs{ display:flex; gap:4px; margin-top:18px; background:var(--surface); border:1px solid var(--line-2); border-radius:var(--r-pill); padding:3px; }
        /* flex:1 1 0 + min-width:0 → every tab shares the width and shrinks to fit,
           so all of them stay on one row instead of scrolling off the side. */
        .md-tabs button{ flex:1 1 0; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; padding:8px 6px; border-radius:var(--r-pill); font-weight:800; font-size:12.5px; color:var(--ink-3); }
        .md-tabs button.on{ background:var(--grad-soft); color:#fff; }
        .md-tv{ display:inline-flex; align-items:center; gap:8px; padding:7px 13px; border-radius:var(--r-pill); background:var(--surface); border:1px solid var(--line-2); font-size:12.5px; font-weight:700; color:var(--ink-2); }
        .md-tv:hover{ background:var(--surface-2); }
        .md-tv b{ color:var(--ink); }
        .md-tv-free{ color:var(--win); font-weight:800; font-size:10px; letter-spacing:.04em; }
        .md-tv-go{ color:var(--cool-2); font-weight:800; }
        .md-tab-content{ animation:tabIn .26s cubic-bezier(.2,.7,.2,1); }
        @keyframes tabIn{ from{ opacity:0; transform:translateY(6px); } to{ opacity:1; transform:none; } }
        .ko-tip{ background:var(--surface); border:1px solid var(--line-2); border-radius:var(--r-lg); padding:13px 14px; margin-bottom:14px; }
        .ko-tip-head{ display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
        .ko-tip-edit{ color:var(--cool-2); font-weight:800; font-size:12px; }
        .ko-tip-row{ display:flex; align-items:center; gap:9px; padding:9px 11px; border-radius:11px; background:var(--surface-2); border:1px solid var(--line); }
        .ko-tip-nm{ flex:1; min-width:0; font-weight:700; font-size:12.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .ko-tip-nm.right{ text-align:right; }
        .ko-tip-sc{ font-size:18px; font-weight:800; font-variant-numeric:tabular-nums; flex:0 0 auto; }
        .ko-tip-cta{ width:100%; padding:12px; border-radius:11px; background:var(--grad-soft); color:#fff; font-weight:800; font-size:13.5px; }
        .ko-tip-res{ font-weight:800; font-size:12.5px; margin-top:9px; }
        .ko-tip-note{ font-size:11px; line-height:1.45; margin-top:10px; }
        .ko-tip-note b{ color:var(--ink-2); }
      `}</style>
    </Sheet>
  );
}

function TeamHead({ code, name, iso, onClick }: { code: string | null; name?: string | null; iso?: string | null; onClick: () => void }) {
  return (
    <button onClick={code ? onClick : undefined} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, cursor: code ? "pointer" : "default", minWidth: 0 }}>
      <Flag iso={iso} code={code} size={46} />
      <span style={{ fontWeight: 800, fontSize: 14.5, lineHeight: 1.1 }}>{name || "TBD"}</span>
    </button>
  );
}

// ---------- Overview: chronological event list + win chance ----------
function Overview({ m }: { m: Match }) {
  const ds = useData();
  const openFb = useSheets((s) => s.openFbPlayer);
  const events = buildTimeline(m);
  return (
    <>
      {events.length > 0 ? (
        <Block title={isLive(m) ? "Händelser · live" : "Händelser"}>
          <div className="ev">
            {events.map((e, i) => {
              const t = e.team ? ds.teams[e.team] : null;
              return (
                <button
                  key={i}
                  className={`ev-row${e.kind === "goal" ? " goal" : ""}${e.player ? " tap" : ""}`}
                  onClick={() => e.player && openFb(e.player)}
                  disabled={!e.player}
                >
                  <span className="ev-min num">{e.minute}</span>
                  <span className="ev-ico">{e.icon}</span>
                  <Flag iso={t?.iso} code={e.team} size={15} />
                  <span className="ev-txt">
                    <span className="ev-main">{e.main}</span>
                    {e.sub && <span className="ev-sub dim">{e.sub}</span>}
                  </span>
                  {e.kind === "goal" && e.score && (
                    <span className="ev-score num">{e.score[0]}–{e.score[1]}</span>
                  )}
                  {e.player && (
                    <svg className="ev-go" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  )}
                </button>
              );
            })}
          </div>
        </Block>
      ) : (
        <div className="dim" style={{ textAlign: "center", padding: "10px 0 18px", fontSize: 13 }}>
          {m.status === "upcoming" ? "Matchen har inte börjat." : "Inga händelser ännu."}
        </div>
      )}
      <WinChanceBlock m={m} />
      <style>{`
        .ev{ display:flex; flex-direction:column; gap:2px; }
        .ev-row{ display:flex; align-items:center; gap:10px; padding:8px; border-radius:10px; width:100%; text-align:left; }
        .ev-row.tap{ cursor:pointer; transition:background .12s; }
        .ev-row.tap:hover{ background:var(--surface-2); }
        .ev-row.goal{ background:color-mix(in srgb, var(--gold) 10%, transparent); }
        .ev-row.goal.tap:hover{ background:color-mix(in srgb, var(--gold) 17%, transparent); }
        .ev-min{ flex:0 0 auto; width:36px; text-align:right; color:var(--ink-3); font-size:12.5px; }
        .ev-ico{ flex:0 0 auto; width:18px; text-align:center; font-size:14px; }
        .ev-txt{ flex:1; min-width:0; display:flex; flex-direction:column; }
        .ev-main{ font-weight:700; font-size:13.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .ev-row.goal .ev-main{ font-weight:800; }
        .ev-sub{ font-size:11px; }
        .ev-score{ flex:0 0 auto; font-size:14px; font-weight:800; color:var(--ink); padding:2px 9px; border-radius:7px; background:var(--surface-3); }
        .ev-go{ flex:0 0 auto; color:var(--ink-3); }
      `}</style>
    </>
  );
}

interface TLEvent { minute: string; team: string | null; icon: string; main: string; sub?: string; kind: "goal" | "card" | "sub"; score?: [number, number] | null; player?: string; order: number }
function buildTimeline(m: Match): TLEvent[] {
  const ev: TLEvent[] = [];
  // "45+5" → 45.05 so stoppage-time events sort within their minute (not collapsed
  // to 45). Event-type offsets are tiny so they only break exact ties.
  const min = (x?: string | number) => {
    const mt = String(x ?? "0").match(/^(\d+)(?:\+(\d+))?/);
    if (!mt) return 0;
    return parseInt(mt[1], 10) + (mt[2] ? parseInt(mt[2], 10) / 100 : 0);
  };
  m.scorers.forEach((g) =>
    ev.push({ minute: `${g.minute}'`, team: g.team, icon: "⚽", main: `${g.name}${g.pen ? " (straff)" : ""}`, sub: g.assist ? `Assist: ${g.assist}` : undefined, kind: "goal", score: g.score, player: g.name, order: min(g.minute) })
  );
  m.cards.forEach((c) =>
    ev.push({ minute: `${c.minute}'`, team: c.team, icon: c.type === "red" ? "🟥" : "🟨", main: c.name, kind: "card", player: c.name, order: min(c.minute) + 0.001 })
  );
  m.subs.forEach((s) =>
    ev.push({ minute: `${s.minute}'`, team: s.team, icon: "🔁", main: s.playerIn || "", sub: s.playerOut ? `Ut: ${s.playerOut}` : undefined, kind: "sub", player: s.playerIn, order: min(s.minute) + 0.002 })
  );
  return ev.sort((a, b) => a.order - b.order);
}

// ---------- Pitch tab ----------
const ratingNorm = (s: string) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

function PitchTab({ m, ds }: { m: Match; ds: Dataset }) {
  const openFb = useSheets((s) => s.openFbPlayer);
  const openCoach = useSheets((s) => s.openCoach);
  const coaches = useCoaches();
  const db = usePlayersDb();
  const detail = useMatchStats(m._realId ?? null, isLive(m), liveStatsUrl(m, ds.teams));
  const [side, setSide] = useState<"h" | "a">("h");
  const rawLu = side === "h" ? m.homeLineup : m.awayLineup;
  const code = side === "h" ? m.home : m.away;
  // FotMob ratings for this team's players, matched by name (full → surname).
  const { rFull, rLast } = (() => {
    const rFull = new Map<string, number>(), rLast = new Map<string, number>();
    (detail?.players || []).forEach((p) => {
      if (p.tla !== code || p.rating == null) return;
      const fn = ratingNorm(p.name), ln = ratingNorm((p.name || "").split(" ").slice(-1)[0]);
      rFull.set(fn, p.rating);
      if (ln && !rLast.has(ln)) rLast.set(ln, p.rating);
    });
    return { rFull, rLast };
  })();
  const getRating = (name: string): number | null =>
    rFull.get(ratingNorm(name)) ?? rLast.get(ratingNorm((name || "").split(" ").slice(-1)[0])) ?? null;
  // Highest rating across the WHOLE match (both teams) → the one player of the
  // match. Passed to the pitch/bench so the blue+star marks the match's best, not
  // merely this team's best.
  const matchMaxRating = (detail?.players || []).reduce((mx, p) => (p.rating != null && p.rating > mx ? p.rating : mx), 0);
  // shirt → FotMob player id (this team), for the correct/official FotMob photo.
  const fotmobIdByShirt = new Map<string, string>();
  (detail?.players || []).forEach((p) => {
    if (p.tla === code && p.shirt != null && p.fmId) fotmobIdByShirt.set(String(p.shirt).trim(), String(p.fmId));
  });
  // FotMob formation + exact coords are accurate (ESPN's is often wrong, e.g.
  // 3-1-4-2 vs 3-4-1-2). Prefer the FotMob coords for placement.
  const fmFormation = detail?.formations?.[side === "h" ? "home" : "away"];
  const coords = detail?.lineup?.[side === "h" ? "home" : "away"];
  const lu: typeof rawLu = rawLu && fmFormation ? { ...rawLu, formation: fmFormation } : rawLu;
  const t = code ? ds.teams[code] : null;
  if (!lu?.lineup?.length && !coords?.length) return <div className="dim" style={{ padding: 16, textAlign: "center" }}>Laguppställning saknas.</div>;
  const coachRec = code ? coaches?.[code] : null;
  const coach = coachRec?.name || lu?.coach || (code ? TEAM_DETAILS[code]?.coach : null);
  const coachPhoto = coachRec?.photo || null;

  // who came on (bench player → minute + replaced)
  const subIn = new Map<string, { at?: string | number; forName?: string }>();
  m.subs.filter((s) => s.team === code).forEach((s) => {
    if (s.playerIn) subIn.set(s.playerIn, { at: s.minute, forName: s.playerOut });
  });
  const goalNames = new Set(m.scorers.map((g) => (g.name || "").toLowerCase()));
  const assistNames = new Set(m.scorers.filter((g) => g.assist).map((g) => (g.assist || "").toLowerCase()));

  return (
    <div>
      <div style={{ display: "flex", margin: "0 auto 14px", width: "fit-content", background: "var(--surface)", border: "1px solid var(--line-2)", borderRadius: 999, padding: 3 }}>
        {(["h", "a"] as const).map((s) => {
          const tt = (s === "h" ? m.home : m.away) ? ds.teams[(s === "h" ? m.home : m.away)!] : null;
          return (
            <button key={s} onClick={() => setSide(s)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 14px", borderRadius: 999, fontWeight: 800, fontSize: 12.5, background: side === s ? "var(--surface-3)" : "transparent", color: side === s ? "var(--ink)" : "var(--ink-3)" }}>
              <Flag iso={tt?.iso} size={16} />{tt?.name || (s === "h" ? "Hemma" : "Borta")}
            </button>
          );
        })}
      </div>
      {coach ? (
        <button className="card" onClick={() => code && openCoach(code)} style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 12px", marginBottom: 12, width: "100%", textAlign: "left" }}>
          {coachPhoto ? <PlayerImg src={coachPhoto} name={coach} size={38} radius={50} fontSize={14} /> : <Avatar name={coach} color={t?.c1 || "var(--cool)"} size={38} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="kicker" style={{ fontSize: 9 }}>Förbundskapten ›</div>
            <div style={{ fontWeight: 800, fontSize: 14 }}>{coach}</div>
          </div>
          {(fmFormation || lu?.formation) && <span className="chip">{fmFormation || lu?.formation}</span>}
        </button>
      ) : (
        (fmFormation || lu?.formation) && <div style={{ textAlign: "center", marginBottom: 12 }}><span className="chip">Formation {fmFormation || lu?.formation}</span></div>
      )}
      <Pitch lineup={lu || { lineup: [] }} color={t?.c1 || "var(--cool)"} match={m} teamCode={code} onPlayer={openFb} getRating={getRating} coords={coords} motmRating={matchMaxRating} fotmobIdByShirt={fotmobIdByShirt} />
      {lu?.bench && lu.bench.length > 0 && (
        <div style={{ marginTop: 18 }}>
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

// ---------- Stats tab ----------
function StatsTab({ m, ds }: { m: Match; ds: Dataset }) {
  const detail = useMatchStats(m._realId ?? null, isLive(m), liveStatsUrl(m, ds.teams));
  const [sel, setSel] = useState<string | null>(null);
  const live = isLive(m);
  const home = m.home ? ds.teams[m.home] : null;
  const away = m.away ? ds.teams[m.away] : null;

  if (detail) {
    if (sel) {
      return (
        <div className="card card-pad" style={{ marginTop: 14 }}>
          <button onClick={() => setSel(null)} className="dim" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, marginBottom: 12 }}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Alla spelare
          </button>
          <PlayerMatchPanel stats={detail} optaId={sel} />
        </div>
      );
    }
    const ranked = detail.players.filter((p) => p.rating != null);
    const motm = ranked[0]; // highest-rated = FotMob's player of the match
    const motmTeam = motm?.tla ? ds.teams[motm.tla] : null;
    return (
      <>
        {motm && (
          <button onClick={() => setSel(motm.optaId)} className="card" style={{ marginTop: 14, width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", textAlign: "left", background: "linear-gradient(120deg, color-mix(in srgb,var(--gold) 16%, var(--surface)), var(--surface))", border: "1px solid color-mix(in srgb,var(--gold) 30%, var(--line-2))" }}>
            <span className="num" style={{ fontSize: 19, fontWeight: 800, padding: "5px 11px", borderRadius: 10, background: ratingColor(motm.rating!), color: "#0a0712", minWidth: 50, textAlign: "center" }}>{motm.rating!.toFixed(1)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="kicker" style={{ color: "var(--gold)", fontSize: 9.5 }}>⭐ Matchens spelare</div>
              <div style={{ fontWeight: 800, fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{motm.name}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                <Flag iso={motmTeam?.iso} code={motm.tla} size={13} />
                <span className="dim" style={{ fontSize: 11 }}>{motmTeam?.name || motm.tla}{motm.gk ? " · MV" : motm.pos ? ` · ${motm.pos}` : ""}</span>
              </div>
            </div>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--ink-3)" strokeWidth="2.4"><path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        )}

        {/* Team stats: a LIVE match uses the fresh ESPN overlay (updates ~every
            minute); a finished match uses FotMob's richer final figures. */}
        {live && m.stats ? (
          <MatchStatsBars m={m} ds={ds} />
        ) : detail.team.length > 0 ? (
          <div className="card card-pad" style={{ marginTop: 14 }}>
            <StatTeamsHeader home={home} away={away} homeCode={m.home} awayCode={m.away} label="Lagstatistik" />
            {detail.team.map((t) => <DetailBar key={t.key} label={t.label} h={t.home} a={t.away} />)}
          </div>
        ) : null}

        {detail.shots.length > 0 && (
          <Block title="Skottkarta">
            <Shotmap shots={detail.shots} homeTla={detail.homeTla} />
          </Block>
        )}

        {ranked.length > 0 && (
          <div className="card card-pad" style={{ marginTop: 14 }}>
            <div className="kicker" style={{ marginBottom: 10 }}>Spelarbetyg — tryck för heatmap & statistik</div>
            <div style={{ display: "grid", gap: 5 }}>
              {ranked.map((p) => {
                const t = p.tla ? ds.teams[p.tla] : null;
                return (
                  <button key={p.optaId} onClick={() => setSel(p.optaId)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 9px", borderRadius: 9, background: "var(--surface)", width: "100%", textAlign: "left" }}>
                    <span className="num" style={{ fontSize: 13.5, fontWeight: 800, padding: "2px 7px", borderRadius: 7, background: ratingColor(p.rating!), color: "#0a0712", minWidth: 38, textAlign: "center" }}>{p.rating!.toFixed(1)}</span>
                    <Flag iso={t?.iso} code={p.tla} size={15} />
                    <span style={{ flex: 1, fontWeight: 700, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
                    <span className="dim" style={{ fontSize: 10.5 }}>{p.gk ? "MV" : p.pos || ""}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </>
    );
  }

  return <MatchStatsBars m={m} ds={ds} />;
}

// Team-comparison bars from the (possibly live) match-level stats — used for live
// matches in the Stats tab and as the fallback when FotMob detail isn't loaded.
function MatchStatsBars({ m, ds }: { m: Match; ds: Dataset }) {
  const home = m.home ? ds.teams[m.home] : null;
  const away = m.away ? ds.teams[m.away] : null;
  if (!m.stats) return <div className="card card-pad" style={{ marginTop: 14 }}><div className="dim" style={{ fontSize: 12.5 }}>Detaljerad statistik dyker upp när matchen analyserats.</div></div>;
  const s = m.stats as MatchStats;
  const ri = (x: number | null) => (x == null ? null : Math.round(x)); // integer
  // Possession: round and force the pair to sum to 100 (no decimals).
  let possH: number | null = null,
    possA: number | null = null;
  if (s.poss[0] != null || s.poss[1] != null) {
    possH = Math.round(s.poss[0] ?? 100 - (s.poss[1] ?? 50));
    possA = 100 - possH;
  }
  const rows: [string, number | null, number | null][] = [
    ...((m.xg ? [["xG (förväntade mål)", m.xg[0], m.xg[1]]] : []) as [string, number | null, number | null][]),
    ["Bollinnehav %", possH, possA],
    ["Skott", ri(s.shots[0]), ri(s.shots[1])],
    ["Skott på mål", ri(s.sot[0]), ri(s.sot[1])],
    ["Hörnor", ri(s.corners[0]), ri(s.corners[1])],
    ["Räddningar", ri(s.saves[0]), ri(s.saves[1])],
    ["Passningar %", ri(s.pass[0]), ri(s.pass[1])],
    ["Brytningar", ri(s.interceptions[0]), ri(s.interceptions[1])],
    ["Tacklingar", ri(s.tackles[0]), ri(s.tackles[1])],
    ["Offside", ri(s.offsides[0]), ri(s.offsides[1])],
    ["Frisparkar", ri(s.fouls[0]), ri(s.fouls[1])],
    ["Gula kort", ri(s.yellow[0]), ri(s.yellow[1])],
    ["Röda kort", ri(s.red[0]), ri(s.red[1])],
  ];
  const shown = rows.filter(([, h, a]) => h != null || a != null);
  return (
    <div className="card card-pad" style={{ marginTop: 14 }}>
      <StatTeamsHeader home={home} away={away} homeCode={m.home} awayCode={m.away} label="Statistik" />
      {shown.length ? (
        shown.map(([label, h, a]) => <StatBar key={label} label={label} h={h ?? 0} a={a ?? 0} />)
      ) : (
        <div className="dim" style={{ fontSize: 12.5 }}>Ingen statistik tillgänglig för matchen ännu.</div>
      )}
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card card-pad" style={{ marginTop: 14 }}>
      <div className="kicker" style={{ marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

// Header for the team-stats card: flag + name on each side, label centred. Uses a
// 1fr/auto/1fr grid with min-width:0 so a long national-team name wraps onto two
// lines instead of overflowing the card or shoving the centre label off (the old
// flex+space-between did the latter for names like "Bosnia-Hercegovina").
function StatTeamsHeader({ home, away, homeCode, awayCode, label }: {
  home: { iso?: string | null; name?: string } | null;
  away: { iso?: string | null; name?: string } | null;
  homeCode: string | null;
  awayCode: string | null;
  label: string;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 8, marginBottom: 14 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0, fontWeight: 800, fontSize: 13 }}>
        <Flag iso={home?.iso} code={homeCode} size={20} />
        <span style={{ minWidth: 0, lineHeight: 1.15, overflowWrap: "anywhere" }}>{home?.name}</span>
      </span>
      <span className="kicker" style={{ whiteSpace: "nowrap" }}>{label}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0, fontWeight: 800, fontSize: 13, flexDirection: "row-reverse", textAlign: "right" }}>
        <Flag iso={away?.iso} code={awayCode} size={20} />
        <span style={{ minWidth: 0, lineHeight: 1.15, overflowWrap: "anywhere" }}>{away?.name}</span>
      </span>
    </div>
  );
}

function StatBar({ label, h, a }: { label: string; h: number; a: number }) {
  const total = h + a || 1;
  const hp = (h / total) * 100;
  const lead = h === a ? "" : h > a ? "h" : "a";
  return (
    <div style={{ marginBottom: 11 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
        <span className="num" style={{ color: lead === "h" ? "var(--ink)" : "var(--ink-3)" }}>{h}</span>
        <span className="dim" style={{ fontWeight: 700 }}>{label}</span>
        <span className="num" style={{ color: lead === "a" ? "var(--ink)" : "var(--ink-3)" }}>{a}</span>
      </div>
      <div style={{ display: "flex", height: 6, borderRadius: 999, overflow: "hidden", background: "var(--surface-3)", gap: 2 }}>
        <div style={{ width: `${hp}%`, background: "var(--hot)" }} />
        <div style={{ width: `${100 - hp}%`, background: "var(--cool)" }} />
      </div>
    </div>
  );
}

// Like StatBar but accepts the raw FotMob values (which may be strings like "1.46"
// for xG) — shows them verbatim, bars by their numeric magnitude.
function DetailBar({ label, h, a }: { label: string; h: number | string; a: number | string }) {
  const hn = typeof h === "number" ? h : parseFloat(h) || 0;
  const an = typeof a === "number" ? a : parseFloat(a) || 0;
  const total = hn + an || 1;
  const hp = (hn / total) * 100;
  const lead = hn === an ? "" : hn > an ? "h" : "a";
  return (
    <div style={{ marginBottom: 11 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
        <span className="num" style={{ color: lead === "h" ? "var(--ink)" : "var(--ink-3)" }}>{h}</span>
        <span className="dim" style={{ fontWeight: 700 }}>{label}</span>
        <span className="num" style={{ color: lead === "a" ? "var(--ink)" : "var(--ink-3)" }}>{a}</span>
      </div>
      <div style={{ display: "flex", height: 6, borderRadius: 999, overflow: "hidden", background: "var(--surface-3)", gap: 2 }}>
        <div style={{ width: `${hp}%`, background: "var(--hot)" }} />
        <div style={{ width: `${100 - hp}%`, background: "var(--cool)" }} />
      </div>
    </div>
  );
}

function WinChanceBlock({ m }: { m: Match }) {
  const ds = useData();
  const home = m.home ? ds.teams[m.home] : null;
  const away = m.away ? ds.teams[m.away] : null;
  const committed = winChance(m);
  const haveReal = committed && committed.source !== "Modell";
  const ended = m.status === "played" || (m.status === "live" && !!m.likelyEnded);
  // no real odds committed yet → fetch them on demand (matched to ESPN by team NAME)
  const lazy = useFixtureOdds(
    !haveReal && !ended ? (m._realId != null ? String(m._realId) : m.id) : null,
    home?.name, away?.name, m.kickoff ? m.kickoff.toISOString() : null,
  );
  if (ended) return null;
  const o = haveReal ? committed : lazy ? winChanceFromEspn(lazy.homeML, lazy.awayML) : null;
  // only show REAL bookmaker odds — never our own model fallback
  if (!o) return null;
  const src = o.source === "ESPN" ? "Odds: ESPN" : "Odds: football-data";
  return (
    <div className="card" style={{ marginTop: 14, padding: "11px 13px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span className="kicker">Vinstchans</span>
        <span className="dim" style={{ fontSize: 9.5 }}>{src}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <Flag iso={home?.iso} code={m.home} size={15} />
        <span className="num" style={{ fontSize: 16, fontWeight: 800, color: "var(--hot)" }}>{o.H}%</span>
        <span className="dim" style={{ flex: 1, textAlign: "center", fontSize: 11 }}>oavgjort <b style={{ color: "var(--ink-2)" }}>{o.D}%</b></span>
        <span className="num" style={{ fontSize: 16, fontWeight: 800, color: "var(--cool-2)" }}>{o.A}%</span>
        <Flag iso={away?.iso} code={m.away} size={15} />
      </div>
      <div style={{ display: "flex", height: 6, borderRadius: 999, overflow: "hidden", gap: 2 }}>
        <div style={{ width: `${o.H}%`, background: "var(--hot)" }} />
        <div style={{ width: `${o.D}%`, background: "var(--ink-3)" }} />
        <div style={{ width: `${o.A}%`, background: "var(--cool)" }} />
      </div>
    </div>
  );
}

// result → color: exact = gold, right outcome = green, wrong = grey, not started = neutral.
const tipColor = (res: TipResult | null) =>
  res === "exact" ? "var(--gold)" : res === "outcome" ? "var(--win)" : res === "floor" ? "var(--ink-3)" : "var(--ink-2)";

// Your own knockout tip on the match — read straight from the koBets store so it
// shows the instant you save it (the engine merges everyone's KO tips into the pool
// on its next run; this is your personal, immediate view + the 90-minute rule).
function KoTipBlock({ m, ds }: { m: Match; ds: Dataset }) {
  const code = useKoBets((s) => s.code);
  const bets = useKoBets((s) => s.bets);
  const open = useKoBets((s) => s.open);
  const setSheet = useKoBets((s) => s.setSheet);
  const fid = koFid(m);
  const tip = bets[fid];
  const editable = open.has(fid);
  const home = m.home ? ds.teams[m.home] : null;
  const away = m.away ? ds.teams[m.away] : null;
  const live = isLive(m);
  const played = m.status === "played" || (m.status === "live" && !!m.likelyEnded);
  const sc = played || live ? reg90Score(m) : null;
  const res = tip && sc ? classifyTip([tip[0], tip[1]], sc[0], sc[1]) : null;
  const col = res ? tipColor(res.result) : "var(--cool)";
  return (
    <div className="ko-tip">
      <div className="ko-tip-head">
        <span className="kicker">Ditt slutspelstips</span>
        {tip && editable && <button className="ko-tip-edit" onClick={() => setSheet(true)}>Ändra ›</button>}
      </div>
      {tip ? (
        <div className="ko-tip-row" style={res ? { borderColor: `color-mix(in srgb, ${col} 34%, transparent)`, background: `color-mix(in srgb, ${col} 9%, var(--surface-2))` } : undefined}>
          <Flag iso={home?.iso} code={m.home} size={18} />
          <span className="ko-tip-nm">{home?.name || m.fromA}</span>
          <span className="num ko-tip-sc" style={{ color: res ? col : "var(--ink)" }}>{tip[0]}–{tip[1]}</span>
          <span className="ko-tip-nm right">{away?.name || m.fromB}</span>
          <Flag iso={away?.iso} code={m.away} size={18} />
        </div>
      ) : (
        <button className="ko-tip-cta" onClick={() => setSheet(true)}>{code ? "Tippa matchen" : "Logga in & tippa slutspelet"}</button>
      )}
      {res && (
        <div className="ko-tip-res" style={{ color: col }}>
          {res.result === "exact" ? "Exakt rätt" : res.result === "outcome" ? "Rätt utgång" : "Fel"} · {res.points}p
          <span className="dim" style={{ fontWeight: 700 }}> · resultat efter 90 min {sc![0]}–{sc![1]}</span>
        </div>
      )}
      <div className="ko-tip-note dim">
        Du gissar resultatet efter <b>90 min (ordinarie tid)</b> — det kan bli oavgjort. Matchen kan sen avgöras i förlängning eller på straffar, men ditt tips gäller 90-minutersresultatet.
      </div>
    </div>
  );
}

function PoolResults({ m, ds }: { m: Match; ds: Dataset }) {
  const openPlayer = useSheets((s) => s.openPlayer);
  if (!m.tippas || !m.tips.length) return <div className="dim" style={{ padding: 16, textAlign: "center" }}>Inga tips för den här matchen.</div>;
  const live = isLive(m);
  const played = m.status === "played";
  // Score every tip — final when played, PROVISIONAL against the running score when
  // live, so you see who'd cash in if it ended right now. KO matches score on the
  // 90-minute result (reg90Score); group on the final score. null = not started yet.
  const sc = played || live ? reg90Score(m) : null;
  const scored = sc != null;
  const rows = m.tips
    .map((t) => {
      const c = scored ? classifyTip([t.tip[0], t.tip[1]], sc[0], sc[1]) : null;
      return { name: t.name, tip: t.tip, result: c?.result ?? null, pts: c?.points ?? null };
    })
    .sort((a, b) => (b.pts ?? -1) - (a.pts ?? -1) || a.name.localeCompare(b.name, "sv"));
  const exactCount = rows.filter((r) => r.result === "exact").length;
  const outcomeCount = rows.filter((r) => r.result === "outcome").length;
  return (
    <Block title={live ? "Poolens tips · just nu" : "Poolens tips"}>
      {scored && (
        <div className="dim" style={{ fontSize: 11.5, marginBottom: 11, display: "flex", gap: 14, flexWrap: "wrap" }}>
          <span><b style={{ color: "var(--gold)" }}>{exactCount}</b> exakt rätt{live ? " just nu" : ""}</span>
          <span><b style={{ color: "var(--win)" }}>{outcomeCount}</b> rätt utgång</span>
        </div>
      )}
      <div style={{ display: "grid", gap: 6 }}>
        {rows.map((r) => {
          const p = ds.players.find((x) => x.name === r.name);
          const color = tipColor(r.result);
          const lit = r.result === "exact" || r.result === "outcome";
          return (
            <button
              key={r.name}
              onClick={() => p && openPlayer(p.id)}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: 9, width: "100%", textAlign: "left",
                background: lit ? `color-mix(in srgb, ${color} 11%, var(--surface))` : "var(--surface)",
                border: `1px solid ${lit ? `color-mix(in srgb, ${color} 32%, transparent)` : "transparent"}`,
              }}
            >
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: p?.color || "var(--cool)", flexShrink: 0 }} />
              <span style={{ flex: 1, fontWeight: 700, fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</span>
              <span className="num" style={{ fontSize: 14, fontWeight: 800, color: r.result ? color : "var(--ink)" }}>{r.tip[0]}–{r.tip[1]}</span>
              {r.pts != null && <span className="num" style={{ width: 30, textAlign: "right", fontWeight: 800, color }}>{r.pts}p</span>}
            </button>
          );
        })}
      </div>
      {live && (
        <div className="dim" style={{ fontSize: 10.5, marginTop: 10, textAlign: "center" }}>
          Färgen visar läget just nu — <b style={{ color: "var(--gold)" }}>guld</b> = exakt, <b style={{ color: "var(--win)" }}>grön</b> = rätt utgång.
        </div>
      )}
    </Block>
  );
}
