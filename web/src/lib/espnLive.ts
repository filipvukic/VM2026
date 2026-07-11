// Client-side LIVE overlay. GitHub Actions' scheduled cron that runs the Python
// engine is heavily throttled (often only ~once/hour), so committed data.json can
// be badly stale during matches. ESPN's public scoreboard allows cross-origin
// browser requests (Access-Control-Allow-Origin: *), so the site fetches live
// scores/status/minute straight from ESPN and overlays them onto the fixtures for
// DISPLAY — independent of the cron. The engine stays the source of truth for
// committed data and for player POINTS (overlay never invents points).
import type { RawFixture, RawLineup, RawLineupPlayer } from "../data/types";

export interface EspnGoal {
  minute: string;
  espnTeamId: string;
  scorer: string;
  type: string;
}
export interface EspnLite {
  id: string; // ESPN event id (for the summary/lineup fetch)
  koUtc: string;
  homeNorm: string;
  awayNorm: string;
  state: string; // "pre" | "in" | "post"
  home: number;
  away: number;
  clock: string | null;
  clockSeconds: number | null; // ESPN's regulation match clock in seconds (capped at 5400=90:00)
  period: number | null; // 1 = first half, 2 = second half (incl. its stoppage)
  homeId: string;
  awayId: string;
  venue: { stadium: string; city?: string; country?: string } | null;
  goals: EspnGoal[];
}
export interface EspnLineups { home: RawLineup | null; away: RawLineup | null }

// A fetch that can never hang. iOS suspends in-flight requests when the app is
// backgrounded (screen lock, app switch) and they can stay pending indefinitely —
// which would stall the poll chain and freeze the live minute on screen. Always
// resolves: null on any error, non-OK status or timeout.
async function fetchJson(url: string, timeoutMs = 12000): Promise<any | null> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, { cache: "no-store", signal: ac.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null; // network/CORS hiccup or timeout — overlay is best-effort
  } finally {
    clearTimeout(t);
  }
}

function norm(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

// Bridge the spellings that differ between ESPN and football-data to one token.
const CANON: Record<string, string> = {
  usa: "usa", unitedstates: "usa",
  turkey: "turkiye", turkiye: "turkiye",
  capeverde: "capeverde", capeverdeislands: "capeverde",
  bosniaandherzegovina: "bosnia", bosniaherzegovina: "bosnia",
  drcongo: "congodr", congodr: "congodr", democraticrepublicofcongo: "congodr",
  southkorea: "korea", korearepublic: "korea", republicofkorea: "korea",
  ivorycoast: "ivorycoast", cotedivoire: "ivorycoast",
};
function canon(n: string): string {
  return CANON[n] || n;
}

// Orientation-independent key for a team pair, used to match a watched match to an
// ESPN event for push (the push worker computes the identical key — keep in sync).
export function matchPairKey(home: string, away: string): string {
  return [canon(norm(home)), canon(norm(away))].sort().join("|");
}

// Dice bigram similarity for a fuzzy fallback on odd spellings.
function bigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}
function similar(a: string, b: string): number {
  if (a === b) return 1;
  const A = bigrams(a), B = bigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  A.forEach((g) => { if (B.has(g)) inter++; });
  return (2 * inter) / (A.size + B.size);
}

const SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=";

function utcDates(nowMs: number): string[] {
  // ESPN keys events by US-Eastern date, so a late-UTC kickoff can sit on the
  // previous date — fetch yesterday/today/tomorrow to be safe.
  return [-1, 0, 1].map((off) => {
    const d = new Date(nowMs + off * 86400000);
    return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  });
}

export async function fetchEspnEvents(nowMs: number): Promise<EspnLite[]> {
  const seen = new Set<string>();
  const out: EspnLite[] = [];
  await Promise.all(
    utcDates(nowMs).map(async (day) => {
      {
        const j = await fetchJson(SCOREBOARD + day);
        if (!j) return;
        for (const ev of j.events || []) {
          const comp = (ev.competitions || [])[0];
          if (!comp) continue;
          const cs = comp.competitors || [];
          const h = cs.find((c: any) => c.homeAway === "home");
          const a = cs.find((c: any) => c.homeAway === "away");
          if (!h || !a) continue;
          const st = comp.status || ev.status || {};
          const type = (ev.status || comp.status || {}).type || {};
          const key = (ev.id || ev.uid || "") + "";
          if (key && seen.has(key)) continue;
          if (key) seen.add(key);
          const v = comp.venue;
          const venue = v?.fullName
            ? { stadium: v.fullName, city: v.address?.city, country: v.address?.country }
            : null;
          const goals: EspnGoal[] = (comp.details || [])
            .filter((d: any) => d.scoringPlay)
            .map((d: any) => ({
              minute: (d.clock?.displayValue || "").replace(/[^0-9+]/g, ""),
              espnTeamId: String(d.team?.id || ""),
              scorer: (d.athletesInvolved || [])[0]?.displayName || "Mål",
              type: d.type?.text || "Goal",
            }));
          out.push({
            id: String(ev.id || ev.uid || ""),
            koUtc: ev.date || "",
            homeNorm: norm(h.team?.displayName || h.team?.name || h.team?.shortDisplayName || ""),
            awayNorm: norm(a.team?.displayName || a.team?.name || a.team?.shortDisplayName || ""),
            state: type.state || "",
            home: Number(h.score),
            away: Number(a.score),
            clock: st.displayClock || null,
            clockSeconds: typeof st.clock === "number" ? st.clock : null,
            period: typeof st.period === "number" ? st.period : null,
            homeId: String(h.team?.id || h.id || ""),
            awayId: String(a.team?.id || a.id || ""),
            venue,
            goals,
          });
        }
      }
    })
  );
  return out;
}

