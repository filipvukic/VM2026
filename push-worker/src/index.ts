// VM2026 Web Push backend (Cloudflare Worker).
//
//  • POST /subscribe        — store a browser push subscription + a notifyAll flag
//                             (one global opt-in for all matches).
//  • POST /unsubscribe      — drop a subscription.
//  • POST /test             — send a test push to a given subscription.
//  • GET  /vapidPublicKey   — hand the frontend the public VAPID key to subscribe.
//  • cron (every minute)    — poll ESPN's scoreboard, diff against the last-seen
//                             goal state, and push goal / kickoff / full-time
//                             alerts to every subscriber with notifyAll on.
//
// One global opt-in per browser: a subscriber with notifyAll gets every goal /
// kickoff / full-time alert for every match. Sending uses @pushforge/builder
// (Web Crypto, runs on the edge) so no Node crypto / external service is needed.
import { buildPushHTTPRequest } from "@pushforge/builder";
import { handleKo, koDueReminders, markKoReminderSent, koReminderMessage, openFixtureIds, koUntippedForName } from "./ko";
import { handlePresence } from "./presence";

interface Env {
  SUBS: KVNamespace;
  VAPID_PRIVATE_KEY: string; // private JWK JSON string (secret)
  VAPID_PUBLIC_KEY: string; // base64url public key (var)
  ADMIN_CONTACT: string; // mailto:...
  ALLOW_ORIGIN: string; // site origin allowed to call /subscribe
  KO_SECRET: string; // secret the per-person KO login codes are derived from
  KO_ADMIN_KEY: string; // secret guarding /ko/codes and /ko/all
}

const SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=";

// Orientation-independent key for a team pair, embedded in the push URL so a tap
// opens the right match. MUST stay in sync with matchPairKey() in the frontend's
// lib/espnLive.ts (same norm + canon), since the app resolves the key against OUR
// fixtures.
function norm(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}
const CANON: Record<string, string> = {
  usa: "usa", unitedstates: "usa",
  turkey: "turkiye", turkiye: "turkiye",
  capeverde: "capeverde", capeverdeislands: "capeverde",
  bosniaandherzegovina: "bosnia", bosniaherzegovina: "bosnia",
  drcongo: "congodr", congodr: "congodr", democraticrepublicofcongo: "congodr",
  southkorea: "korea", korearepublic: "korea", republicofkorea: "korea",
  ivorycoast: "ivorycoast", cotedivoire: "ivorycoast",
};
function matchPairKey(home: string, away: string): string {
  const c = (n: string) => CANON[n] || n;
  return [c(norm(home)), c(norm(away))].sort().join("|");
}

function utcDates(nowMs: number): string[] {
  return [-1, 0, 1].map((off) => {
    const d = new Date(nowMs + off * 86400000);
    return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  });
}

function cors(env: Env): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": env.ALLOW_ORIGIN || "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
function json(data: unknown, env: Env, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors(env) },
  });
}

