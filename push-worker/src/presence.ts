// Lightweight in-app presence + "poke" (puffa) for logged-in pool players. Deliberately
// KV-frugal to stay inside the Workers FREE tier: each heartbeat is ONE self-keyed put
// with a TTL (auto-expires → no read-modify-write, no write contention), one list() to
// read who's online, and pokes are delivered IN-APP on the target's next heartbeat (no
// web-push). The frontend only heartbeats when logged in + tab-visible + ~4 min apart,
// so ~11 players stay well under the 1000 writes/day free limit.

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

const PRES_TTL = 360; // seconds a heartbeat keeps you "online" (~6 min)
const POKE_TTL = 600; // a pending poke lives ~10 min then expires
const POKE_COOLDOWN = 3600; // server guard: at most one poke per from→to per hour
const presKey = (n: string) => "pres:" + n;
const pokeKey = (n: string) => "poke:" + n;
const pokeMark = (a: string, b: string) => "pokemark:" + a + ":" + b;

interface Poke {
  from: string;
  ts: number;
}

export async function handlePresence(request: Request, env: PresEnv): Promise<Response | null> {
  const url = new URL(request.url);
  const p = url.pathname;
  if (p !== "/presence" && p !== "/poke") return null;
  if (request.method === "OPTIONS") return new Response(null, { headers: cors(env) });

  // Heartbeat + fetch in one call: mark me online, return who else is online + my pokes.
  if (p === "/presence" && request.method === "POST") {
    const body = (await request.json().catch(() => ({}))) as { name?: string };
    const name = (body.name || "").trim();
    const norm = normName(name);
    if (!norm) return jsonRes({ online: [], pokes: [] }, env);
    const now = Date.now();
    await env.SUBS.put(presKey(norm), String(now), { expirationTtl: PRES_TTL, metadata: { name } });
    // Online = every unexpired pres: key; the name rides along as key metadata, so this
    // is a single list() with no per-key reads.
    const list = await env.SUBS.list({ prefix: "pres:" });
    const online = [
      ...new Set(
        list.keys
          .map((k) => (k.metadata as { name?: string } | undefined)?.name)
          .filter((n): n is string => !!n),
      ),
    ];
    // Pending pokes for me (then clear them).
    let pokes: Poke[] = [];
    const raw = await env.SUBS.get(pokeKey(norm));
    if (raw) {
      try { pokes = JSON.parse(raw) as Poke[]; } catch { pokes = []; }
      await env.SUBS.delete(pokeKey(norm));
    }
    return jsonRes({ online, pokes }, env);
  }

  // Poke another player — delivered in-app on their next heartbeat.
  if (p === "/poke" && request.method === "POST") {
    const body = (await request.json().catch(() => ({}))) as { from?: string; to?: string };
    const from = (body.from || "").trim();
    const to = (body.to || "").trim();
    const nf = normName(from), nt = normName(to);
    if (!nf || !nt || nf === nt) return jsonRes({ ok: false }, env, 400);
    // Cooldown so nobody can spam (the client also caps 1 per player per session).
    if (await env.SUBS.get(pokeMark(nf, nt))) return jsonRes({ ok: false, reason: "cooldown" }, env);
    const raw = await env.SUBS.get(pokeKey(nt));
    const list: Poke[] = raw ? (JSON.parse(raw) as Poke[]) : [];
    if (!list.some((x) => normName(x.from) === nf)) list.push({ from, ts: Date.now() });
    await env.SUBS.put(pokeKey(nt), JSON.stringify(list), { expirationTtl: POKE_TTL });
    await env.SUBS.put(pokeMark(nf, nt), "1", { expirationTtl: POKE_COOLDOWN });
    return jsonRes({ ok: true }, env);
  }

  return jsonRes({ error: "not found" }, env, 404);
}