// Football-correct live minute from ESPN's status. ESPN's displayClock is usually
// already broadcast-style ("90'+7'" → "90+7"); we keep that verbatim. If it's a
// bare running number (or missing) we bound it to the half so 2nd-half stoppage
// shows as "90+X" (never "97"/"107") using the `period` and the regulation seconds
// clock (`clockSeconds`, capped at 5400 = 90:00), matching what's on TV.
function minuteFromClock(clock: string | null, clockSeconds: number | null, period: number | null): string | null {
  const base = period === 1 ? 45 : period === 2 ? 90 : null;
  const fmt = (n: number) => (base != null && n > base ? `${base}+${n - base}` : String(n));
  if (clock) {
    const cleaned = clock.replace(/[^0-9+]/g, "");
    if (cleaned.includes("+")) return cleaned; // already "45+2" / "90+7"
    const n = parseInt(cleaned, 10);
    if (!Number.isNaN(n) && n > 0) return fmt(n);
  }
  // No usable displayClock — derive the minute from the regulation seconds clock.
  if (typeof clockSeconds === "number" && clockSeconds > 0) {
    return fmt(Math.floor(clockSeconds / 60));
  }
  return null;
}

const SUMMARY = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=";

// Per-match detail from ESPN's summary endpoint (CORS-enabled): lineups + subs +
// cards. `espnHome` flags whether each event belongs to ESPN's home team — the
// overlay maps that to our home/away via the matched orientation.
export interface EspnSummary {
  homeLineup: RawLineup | null;
  awayLineup: RawLineup | null;
  subs: { minute: string; espnHome: boolean; playerIn?: string; playerOut?: string }[];
  cards: { minute: string; espnHome: boolean; player?: string; card: string }[];
  odds: { homeML: number; awayML: number } | null; // ESPN home/away moneyline (real odds)
  homeStats: Record<string, number> | null; // ESPN boxscore team stats (possession, shots…)
  awayStats: Record<string, number> | null;
}

// ESPN boxscore stats live in displayValue (a string like "55%"/"451"); coerce to
// the same {name: number} shape the engine writes so build()'s getStat reads both.
function parseTeamStats(statsList: any[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of statsList || []) {
    const name = s?.name;
    if (!name) continue;
    const raw = s.displayValue ?? s.value;
    if (raw == null) continue;
    const n = parseFloat(String(raw).replace("%", "").replace(",", "."));
    if (!Number.isNaN(n)) out[name] = n;
  }
  return out;
}

function rosterPlayer(p: any): RawLineupPlayer {
  const a = p.athlete || {};
  return {
    name: a.displayName || `${a.firstName || ""} ${a.lastName || ""}`.trim(),
    position: p.position?.abbreviation,
    jersey: p.jersey,
    shirtNumber: p.jersey,
    espnId: a.id != null ? String(a.id) : undefined,
    subbedIn: !!p.subbedIn,
    subbedOut: !!p.subbedOut,
  };
}
function lineupSide(roster: any, eventId: string): RawLineup | null {
  const players = roster?.roster || [];
  const starters = players.filter((p: any) => p.starter).map(rosterPlayer);
  if (!starters.length) return null;
  return {
    formation: roster.formation,
    lineup: starters,
    bench: players.filter((p: any) => !p.starter).map(rosterPlayer),
    _espnEventId: eventId,
  };
}

