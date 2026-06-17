// Web Push client: subscribes the browser to the Cloudflare push worker and keeps
// the worker's copy of which matches to alert on in sync. When configured + granted,
// goal/kickoff/full-time alerts arrive even with the app closed (the worker polls
// ESPN and sends them) — so the in-app foreground watcher can stand down.
import { PUSH_WORKER_URL } from "../lib/pushConfig";

export interface WatchedMatch {
  key: string; // matchPairKey(home, away)
  label?: string; // e.g. "Grupp A" (shown in the notification body)
}

export function pushConfigured(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    !!PUSH_WORKER_URL
  );
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

async function getVapidKey(): Promise<string | null> {
  try {
    const r = await fetch(PUSH_WORKER_URL + "/vapidPublicKey");
    if (!r.ok) return null;
    const j = await r.json();
    return j.key || null;
  } catch {
    return null;
  }
}

let lastPayload = "";

// Subscribe (if needed) and push the current watch-list to the worker. Returns
// true when the worker is actively covering this browser. Safe to call often —
// it no-ops when the payload hasn't changed.
export async function syncPush(matches: WatchedMatch[], kickoffAll: boolean): Promise<boolean> {
  if (!pushConfigured() || Notification.permission !== "granted") return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const key = await getVapidKey();
      if (!key) return false;
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
      });
    }
    const payload = JSON.stringify({ subscription: sub.toJSON(), matches, kickoffAll });
    if (payload === lastPayload) return true; // nothing changed
    const r = await fetch(PUSH_WORKER_URL + "/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    });
    if (r.ok) lastPayload = payload;
    return r.ok;
  } catch {
    return false;
  }
}

// Ask the worker to send a REAL push to this browser right now — proves the full
// closed-app path end to end. Returns false if push isn't configured/granted, the
// worker lacks /test (not redeployed), or the send failed.
export async function sendTestPush(): Promise<boolean> {
  if (!pushConfigured() || Notification.permission !== "granted") return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const key = await getVapidKey();
      if (!key) return false;
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
      });
    }
    const r = await fetch(PUSH_WORKER_URL + "/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: sub.toJSON() }),
    });
    if (!r.ok) return false;
    const j = await r.json().catch(() => ({}));
    return !!j.ok;
  } catch {
    return false;
  }
}
