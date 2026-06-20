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

interface Env {
  SUBS: KVNamespace;
  VAPID_PRIVATE_KEY: string; // private JWK JSON string (secret)
  VAPID_PUBLIC_KEY: string; // base64url public key (var)
  ADMIN_CONTACT: string; // mailto:...
  ALLOW_ORIGIN: string; // site origin allowed to call /subscribe
}

const SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=";

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
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: cors(env) });

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
  },
};

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
    if (e.state === "in" && g > p.g) {
      alerts.push({ eid: e.id, kind: "goal", total: g, title: `⚽ Mål! ${score}`, body: e.note });
    } else if (p.state === "pre" && e.state === "in") {
      alerts.push({ eid: e.id, kind: "ko", total: g, title: `🟢 Avspark: ${e.homeName} – ${e.awayName}`, body: e.note });
    } else if (p.state !== "post" && e.state === "post") {
      alerts.push({ eid: e.id, kind: "ft", total: g, title: `Slut: ${score}`, body: e.note });
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
  for (const a of alerts) {
    const tag = `${a.kind}-${a.eid}-${a.total}`;
    for (const s of recipients) {
      sends.push(
        sendPush(env, s.rec.subscription, { title: a.title, body: a.body, tag, url: env.ALLOW_ORIGIN }).catch(
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
