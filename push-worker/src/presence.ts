// In-app presence + "poke" (puffa) for logged-in pool players, tuned for near-real-time
// on the Workers FREE tier. The trick: DECOUPLE reads from writes. Presence lives in ONE
// shared KV key that clients READ often (a cheap GET, reads have a 100k/day budget) but
// WRITE rarely — only on arrive / keepalive / leave (writes are the scarce ~1k/day). An
// explicit /presence/leave (fired on tab-hide / close, incl. sendBeacon) removes you so
// others see you gone within one poll (~seconds), instead of waiting out a TTL. Pokes are
// delivered in-app on the next poll (no web-push). Crash-without-leave is the only slow
// case: a stale entry is pruned after STALE_MS.

interface PresEnv {
  SUBS: KVNamespace;
  ALLOW_ORIGIN: string;
}

const cors = (env: PresEnv) => ({
  "Access-Control-Allow-Origin": env.ALLOW_ORIGIN || "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
});
const jsonRes = (data: unknown, env: PresEnv, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...cors(env) } });
const normName = (s: string) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

const PRESENCE_KEY = "presence"; // single shared key: { norm: {name, ts} }
const STALE_MS = 8 * 60 * 1000; // prune presence entries older than this (missed keepalives / crash)
const POKE_TTL = 600; // a pending poke lives ~10 min then expires
const POKE_COOLDOWN = 60; // server guard: at most one poke per from→to per minute (resets)
const pokeKey = (n: string) => "poke:" + n;
const pokeMark = (a: string, b: string) => "pokemark:" + a + ":" + b;

interface Entry { name: string; ts: number }
type Presence = Record<string, Entry>;
interface Poke { from: string; ts: number }

async function readPresence(env: PresEnv): Promise<Presence> {
  const raw = await env.SUBS.get(PRESENCE_KEY);
  if (!raw) return {};
  try { return JSON.parse(raw) as Presence; } catch { return {}; }
}
function prune(p: Presence, now: number): Presence {
  const live: Presence = {};
  for (const [k, v] of Object.entries(p)) if (v && now - v.ts < STALE_MS) live[k] = v;
  return live;
}
const onlineNames = (p: Presence): string[] => [...new Set(Object.values(p).map((e) => e.name).filter(Boolean))];

// Read (and clear) any pending pokes for a normalized name.
async function takePokes(env: PresEnv, norm: string): Promise<Poke[]> {
  const raw = await env.SUBS.get(pokeKey(norm));
  if (!raw) return [];
  await env.SUBS.delete(pokeKey(norm));
  try { return JSON.parse(raw) as Poke[]; } catch { return []; }
}

export async function handlePresence(request: Request, env: PresEnv): Promise<Response | null> {
  const url = new URL(request.url);
  const p = url.pathname;
  if (p !== "/presence" && p !== "/presence/leave" && p !== "/poke") return null;
  if (request.method === "OPTIONS") return new Response(null, { headers: cors(env) });
  const now = Date.now();

  // WRITE — announce / keepalive. Refreshes my ts + returns who's online + my pokes.
  if (p === "/presence" && request.method === "POST") {
    const body = (await request.json().catch(() => ({}))) as { name?: string };
    const name = (body.name || "").trim();
    const norm = normName(name);
    const live = prune(await readPresence(env), now);
    if (norm) live[norm] = { name, ts: now };
    await env.SUBS.put(PRESENCE_KEY, JSON.stringify(live));
    const pokes = norm ? await takePokes(env, norm) : [];
    return jsonRes({ online: onlineNames(live), pokes }, env);
  }

  // READ — the frequent poll. Cheap (no write). `me` also returns+clears my pokes.
  if (p === "/presence" && request.method === "GET") {
    const me = normName(url.searchParams.get("me") || "");
    const live = prune(await readPresence(env), now); // in-memory prune only — no write
    const pokes = me ? await takePokes(env, me) : [];
    return jsonRes({ online: onlineNames(live), pokes }, env);
  }

  // WRITE — explicit leave (tab hidden / closed). Name via query so sendBeacon works.
  if (p === "/presence/leave" && (request.method === "POST" || request.method === "GET")) {
    const body = request.method === "POST" ? ((await request.json().catch(() => ({}))) as { name?: string }) : {};
    const norm = normName(url.searchParams.get("name") || body.name || "");
    if (norm) {
      const live = prune(await readPresence(env), now);
      delete live[norm];
      await env.SUBS.put(PRESENCE_KEY, JSON.stringify(live));
    }
    return jsonRes({ ok: true }, env);
  }

  // Poke another player — delivered in-app on their next poll.
  if (p === "/poke" && request.method === "POST") {
    const body = (await request.json().catch(() => ({}))) as { from?: string; to?: string };
    const from = (body.from || "").trim();
    const to = (body.to || "").trim();
    const nf = normName(from), nt = normName(to);
    if (!nf || !nt || nf === nt) return jsonRes({ ok: false }, env, 400);
    if (await env.SUBS.get(pokeMark(nf, nt))) return jsonRes({ ok: false, reason: "cooldown" }, env);
    const raw = await env.SUBS.get(pokeKey(nt));
    const list: Poke[] = raw ? (JSON.parse(raw) as Poke[]) : [];
    if (!list.some((x) => normName(x.from) === nf)) list.push({ from, ts: now });
    await env.SUBS.put(pokeKey(nt), JSON.stringify(list), { expirationTtl: POKE_TTL });
    await env.SUBS.put(pokeMark(nf, nt), "1", { expirationTtl: POKE_COOLDOWN });
    return jsonRes({ ok: true }, env);
  }

  return jsonRes({ error: "not found" }, env, 404);
}
