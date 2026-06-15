// Client-side LIVE overlay. GitHub Actions' scheduled cron that runs the Python
// engine is heavily throttled (often only ~once/hour), so committed data.json can
// be badly stale during matches. ESPN's public scoreboard allows cross-origin
// browser requests (Access-Control-Allow-Origin: *), so the site fetches live
// scores/status/minute straight from ESPN and overlays them onto the fixtures for
// DISPLAY — independent of the cron. The engine stays the source of truth for
// committed data and for player POINTS (overlay never invents points).
import type { RawFixture } from "../data/types";

export interface EspnGoal {
  minute: string;
  espnTeamId: string;
  scorer: string;
  type: string;
}
export interface EspnLite {
  homeNorm: string;
  awayNorm: string;
  state: string; // "pre" | "in" | "post"
  home: number;
  away: number;
  clock: string | null;
  homeId: string;
  awayId: string;
  venue: { stadium: string; city?: string; country?: string } | null;
  goals: EspnGoal[];
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
      try {
        const r = await fetch(SCOREBOARD + day, { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        for (const ev of j.events || []) {
          const comp = (ev.competitions || [])[0];
          if (!comp) continue;
          const cs = comp.competitors || [];
          const h = cs.find((c: any) => c.homeAway === "home");
          const a = cs.find((c: any) => c.homeAway === "away");
          if (!h || !a) continue;
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
            homeNorm: norm(h.team?.displayName || h.team?.name || h.team?.shortDisplayName || ""),
            awayNorm: norm(a.team?.displayName || a.team?.name || a.team?.shortDisplayName || ""),
            state: type.state || "",
            home: Number(h.score),
            away: Number(a.score),
            clock: (comp.status || ev.status || {}).displayClock || null,
            homeId: String(h.team?.id || h.id || ""),
            awayId: String(a.team?.id || a.id || ""),
            venue,
            goals,
          });
        }
      } catch {
        /* network/CORS hiccup — overlay is best-effort */
      }
    })
  );
  return out;
}

function minuteFromClock(clock: string | null): string | null {
  if (!clock) return null;
  const cleaned = clock.replace(/[^0-9+]/g, "");
  return cleaned || null;
}

// Overlay live ESPN status/score/minute onto fixtures. DISPLAY only: never
// downgrades a match the engine already finalised, and only touches matches in
// the live window so it can't disturb historical/scored data.
export function overlayFixtures(fixtures: RawFixture[], events: EspnLite[], nowMs: number): RawFixture[] {
  if (!events.length) return fixtures;
  const live = events.filter((e) => e.state === "in" || e.state === "post");
  if (!live.length) return fixtures;

  return fixtures.map((f) => {
    if (f.status === "FINISHED" || f.status === "AWARDED") return f;
    if (!f.home || !f.away) return f;
    const ko = Date.parse(f.utcDate || "");
    if (Number.isNaN(ko) || Math.abs(nowMs - ko) > 36 * 3600 * 1000) return f; // outside live window
    const fh = canon(norm(f.home)), fa = canon(norm(f.away));

    let best: EspnLite | null = null;
    let bestScore = 0;
    for (const e of live) {
      const eh = canon(e.homeNorm), ea = canon(e.awayNorm);
      const direct = (eh === fh && ea === fa) || (eh === fa && ea === fh);
      // best of same-orientation vs swapped name similarity (out of 2.0)
      const s = direct ? 2 : Math.max(similar(eh, fh) + similar(ea, fa), similar(eh, fa) + similar(ea, fh));
      if (s > bestScore) { bestScore = s; best = e; }
    }
    if (!best || bestScore < 1.4) return f; // require a confident match

    const eh = canon(best.homeNorm);
    const sameOrient = eh === fh || (eh !== fa && similar(eh, fh) >= similar(eh, fa));
    const [h, a] = sameOrient ? [best.home, best.away] : [best.away, best.home];
    if (Number.isNaN(h) || Number.isNaN(a)) return f;

    // venue: ESPN has the real stadium; only fill it in when the (stale) engine
    // data has none, otherwise the UI falls back to a wrong per-group default.
    const venue =
      f.venue && f.venue.stadium
        ? f.venue
        : best.venue
          ? { stadium: best.venue.stadium, city: best.venue.city, country: best.venue.country }
          : f.venue;

    // goals timeline from the scoreboard's scoring plays. Keep the engine's goals
    // when it already has at least as many (they carry assists/richer data).
    let goals = f.goals;
    if (best.goals.length > (f.goals?.length || 0)) {
      let hc = 0, ac = 0;
      goals = best.goals.map((g) => {
        const espnIsHome = g.espnTeamId === best.homeId;
        const ourHome = sameOrient ? espnIsHome : !espnIsHome;
        const tla = ourHome ? f.homeTla : f.awayTla;
        const t = g.type.toLowerCase();
        const type = t.includes("own") ? "OWN" : t.includes("penalty") ? "PENALTY" : t.includes("header") ? "HEADER" : "REGULAR";
        if (ourHome) hc++; else ac++;
        return { minute: g.minute, team: tla, scorer: g.scorer, type, score: [hc, ac] as [number, number] };
      });
    }

    if (best.state === "post") {
      return { ...f, status: "FINISHED", score: [h, a], venue, goals };
    }
    return { ...f, status: "IN_PLAY", score: [h, a], minute: minuteFromClock(best.clock), venue, goals, _liveOverlay: true };
  });
}