async function hashEndpoint(endpoint: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

interface StoredSub {
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
  notifyAll: boolean;
  player?: string; // the logged-in KO participant on this browser, for per-person KO reminders
}

// ===================== Live FotMob match-stats proxy =====================
// FotMob sends no CORS headers (so the browser can't fetch it) and the GitHub stats
// job is throttled to ~hourly. This endpoint fetches + parses FotMob's server-
// rendered match page on demand and returns the SAME shape as matchstats/<id>.json,
// edge-cached ~25s — so the app shows near-live ratings/xG/shots during a match.
// Faithful port of build_matchstats.py.
const FM_LEAGUE = "https://www.fotmob.com/leagues/77/matches/world-cup";
const FM_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36";
const NEXT_RE = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;

const TEAM_LABELS: Record<string, string> = {
  BallPossesion: "Bollinnehav (%)", expected_goals: "xG", total_shots: "Skott",
  ShotsOnTarget: "Skott på mål", big_chance: "Stora målchanser",
  touches_opp_box: "Kontakter i straffområdet", accurate_passes: "Lyckade passningar",
  fk_foul_won: "Frisparkar", corners: "Hörnor", Saves: "Räddningar",
  yellow_card: "Gula kort", red_card: "Röda kort", tackles_succeeded: "Tacklingar",
  interceptions: "Brytningar", duel_won: "Närkamper vunna",
};
const PLAYER_LABELS: [string, string][] = [
  ["goals", "Mål"], ["assists", "Assist"], ["expected_goals", "xG"], ["expected_assists", "xA"],
  ["total_shots", "Skott"], ["ShotsOnTarget", "Skott på mål"], ["chances_created", "Målchanser skapade"],
  ["touches", "Bollkontakter"], ["touches_opp_box", "Kontakter i straffområdet"],
  ["dribbles_succeeded", "Lyckade dribblingar"], ["accurate_passes", "Lyckade passningar"],
  ["passes_into_final_third", "Passningar sista tredjedelen"], ["accurate_crosses", "Inlägg"],
  ["long_balls_accurate", "Långa bollar"], ["dispossessed", "Tappade bollen"],
  ["matchstats.headers.tackles", "Tacklingar"], ["shot_blocks", "Blockeringar"],
  ["clearances", "Rensningar"], ["interceptions", "Brytningar"], ["recoveries", "Återerövringar"],
  ["dribbled_past", "Dribblad förbi"], ["ground_duels_won", "Markdueller vunna"],
  ["aerials_won", "Luftdueller vunna"], ["duel_won", "Närkamper vunna"], ["duel_lost", "Närkamper förlorade"],
  ["was_fouled", "Blev fälld"], ["fouls", "Frisparkar emot"], ["saves", "Räddningar"],
  ["goals_conceded", "Insläppta mål"], ["goals_prevented", "Mål förhindrade"],
];

function fnorm(s: string): string {
  return (s || "").toLowerCase().replace(/&/g, "and").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
}
function dice(a: string, b: string): number {
  if (a && a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const grams = (s: string) => { const m = new Map<string, number>(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); } return m; };
  const A = grams(a), B = grams(b); let inter = 0, total = 0;
  for (const [g, c] of A) { total += c; const d = B.get(g); if (d) inter += Math.min(c, d); }
  for (const c of B.values()) total += c;
  return total ? (2 * inter) / total : 0;
}
// best similarity of a FotMob name vs any of the candidate spellings the client sent
function bestSim(fmName: string, candidates: string[]): number {
  const f = fnorm(fmName);
  let best = 0;
  for (const c of candidates) best = Math.max(best, dice(f, fnorm(c)));
  return best;
}
function fmNum(v: any): any {
  if (typeof v === "string") {
    const m = v.trim().match(/^-?\d+(\.\d+)?/);
    if (!m) return v;
    const f = parseFloat(m[0]);
    return Number.isInteger(f) ? f : Math.round(f * 100) / 100;
  }
  return v;
}
function getNext(html: string): any {
  const m = NEXT_RE.exec(html);
  return m ? JSON.parse(m[1]) : null;
}
async function fmText(u: string): Promise<string> {
  const r = await fetch(u, { headers: { "User-Agent": FM_UA, Referer: "https://www.fotmob.com/" } });
  if (!r.ok) throw new Error("fm " + r.status);
  return r.text();
}
function extractTeam(content: any): any[] {
  const out: any[] = []; const seen = new Set<string>();
  const groups = content?.stats?.Periods?.All?.stats || [];
  for (const g of groups) for (const s of (g?.stats || [])) {
    const key = s?.key, vals = s?.stats;
    if (TEAM_LABELS[key] && !seen.has(key) && Array.isArray(vals) && vals.length === 2) {
      seen.add(key);
      out.push({ key, label: TEAM_LABELS[key], home: fmNum(vals[0]), away: fmNum(vals[1]) });
    }
  }
  return out;
}
function extractPlayers(content: any, tlaOf: (id: any) => string | null): any[] {
  const labelMap = new Map(PLAYER_LABELS); const order = PLAYER_LABELS.map(([, l]) => l);
  const out: any[] = []; const ps = content?.playerStats || {};
  for (const pid of Object.keys(ps)) {
    const p = ps[pid]; const flat: Record<string, any> = {}; let rating: any = null, minutes: any = null;
    for (const grp of (p?.stats || [])) for (const label of Object.keys(grp?.stats || {})) {
      const v = grp.stats[label]; const key = v?.key; const val = v?.stat?.value;
      if (key === "rating_title") { rating = val; continue; }
      if (key === "minutes_played") { minutes = val; continue; }
      if (labelMap.has(key) && val != null) flat[labelMap.get(key)!] = fmNum(val);
    }
    const ordered: Record<string, any> = {};
    for (const lbl of order) if (lbl in flat) ordered[lbl] = flat[lbl];
    out.push({
      optaId: String(p?.optaId || ""), fmId: String(p?.id || pid || ""), name: p?.name,
      tla: tlaOf(p?.teamId), gk: !!p?.isGoalkeeper, pos: p?.usualPosition,
      shirt: p?.shirtNumber, rating, min: minutes, stats: ordered,
    });
  }
  out.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  return out;
}
function extractShots(content: any, tlaOf: (id: any) => string | null): any[] {
  const out: any[] = [];
  for (const s of (content?.shotmap?.shots || [])) {
    const et = (s?.eventType || "").toLowerCase();
    out.push({
      x: Math.round((s?.x || 0) * 100) / 100, y: Math.round((s?.y || 0) * 100) / 100, min: s?.min,
      xg: Math.round((s?.expectedGoals || 0) * 1000) / 1000, tla: tlaOf(s?.teamId),
      player: s?.playerName, optaId: String(s?.playerId || ""), goal: et === "goal",
      onTarget: !!s?.isOnTarget, outcome: s?.eventType,
    });
  }
  return out;
}
function extractStarters(team: any): any[] {
  const out: any[] = [];
  for (const p of (team?.starters || [])) {
    const h = p?.horizontalLayout || {};
    if (h.x == null) continue;
    out.push({ name: p?.name, shirt: p?.shirtNumber, x: Math.round(h.x * 1000) / 1000, y: Math.round((h.y ?? 0.5) * 1000) / 1000 });
  }
  return out;
}
async function extractHeatmap(fmMatchId: any): Promise<any> {
  try {
    const u = `https://www.fotmob.com/api/data/heatmap/match/${fmMatchId}/heatmaps?heatmapUrl=https://pub.fotmob.com/prod/db/api/heatmap/match/${fmMatchId}`;
    const d = JSON.parse(await fmText(u));
    const vb = /viewBox="([^"]+)"/.exec(d?.template || "");
    const players: Record<string, number[][]> = {};
    for (const pkey of Object.keys(d?.players || {})) {
      const opta = pkey.startsWith("p") ? pkey.slice(1) : pkey;
      const pts: number[][] = []; const re = /<circle cx="([\d.]+)" cy="([\d.]+)"/g; let mm: RegExpExecArray | null;
      while ((mm = re.exec(d.players[pkey]))) pts.push([Math.round(parseFloat(mm[1]) * 10) / 10, Math.round(parseFloat(mm[2]) * 10) / 10]);
      if (pts.length) players[opta] = pts;
    }
    return { viewBox: vb ? vb[1] : "0 0 105 68", players };
  } catch { return null; }
}
// Cached, trimmed list of all WC matches (id, pageUrl, names, ids, time) so the big
// league-page parse only happens ~every 3 min, not on every match request.
async function leagueMatches(ctx: ExecutionContext): Promise<any[]> {
  const cacheKey = new Request("https://vm2026-cache.invalid/fm-league");
  const hit = await (caches as any).default.match(cacheKey);
  if (hit) return hit.json();
  const all = (getNext(await fmText(FM_LEAGUE))?.props?.pageProps?.overview?.matches?.allMatches || []).map((m: any) => ({
    id: m?.id, pageUrl: m?.pageUrl, h: m?.home?.name, a: m?.away?.name,
    hid: m?.home?.id, aid: m?.away?.id, t: m?.status?.utcTime || "",
  }));
  const resp = new Response(JSON.stringify(all), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=180" } });
  ctx.waitUntil((caches as any).default.put(cacheKey, resp.clone()));
  return all;
}

async function matchStats(url: URL, env: Env, ctx: ExecutionContext): Promise<Response> {
  const homeC = (url.searchParams.get("home") || "").split("~").filter(Boolean);
  const awayC = (url.searchParams.get("away") || "").split("~").filter(Boolean);
  const date = (url.searchParams.get("date") || "").slice(0, 10);
  const hTla = url.searchParams.get("hTla") || "";
  const aTla = url.searchParams.get("aTla") || "";
  const fx = Number(url.searchParams.get("fx") || 0);
  if (!homeC.length || !awayC.length || !hTla || !aTla) return json({ error: "missing params" }, env, 400);

  const cacheKey = new Request(url.toString());
  const cached = await (caches as any).default.match(cacheKey);
  if (cached) return cached;

  try {
    // 1) find the FotMob match by team-name similarity (either orientation) + date
    const all = await leagueMatches(ctx);
    let best: any = null, bestScore = 0, bestSwap = false;
    for (const fm of all) {
      const direct = Math.min(bestSim(fm.h, homeC), bestSim(fm.a, awayC));
      const swap = Math.min(bestSim(fm.h, awayC), bestSim(fm.a, homeC));
      const base = Math.max(direct, swap);
      const sc = base + (date && (fm.t || "").slice(0, 10) === date ? 0.25 : 0);
      if (base >= 0.6 && sc > bestScore) { bestScore = sc; best = fm; bestSwap = swap > direct; }
    }
    if (!best) return json({ error: "match not found on FotMob" }, env, 404);

    // 2) fetch + parse the match page
    const pageUrl = "https://www.fotmob.com" + String(best.pageUrl || "").split("#")[0];
    const content = getNext(await fmText(pageUrl))?.props?.pageProps?.content || {};
    const lineup = content?.lineup || {};
    const fmMatchId = lineup?.matchId || best?.id;

    const fmHomeIsOurHome = !bestSwap; // matched in direct (FotMob home == our home)?
    const fmHomeId = lineup?.homeTeam?.id ?? best?.hid;
    const fmAwayId = lineup?.awayTeam?.id ?? best?.aid;
    const id2tla = new Map<any, string>();
    if (fmHomeId != null) id2tla.set(fmHomeId, fmHomeIsOurHome ? hTla : aTla);
    if (fmAwayId != null) id2tla.set(fmAwayId, fmHomeIsOurHome ? aTla : hTla);
    const tlaOf = (id: any) => id2tla.get(id) ?? null;

    const team = extractTeam(content);
    if (!fmHomeIsOurHome) for (const t of team) { const tmp = t.home; t.home = t.away; t.away = tmp; }
    const players = extractPlayers(content, tlaOf);
    const shots = extractShots(content, tlaOf);
    const heatmap = fmMatchId ? await extractHeatmap(fmMatchId) : null;
    const hForm = lineup?.homeTeam?.formation, aForm = lineup?.awayTeam?.formation;
    const formations = { home: fmHomeIsOurHome ? hForm : aForm, away: fmHomeIsOurHome ? aForm : hForm };
    const hLu = extractStarters(lineup?.homeTeam), aLu = extractStarters(lineup?.awayTeam);
    const lineups = { home: fmHomeIsOurHome ? hLu : aLu, away: fmHomeIsOurHome ? aLu : hLu };

    const out = {
      fixtureId: fx, fmMatchId, homeTla: hTla, awayTla: aTla,
      finished: false, live: true, formations, lineup: lineups, team, players, shots, heatmap,
    };
    const resp = new Response(JSON.stringify(out), {
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=25", ...cors(env) },
    });
    ctx.waitUntil((caches as any).default.put(cacheKey, resp.clone()));
    return resp;
  } catch (e: any) {
    return json({ error: "fetch failed", detail: String(e?.message || e) }, env, 502);
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: cors(env) });

    // Knockout betting (/ko/*): login codes + per-person tips in KV.
    const ko = await handleKo(request, env);
    if (ko) return ko;

    // In-app presence + poke (/presence, /poke) for logged-in pool players.
    const pres = await handlePresence(request, env);
    if (pres) return pres;

    if (url.pathname === "/matchstats") return matchStats(url, env, ctx);

    if (url.pathname === "/vapidPublicKey") {
      return json({ key: env.VAPID_PUBLIC_KEY }, env);
    }

    if (url.pathname === "/subscribe" && request.method === "POST") {
      let body: StoredSub;
      try {
        body = (await request.json()) as StoredSub;
      } catch {
        return json({ error: "bad json" }, env, 400);
      }
      const endpoint = body?.subscription?.endpoint;
      if (!endpoint) return json({ error: "missing subscription" }, env, 400);
      const id = await hashEndpoint(endpoint);
      const key = "sub:" + id;
      const record = {
        subscription: body.subscription,
        notifyAll: !!body.notifyAll,
        player: (body.player || "").trim() || undefined,
        ts: Date.now(),
      };
      // The client re-syncs on every page load. Writing every time would burn
      // through KV's ~1000/day free write limit, so only write when something
      // actually changed or the 40-day TTL needs a refresh (>7 days old). Reads
      // are far cheaper (100k/day), so the get-before-put is a good trade.
      const existing = await env.SUBS.get(key);
      let skip = false;
      if (existing) {
        try {
          const ex = JSON.parse(existing);
          skip =
            ex.notifyAll === record.notifyAll &&
            ex.player === record.player &&
            ex.subscription?.endpoint === record.subscription.endpoint &&
            ex.subscription?.keys?.p256dh === record.subscription.keys?.p256dh &&
            typeof ex.ts === "number" &&
            Date.now() - ex.ts < 7 * 86400000;
        } catch {
          /* corrupt record — fall through and overwrite */
        }
      }
      if (!skip) await env.SUBS.put(key, JSON.stringify(record), { expirationTtl: 60 * 60 * 24 * 40 });
      return json({ ok: true }, env);
    }

    if (url.pathname === "/test" && request.method === "POST") {
      let body: any;
      try {
        body = await request.json();
      } catch {
        return json({ error: "bad json" }, env, 400);
      }
      const subscription = body?.subscription;
      if (!subscription?.endpoint) return json({ error: "missing subscription" }, env, 400);
      try {
        await sendPush(env, subscription, {
          title: "🔔 Notiser på — mål, avspark & slut",
          body: "",
          tag: "vm26-welcome",
          url: env.ALLOW_ORIGIN,
        });
        return json({ ok: true }, env);
      } catch (e: any) {
        return json({ ok: false, status: e?.status || 0 }, env, 200);
      }
    }

    if (url.pathname === "/unsubscribe" && request.method === "POST") {
      let body: any;
      try {
        body = await request.json();
      } catch {
        return json({ error: "bad json" }, env, 400);
      }
      const endpoint = body?.endpoint || body?.subscription?.endpoint;
      if (endpoint) await env.SUBS.delete("sub:" + (await hashEndpoint(endpoint)));
      return json({ ok: true }, env);
    }

    return new Response("VM2026 push worker", { status: 404, headers: cors(env) });
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(poll(env));
    ctx.waitUntil(koRemindTick(env));
  },
};

