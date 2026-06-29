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
const STAGE_ROUND: Record<string, string> = {
  LAST_32: "r32", LAST_16: "r16", QUARTER_FINALS: "qf", SEMI_FINALS: "sf", THIRD_PLACE: "third", FINAL: "final",
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

function byRound(fx: KoFixture[]): Map<string, KoFixture[]> {
  const m = new Map<string, KoFixture[]>();
  for (const f of fx) {
    const a = m.get(f.round) ?? [];
    a.push(f);
    m.set(f.round, a);
  }
  return m;
}

// PER-ROUND lock: a whole round is tippable once ALL its matches are drawn AND it
// hasn't started (its earliest kickoff is in the future). Tips are submitted per
// round, not per match, so the round locks as a unit the moment its first match
// kicks off. Returns the fixture ids of every currently-open round.
async function openFixtureIds(env: KoEnv, now: number): Promise<Set<string>> {
  const open = new Set<string>();
  for (const [, list] of byRound(await koFixtures(env))) {
    if (!list.every((f) => f.homeTla && f.awayTla)) continue; // round not fully drawn
    const first = Math.min(...list.map((f) => f.kickoff).filter((k) => Number.isFinite(k)));
    if (!Number.isFinite(first) || first <= now) continue; // started / no time → locked
    for (const f of list) open.add(f.id);
  }
  return open;
}

// --- reminder notifications: nag everyone to submit a round's tips before it locks ---
const ROUND_LABEL: Record<string, string> = {
  r32: "sextondelsfinalerna",
  r16: "åttondelsfinalerna",
  qf: "kvartsfinalerna",
  sf: "semifinalerna",
  third: "bronsmatchen",
  final: "finalen",
};
const REMIND_ORDER = ["open", "h24", "h3", "h1"];
const remindKey = (round: string) => "koremind:" + round;

export interface KoReminder {
  round: string;
  label: string;
  firstKickoff: number;
  milestone: string;
}

// Reminders DUE now for open rounds (the most urgent un-sent milestone per round).
// Milestones: when the round opens, then 24h / 3h / 1h before it locks. Does NOT mark
// them sent — the caller sends the push first, then calls markKoReminderSent, so a
// failed tick retries next minute.
export async function koDueReminders(env: KoEnv, now: number): Promise<KoReminder[]> {
  const out: KoReminder[] = [];
  for (const [round, list] of byRound(await koFixtures(env))) {
    if (!list.every((f) => f.homeTla && f.awayTla)) continue;
    const first = Math.min(...list.map((f) => f.kickoff).filter((k) => Number.isFinite(k)));
    if (!Number.isFinite(first) || first <= now) continue; // locked / no time
    const hoursLeft = (first - now) / 3_600_000;
    const sentRaw = await env.SUBS.get(remindKey(round));
    const sent: string[] = sentRaw ? JSON.parse(sentRaw) : [];
    const due: string[] = [];
    if (!sent.includes("open")) due.push("open");
    if (hoursLeft <= 24 && !sent.includes("h24")) due.push("h24");
    if (hoursLeft <= 3 && !sent.includes("h3")) due.push("h3");
    if (hoursLeft <= 1 && !sent.includes("h1")) due.push("h1");
    if (due.length) out.push({ round, label: ROUND_LABEL[round] || round, firstKickoff: first, milestone: due[due.length - 1] });
  }
  return out;
}

// Mark every milestone up to & including `milestone` as sent (so stale earlier ones
// aren't fired late if a round is drawn close to kickoff).
export async function markKoReminderSent(env: KoEnv, round: string, milestone: string): Promise<void> {
  const upto = REMIND_ORDER.slice(0, REMIND_ORDER.indexOf(milestone) + 1);
  const sentRaw = await env.SUBS.get(remindKey(round));
  const sent: string[] = sentRaw ? JSON.parse(sentRaw) : [];
  await env.SUBS.put(remindKey(round), JSON.stringify([...new Set([...sent, ...upto])]));
}

export function koReminderMessage(r: KoReminder): { title: string; body: string } {
  if (r.milestone === "h1") return { title: "🚨 Snart stängt!", body: `Mindre än en timme kvar att tippa ${r.label}. Sista chansen!` };
  if (r.milestone === "h3") return { title: "⏰ Snart dags", body: `Bara några timmar kvar att tippa ${r.label} — missa inte att lägga in dina tips.` };
  if (r.milestone === "h24") return { title: "⏰ Sista dygnet att tippa", body: `Glöm inte slutspelstipset för ${r.label}!` };
  return { title: "🏆 Slutspelstips öppet!", body: `Dags att tippa ${r.label} — lägg in dina resultat innan första matchen startar.` };
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

  // Admin/engine: every participant's KO tips, keyed by name.
  if (p === "/ko/all" && request.method === "GET") {
    if (url.searchParams.get("key") !== env.KO_ADMIN_KEY) return jsonRes({ error: "forbidden" }, env, 403);
    const out: Record<string, Bets> = {};
    for (const name of await participants(env)) {
      const b = await getBets(env, name);
      if (Object.keys(b).length) out[name] = b;
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
