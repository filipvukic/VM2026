// Knockout betting: per-participant tips for the KO rounds, stored in KV, gated by a
// per-person login code. Codes are DERIVED (HMAC of a secret + the participant's name)
// so nothing extra is stored and the admin can re-list them any time. Tips for a round
// can be entered/edited until that round STARTS (its first match kicks off); the round
// currently being played (and earlier) is locked. The engine reads GET /ko/all.
//
// Env (add to wrangler.toml / secrets):
//   KO_SECRET     (secret) — HMAC key the codes are derived from.
//   KO_ADMIN_KEY  (secret) — guards /ko/codes and /ko/all.
//   ALLOW_ORIGIN  (var)    — the site origin; we read its data.json + fixtures.json.

interface KoEnv {
  SUBS: KVNamespace;
  ALLOW_ORIGIN: string;
  KO_SECRET: string;
  KO_ADMIN_KEY: string;
}

const cors = (env: KoEnv) => ({
  "Access-Control-Allow-Origin": env.ALLOW_ORIGIN || "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
});
const jsonRes = (data: unknown, env: KoEnv, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...cors(env) } });

const normName = (s: string) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

// Unambiguous code alphabet (no 0/O/1/I/L).
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
async function deriveCode(secret: string, name: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(normName(name))));
  let out = "";
  for (let i = 0; i < 6; i++) out += CODE_ALPHABET[sig[i] % CODE_ALPHABET.length];
  return out;
}