// Gather every stored push subscription (sub:*) that opted into notifications.
async function gatherSubs(env: Env): Promise<{ name: string; rec: StoredSub }[]> {
  const subs: { name: string; rec: StoredSub }[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.SUBS.list({ prefix: "sub:", cursor });
    for (const k of page.keys) {
      const v = await env.SUBS.get(k.name);
      if (v) subs.push({ name: k.name, rec: JSON.parse(v) as StoredSub });
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return subs.filter((s) => s.rec.notifyAll);
}

// Push KO-tip reminders to everyone who has notifications on, so nobody forgets to
// submit their slutspelstips. Reminders are PER MATCH now (open / 24h / 3h / 1h before
// each match kicks off), but a single tick collapses every due milestone into ONE push
// that spells out how many matches are open to tip — no spam when a draw opens several.
async function koRemindTick(env: Env): Promise<void> {
  const { due, openCount, soonestKickoff, urgency } = await koDueReminders(env, Date.now());
  if (!due.length) return;
  const recipients = await gatherSubs(env);
  const origin = (env.ALLOW_ORIGIN || "").replace(/\/$/, "");
  // Tag varies by urgency + soonest deadline so a genuinely new reminder shows instead
  // of silently replacing the previous one.
  const tag = `koremind-${urgency}-${Number.isFinite(soonestKickoff) ? soonestKickoff : "x"}`;
  const url = `${origin || ""}/?ko=1`;
  // Per-person: a recipient linked to a KO player only gets reminded about the matches
  // THEY haven't tipped — and is skipped entirely once they've tipped every open match.
  const openIds = recipients.length ? await openFixtureIds(env, Date.now()) : new Set<string>();
  await Promise.allSettled(
    recipients.map(async (s) => {
      let count = openCount;
      if (s.rec.player) {
        count = await koUntippedForName(env, s.rec.player, openIds);
        if (count === 0) return; // already tipped everything open → don't nag
      }
      const { title, body } = koReminderMessage(urgency, count);
      return sendPush(env, s.rec.subscription, { title, body, tag, url }).catch(async (err: any) => {
        if (err && (err.status === 404 || err.status === 410)) await env.SUBS.delete(s.name);
      });
    })
  );
  // Mark sent even with zero recipients so we don't re-evaluate the same milestones forever.
  for (const r of due) await markKoReminderSent(env, r.fixtureId, r.milestone);
}

interface LiveEvent {
  id: string;
  homeName: string;
  awayName: string;
  home: number;
  away: number;
  state: string; // pre | in | post
  note: string;
}

async function fetchEvents(): Promise<LiveEvent[]> {
  const out: LiveEvent[] = [];
  const seen = new Set<string>();
  for (const day of utcDates(Date.now())) {
    try {
      const r = await fetch(SCOREBOARD + day, { cf: { cacheTtl: 0 } } as RequestInit);
      if (!r.ok) continue;
      const j: any = await r.json();
      for (const ev of j.events || []) {
        const id = String(ev.id || ev.uid || "");
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const comp = (ev.competitions || [])[0];
        if (!comp) continue;
        const cs = comp.competitors || [];
        const h = cs.find((c: any) => c.homeAway === "home");
        const a = cs.find((c: any) => c.homeAway === "away");
        if (!h || !a) continue;
        const type = (ev.status || comp.status || {}).type || {};
        const homeName = h.team?.displayName || h.team?.name || h.team?.shortDisplayName || "";
        const awayName = a.team?.displayName || a.team?.name || a.team?.shortDisplayName || "";
        // Group/round label if ESPN provides one — else empty (the title already
        // carries the teams + score; "VM 2026" as a body just duplicates the app name).
        const note = (comp.notes && comp.notes[0]?.headline) || "";
        out.push({
          id,
          homeName,
          awayName,
          home: Number(h.score) || 0,
          away: Number(a.score) || 0,
          state: type.state || "",
          note,
        });
      }
    } catch {
      /* best-effort per day */
    }
  }
  return out;
}

interface Alert {
  eid: string;
  key: string; // team-pair key → deep-links the notification to the match
  kind: "goal" | "ko" | "ft";
  total: number;
  title: string;
  body: string;
}

async function poll(env: Env): Promise<void> {
  const events = await fetchEvents();
  if (!events.length) return;

  const prevRaw = await env.SUBS.get("goalstate");
  const prev: Record<string, { g: number; state: string }> = prevRaw ? JSON.parse(prevRaw) : {};
  const next: Record<string, { g: number; state: string }> = {};
  const alerts: Alert[] = [];

  for (const e of events) {
    const g = e.home + e.away;
    next[e.id] = { g, state: e.state };
    const p = prev[e.id];
    if (!p) continue; // first time we see it — baseline only, no alert
    const score = `${e.homeName} ${e.home}–${e.away} ${e.awayName}`;
    const key = matchPairKey(e.homeName, e.awayName);
    if (e.state === "in" && g > p.g) {
      alerts.push({ eid: e.id, key, kind: "goal", total: g, title: `⚽ Mål! ${score}`, body: e.note });
    } else if (p.state === "pre" && e.state === "in") {
      alerts.push({ eid: e.id, key, kind: "ko", total: g, title: `🟢 Avspark: ${e.homeName} – ${e.awayName}`, body: e.note });
    } else if (p.state !== "post" && e.state === "post") {
      alerts.push({ eid: e.id, key, kind: "ft", total: g, title: `Slut: ${score}`, body: e.note });
    }
  }

  // Only write when the state actually changed. The cron fires every minute, but
  // KV's free tier allows ~1000 writes/day — an unconditional put here (1440/day)
  // blows the daily limit. Canonicalise with sorted keys so an unchanged poll is
  // byte-identical to what's stored and we skip the write entirely.
  const sorted: Record<string, { g: number; state: string }> = {};
  for (const k of Object.keys(next).sort()) sorted[k] = next[k];
  const nextRaw = JSON.stringify(sorted);
  if (nextRaw !== prevRaw) await env.SUBS.put("goalstate", nextRaw);
  if (!alerts.length) return;

  // gather subscriptions
  const subs: { name: string; rec: StoredSub }[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.SUBS.list({ prefix: "sub:", cursor });
    for (const k of page.keys) {
      const v = await env.SUBS.get(k.name);
      if (v) subs.push({ name: k.name, rec: JSON.parse(v) as StoredSub });
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  if (!subs.length) return;

  const recipients = subs.filter((s) => s.rec.notifyAll);
  if (!recipients.length) return;

  const sends: Promise<void>[] = [];
  const origin = (env.ALLOW_ORIGIN || "").replace(/\/$/, "");
  for (const a of alerts) {
    const tag = `${a.kind}-${a.eid}-${a.total}`;
    const url = a.key ? `${origin}/?m=${encodeURIComponent(a.key)}` : origin || "/";
    for (const s of recipients) {
      sends.push(
        sendPush(env, s.rec.subscription, { title: a.title, body: a.body, tag, url }).catch(
          async (err: any) => {
            if (err && (err.status === 404 || err.status === 410)) await env.SUBS.delete(s.name);
          }
        )
      );
    }
  }
  await Promise.allSettled(sends);
}

async function sendPush(
  env: Env,
  subscription: StoredSub["subscription"],
  payload: { title: string; body: string; tag: string; url: string }
): Promise<void> {
  const { endpoint, headers, body } = await buildPushHTTPRequest({
    privateJWK: JSON.parse(env.VAPID_PRIVATE_KEY),
    subscription,
    message: {
      payload,
      adminContact: env.ADMIN_CONTACT,
      options: { ttl: 1800, urgency: "high" },
    },
  });
  const res = await fetch(endpoint, { method: "POST", headers, body });
  if (!res.ok) {
    const err: any = new Error(`push failed ${res.status}`);
    err.status = res.status;
    throw err;
  }
}