export async function fetchEventSummary(eventId: string): Promise<EspnSummary | null> {
  try {
    const d = await fetchJson(SUMMARY + eventId);
    if (!d) return null;
    const ros = d.rosters || [];
    const hr = ros.find((x: any) => x.homeAway === "home");
    const ar = ros.find((x: any) => x.homeAway === "away");
    const homeTeamId = String(hr?.team?.id ?? "");
    const subs: EspnSummary["subs"] = [];
    const cards: EspnSummary["cards"] = [];
    const mins = (e: any) => String(e.clock?.displayValue || "").replace(/[^0-9+]/g, "");
    for (const e of d.keyEvents || []) {
      const et = (e.type?.type || "").toLowerCase();
      const espnHome = String(e.team?.id ?? "") === homeTeamId;
      const parts = e.participants || [];
      const p0 = parts[0]?.athlete?.displayName;
      const p1 = parts[1]?.athlete?.displayName;
      if (et === "substitution") subs.push({ minute: mins(e), espnHome, playerIn: p0, playerOut: p1 });
      else if (et === "yellow-card") cards.push({ minute: mins(e), espnHome, player: p0, card: "YELLOW" });
      else if (et === "red-card") {
        const second = /(second yellow|second booking)/i.test(e.text || "");
        cards.push({ minute: mins(e), espnHome, player: p0, card: second ? "YELLOW_RED" : "RED" });
      }
    }
    // real bookmaker moneyline (highest-priority provider)
    let odds: EspnSummary["odds"] = null;
    const pc = (d.pickcenter || [])[0];
    const hml = pc?.homeTeamOdds?.moneyLine;
    const aml = pc?.awayTeamOdds?.moneyLine;
    if (typeof hml === "number" && typeof aml === "number") odds = { homeML: hml, awayML: aml };

    // live team statistics (possession, shots, passes…) from the boxscore
    let homeStats: Record<string, number> | null = null;
    let awayStats: Record<string, number> | null = null;
    for (const t of (d.boxscore?.teams || []) as any[]) {
      const ps = parseTeamStats(t.statistics || []);
      if (!Object.keys(ps).length) continue;
      if (t.homeAway === "home") homeStats = ps;
      else if (t.homeAway === "away") awayStats = ps;
    }

    return {
      homeLineup: hr ? lineupSide(hr, eventId) : null,
      awayLineup: ar ? lineupSide(ar, eventId) : null,
      subs,
      cards,
      odds,
      homeStats,
      awayStats,
    };
  } catch {
    return null;
  }
}

// On-demand: real bookmaker moneyline for ONE fixture (any date), fetched when a
// match view opens — so the win-chance shows real odds even for matches the live
// overlay window hasn't covered yet. Returns {homeML,awayML} oriented to OUR
// home/away, or null. Two requests (scoreboard for the date → that event's summary).
export async function fetchFixtureOdds(home: string, away: string, koUtc: string): Promise<{ homeML: number; awayML: number } | null> {
  const ko = Date.parse(koUtc || "");
  if (Number.isNaN(ko)) return null;
  const fh = canon(norm(home)), fa = canon(norm(away));
  const days = [-1, 0, 1].map((off) => {
    const d = new Date(ko + off * 86400000);
    return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  });
  for (const day of days) {
    try {
      const j = await fetchJson(SCOREBOARD + day);
      if (!j) continue;
      for (const ev of j.events || []) {
        const comp = (ev.competitions || [])[0];
        const cs = comp?.competitors || [];
        const h = cs.find((c: any) => c.homeAway === "home");
        const a = cs.find((c: any) => c.homeAway === "away");
        if (!h || !a) continue;
        const eh = canon(norm(h.team?.displayName || h.team?.name || ""));
        const ea = canon(norm(a.team?.displayName || a.team?.name || ""));
        const direct = (eh === fh && ea === fa) || (eh === fa && ea === fh);
        const score = direct ? 2 : Math.max(similar(eh, fh) + similar(ea, fa), similar(eh, fa) + similar(ea, fh));
        if (score < 1.4) continue;
        const sm = await fetchEventSummary(String(ev.id || ev.uid || ""));
        if (!sm?.odds) return null;
        const sameOrient = eh === fh || (eh !== fa && similar(eh, fh) >= similar(eh, fa));
        return sameOrient
          ? { homeML: sm.odds.homeML, awayML: sm.odds.awayML }
          : { homeML: sm.odds.awayML, awayML: sm.odds.homeML };
      }
    } catch {
      /* try next date */
    }
  }
  return null;
}