// --- the site's committed data, lightly cached on the edge ---
async function fetchJson(env: KoEnv, path: string, ttl: number): Promise<unknown> {
  const u = (env.ALLOW_ORIGIN || "https://vmtipp.se").replace(/\/$/, "") + path;
  const cache = caches.default;
  const req = new Request(u);
  const hit = await cache.match(req);
  if (hit) return hit.json();
  const res = await fetch(u);
  if (!res.ok) throw new Error("fetch " + path + " " + res.status);
  const body = await res.text();
  await cache.put(req, new Response(body, { headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${ttl}` } }));
  return JSON.parse(body);
}

async function participants(env: KoEnv): Promise<string[]> {
  const d = (await fetchJson(env, "/data.json", 120)) as { leaderboard?: { name: string }[] };
  return (d.leaderboard || []).map((p) => p.name).filter(Boolean);
}

async function nameForCode(env: KoEnv, code: string): Promise<string | null> {
  const c = (code || "").toUpperCase().trim();
  if (c.length !== 6) return null;
  for (const name of await participants(env)) {
    if ((await deriveCode(env.KO_SECRET, name)) === c) return name;
  }
  return null;
}

interface KoFixture { id: string; round: string; homeTla: string | null; awayTla: string | null; kickoff: number }
// Slutspelstips covers the round of 16 onwards. The round of 32 (LAST_32) is
// deliberately EXCLUDED — it was only used to test the flow, so it is never tippable,
// merged into the pool, or reminded about, and any leftover r32 bets are filtered out.
const STAGE_ROUND: Record<string, string> = {
  LAST_16: "r16", QUARTER_FINALS: "qf", SEMI_FINALS: "sf", THIRD_PLACE: "third", FINAL: "final",
};

async function koFixtures(env: KoEnv): Promise<KoFixture[]> {
  const fx = (await fetchJson(env, "/fixtures.json", 60)) as {
    id: string | number; stage: string; homeTla?: string | null; awayTla?: string | null; utcDate?: string;
  }[];
  return (fx || [])
    .filter((f) => STAGE_ROUND[f.stage])
    .map((f) => ({
      id: String(f.id),
      round: STAGE_ROUND[f.stage],
      homeTla: f.homeTla || null,
      awayTla: f.awayTla || null,
      kickoff: f.utcDate ? Date.parse(f.utcDate) : NaN,
    }));
}

// PER-MATCH lock: each match becomes tippable the moment BOTH teams are drawn, and
// it locks individually when ITS OWN kickoff passes. You no longer have to wait for
// the whole round to be drawn — a match you can tip today is tippable today, even if
// its round-siblings haven't been decided yet. Returns every currently-open fixture id.
async function openFixtureIds(env: KoEnv, now: number): Promise<Set<string>> {
  const open = new Set<string>();
  for (const f of await koFixtures(env)) {
    if (!f.homeTla || !f.awayTla) continue; // not drawn yet
    if (!Number.isFinite(f.kickoff) || f.kickoff <= now) continue; // started / no time → locked
    open.add(f.id);
  }
  return open;
}

// --- reminder notifications: nag everyone to submit their tips before matches lock ---
// PER-MATCH milestones now: each match reminds on open (when drawn) / 24h / 3h / 1h
// before ITS OWN kickoff. To avoid spamming (a fresh draw can open several matches at
// once), the tick aggregates every due milestone into ONE push whose body says how
// many matches are open to tip and how soon the first one locks.
const REMIND_ORDER = ["open", "h24", "h3", "h1"];
const remindKey = (fixtureId: string) => "koremind:" + fixtureId;

export interface KoReminder {
  fixtureId: string;
  milestone: string;
}

export interface KoDue {
  due: KoReminder[]; // fixture+milestone pairs to mark sent after the push
  openCount: number; // how many matches are open to tip right now (drawn + not kicked off)
  soonestKickoff: number; // earliest kickoff among the open matches
  urgency: string; // most-urgent milestone among `due` (drives the push copy)
}

// Milestones DUE now across all open matches. Does NOT mark them sent — the caller
// sends the push first, then calls markKoReminderSent per pair, so a failed tick
// retries next minute.
export async function koDueReminders(env: KoEnv, now: number): Promise<KoDue> {
  const openMatches = (await koFixtures(env)).filter(
    (f) => f.homeTla && f.awayTla && Number.isFinite(f.kickoff) && f.kickoff > now,
  );
  const due: KoReminder[] = [];
  let urgencyRank = -1;
  let urgency = "open";
  for (const f of openMatches) {
    const hoursLeft = (f.kickoff - now) / 3_600_000;
    const sentRaw = await env.SUBS.get(remindKey(f.id));
    const sent: string[] = sentRaw ? JSON.parse(sentRaw) : [];
    let ms: string | null = null; // the single most-urgent un-sent milestone for this match
    if (!sent.includes("open")) ms = "open";
    if (hoursLeft <= 24 && !sent.includes("h24")) ms = "h24";
    if (hoursLeft <= 3 && !sent.includes("h3")) ms = "h3";
    if (hoursLeft <= 1 && !sent.includes("h1")) ms = "h1";
    if (ms) {
      due.push({ fixtureId: f.id, milestone: ms });
      const rank = REMIND_ORDER.indexOf(ms);
      if (rank > urgencyRank) { urgencyRank = rank; urgency = ms; }
    }
  }
  const soonestKickoff = openMatches.length ? Math.min(...openMatches.map((f) => f.kickoff)) : NaN;
  return { due, openCount: openMatches.length, soonestKickoff, urgency };
}

// Mark every milestone up to & including `milestone` as sent for one fixture (so stale
// earlier ones aren't fired late if a match is drawn close to its kickoff).
export async function markKoReminderSent(env: KoEnv, fixtureId: string, milestone: string): Promise<void> {
  const upto = REMIND_ORDER.slice(0, REMIND_ORDER.indexOf(milestone) + 1);
  const sentRaw = await env.SUBS.get(remindKey(fixtureId));
  const sent: string[] = sentRaw ? JSON.parse(sentRaw) : [];
  await env.SUBS.put(remindKey(fixtureId), JSON.stringify([...new Set([...sent, ...upto])]));
}

// One aggregated push for the whole tick — always spells out how many matches are open.
export function koReminderMessage(urgency: string, openCount: number): { title: string; body: string } {
  const n = openCount;
  const left = `${n} ${n === 1 ? "match" : "matcher"}`;
  if (urgency === "h1") return { title: "🚨 Snart stängt!", body: `Mindre än en timme kvar — ${left} kvar att tippa i slutspelet. Sista chansen!` };
  if (urgency === "h3") return { title: "⏰ Snart dags att tippa", body: `Några timmar kvar — du har ${left} öppna att tippa i slutspelet.` };
  if (urgency === "h24") return { title: "⏰ Sista dygnet att tippa", body: `Glöm inte slutspelstipset — ${left} öppna innan avspark.` };
  return { title: "🏆 Nya matcher att tippa!", body: `${left} i slutspelet ${n === 1 ? "är" : "är"} öppna att tippa. Lägg in dina resultat innan avspark.` };
}

const betsKey = (name: string) => "kobet:" + normName(name);
type Bets = Record<string, [number, number]>;

async function getBets(env: KoEnv, name: string): Promise<Bets> {
  const raw = await env.SUBS.get(betsKey(name));
  return raw ? (JSON.parse(raw) as Bets) : {};
}

export async function handleKo(request: Request, env: KoEnv): Promise<Response | null> {
  const url = new URL(request.url);
  const p = url.pathname;
  if (!p.startsWith("/ko/")) return null;
  if (request.method === "OPTIONS") return new Response(null, { headers: cors(env) });

  // Admin: list every participant's code to distribute.
  if (p === "/ko/codes" && request.method === "GET") {
    if (url.searchParams.get("key") !== env.KO_ADMIN_KEY) return jsonRes({ error: "forbidden" }, env, 403);
    const list = await Promise.all((await participants(env)).map(async (name) => ({ name, code: await deriveCode(env.KO_SECRET, name) })));
    return jsonRes(list, env);
  }

  // Admin/engine: every participant's KO tips, keyed by name. Only bets for VALID
  // (round-of-16-onwards) fixtures are returned — any leftover r32 test bets are
  // dropped so the engine never merges or scores them.
  if (p === "/ko/all" && request.method === "GET") {
    if (url.searchParams.get("key") !== env.KO_ADMIN_KEY) return jsonRes({ error: "forbidden" }, env, 403);
    const valid = new Set((await koFixtures(env)).map((f) => f.id));
    const out: Record<string, Bets> = {};
    for (const name of await participants(env)) {
      const b = await getBets(env, name);
      const filtered: Bets = {};
      for (const [fid, tip] of Object.entries(b)) if (valid.has(fid)) filtered[fid] = tip;
      if (Object.keys(filtered).length) out[name] = filtered;
    }
    return jsonRes(out, env);
  }

  // Validate a code → who it belongs to.
  if (p === "/ko/login" && request.method === "POST") {
    const body = (await request.json().catch(() => ({}))) as { code?: string };
    const name = await nameForCode(env, body.code || "");
    return name ? jsonRes({ name }, env) : jsonRes({ error: "invalid code" }, env, 401);
  }

  // A participant's own stored tips + which fixtures are open right now.
  if (p === "/ko/bets" && request.method === "GET") {
    const name = await nameForCode(env, url.searchParams.get("code") || "");
    if (!name) return jsonRes({ error: "invalid code" }, env, 401);
    const open = await openFixtureIds(env, Date.now());
    return jsonRes({ name, bets: await getBets(env, name), open: [...open] }, env);
  }

  // Save tips (merge). Only fixtures whose round hasn't started are accepted; the rest
  // are ignored server-side so a closed round can't be edited via the API.
  if (p === "/ko/bets" && request.method === "POST") {
    const body = (await request.json().catch(() => ({}))) as { code?: string; bets?: Bets };
    const name = await nameForCode(env, body.code || "");
    if (!name) return jsonRes({ error: "invalid code" }, env, 401);
    const open = await openFixtureIds(env, Date.now());
    const current = await getBets(env, name);
    let changed = 0;
    for (const [fid, tip] of Object.entries(body.bets || {})) {
      if (!open.has(fid)) continue;
      if (!Array.isArray(tip) || tip.length !== 2) continue;
      const h = Math.max(0, Math.min(20, Math.round(Number(tip[0]))));
      const a = Math.max(0, Math.min(20, Math.round(Number(tip[1]))));
      if (Number.isNaN(h) || Number.isNaN(a)) continue;
      current[fid] = [h, a];
      changed++;
    }
    await env.SUBS.put(betsKey(name), JSON.stringify(current));
    return jsonRes({ name, bets: current, saved: changed, open: [...open] }, env);
  }

  return jsonRes({ error: "not found" }, env, 404);
}