// Overlay live ESPN data onto fixtures. DISPLAY only — never downgrades a match
// the engine already finalised, only touches matches in the live window, never
// invents points. Scoreboard gives status/score/minute/venue/goals for all
// matches; the per-match summary adds lineups/subs/cards (incl. for not-yet-started
// matches whose XI has been announced).
export function overlayFixtures(
  fixtures: RawFixture[],
  events: EspnLite[],
  summaries: Record<string, EspnSummary>,
  nowMs: number,
): RawFixture[] {
  if (!events.length) return fixtures;
  const pool = events.filter((e) => e.state === "in" || e.state === "post" || e.state === "pre");
  if (!pool.length) return fixtures;

  return fixtures.map((f) => {
    if (!f.home || !f.away) return f;
    const ko = Date.parse(f.utcDate || "");
    if (Number.isNaN(ko) || Math.abs(nowMs - ko) > 36 * 3600 * 1000) return f; // outside window
    const fh = canon(norm(f.home)), fa = canon(norm(f.away));

    let best: EspnLite | null = null;
    let bestScore = 0;
    for (const e of pool) {
      const eh = canon(e.homeNorm), ea = canon(e.awayNorm);
      const direct = (eh === fh && ea === fa) || (eh === fa && ea === fh);
      const s = direct ? 2 : Math.max(similar(eh, fh) + similar(ea, fa), similar(eh, fa) + similar(ea, fh));
      if (s > bestScore) { bestScore = s; best = e; }
    }
    if (!best || bestScore < 1.4) return f;

    const eh = canon(best.homeNorm);
    const sameOrient = eh === fh || (eh !== fa && similar(eh, fh) >= similar(eh, fa));
    const ourIsHome = (espnHome: boolean) => (sameOrient ? espnHome : !espnHome);
    const ourTla = (espnHome: boolean) => (ourIsHome(espnHome) ? f.homeTla : f.awayTla);

    const venue =
      f.venue && f.venue.stadium
        ? f.venue
        : best.venue
          ? { stadium: best.venue.stadium, city: best.venue.city, country: best.venue.country }
          : f.venue;

    // lineups + subs + cards + team stats + real odds from the per-match summary
    let homeLineup = f.homeLineup, awayLineup = f.awayLineup, subs = f.subs, bookings = f.bookings, espnOdds = f.espnOdds;
    let homeStats = f.homeStats, awayStats = f.awayStats;
    const sm = summaries[best.id];
    if (sm) {
      const luH = sameOrient ? sm.homeLineup : sm.awayLineup;
      const luA = sameOrient ? sm.awayLineup : sm.homeLineup;
      if (!homeLineup?.lineup?.length && luH) homeLineup = { ...luH, tla: f.homeTla };
      if (!awayLineup?.lineup?.length && luA) awayLineup = { ...luA, tla: f.awayTla };
      if (sm.subs.length > (f.subs?.length || 0)) {
        subs = sm.subs.map((s) => ({ minute: s.minute, team: ourTla(s.espnHome), playerIn: s.playerIn, playerOut: s.playerOut }));
      }
      if (sm.cards.length > (f.bookings?.length || 0)) {
        bookings = sm.cards.map((c) => ({ minute: c.minute, team: ourTla(c.espnHome), player: c.player, card: c.card }));
      }
      // live team stats — fresher than committed; orient to OUR home/away
      const stH = sameOrient ? sm.homeStats : sm.awayStats;
      const stA = sameOrient ? sm.awayStats : sm.homeStats;
      if (stH) homeStats = stH;
      if (stA) awayStats = stA;
      if (!espnOdds && sm.odds) {
        espnOdds = sameOrient
          ? { homeML: sm.odds.homeML, awayML: sm.odds.awayML }
          : { homeML: sm.odds.awayML, awayML: sm.odds.homeML };
      }
    }

    // Engine result is authoritative for finished matches — only ENRICH missing
    // detail (line-up, subs, cards, stats, real odds), never touch the score/status.
    if (f.status === "FINISHED" || f.status === "AWARDED") {
      return { ...f, venue, homeLineup, awayLineup, subs, bookings, homeStats, awayStats, espnOdds };
    }

    if (best.state === "pre") {
      return { ...f, venue, homeLineup, awayLineup, espnOdds }; // XI/odds known; keep upcoming
    }

    const [h, a] = sameOrient ? [best.home, best.away] : [best.away, best.home];
    let goals = f.goals;
    if (best.goals.length > (f.goals?.length || 0)) {
      let hc = 0, ac = 0;
      goals = best.goals.map((g) => {
        const home = ourIsHome(g.espnTeamId === best.homeId);
        const t = g.type.toLowerCase();
        const type = t.includes("own") ? "OWN" : t.includes("penalty") ? "PENALTY" : t.includes("header") ? "HEADER" : "REGULAR";
        if (home) hc++; else ac++;
        return { minute: g.minute, team: home ? f.homeTla : f.awayTla, scorer: g.scorer, type, score: [hc, ac] as [number, number] };
      });
    }

    if (best.state === "post") {
      return { ...f, status: "FINISHED", score: [h, a], venue, goals, homeLineup, awayLineup, subs, bookings, homeStats, awayStats, espnOdds };
    }
    return { ...f, status: "IN_PLAY", score: [h, a], minute: minuteFromClock(best.clock, best.clockSeconds, best.period), venue, goals, homeLineup, awayLineup, subs, bookings, homeStats, awayStats, espnOdds, _liveOverlay: true };
  });
}
