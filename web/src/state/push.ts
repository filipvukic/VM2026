// Web Push client: subscribes the browser to the Cloudflare push worker and tells
// it whether this browser wants alerts. When configured + granted + on, goal /
// kickoff / full-time alerts for ALL matches arrive even with the app closed (the
// worker polls ESPN and sends them) — so the in-app foreground watcher stands down.
import { PUSH_WORKER_URL } from "../lib/pushConfig";
import { useKoBets } from "./koBets";

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

// Register this browser's on/off state with the worker. Subscribes on first
// enable; when off, just tells the worker to stop (keeps the subscription).
// Returns true when the worker is actively covering this browser. Safe to call
// often — it no-ops when nothing changed.
export async function syncPush(notifyAll: boolean): Promise<boolean> {
  if (!pushConfigured() || Notification.permission !== "granted") return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      if (!notifyAll) return false; // not subscribed and not enabling → nothing to do
      const key = await getVapidKey();
      if (!key) return false;
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
      });
    }
    // Link this browser to the logged-in KO player so reminders only nag about matches
    // this person hasn't tipped (and skip them once they're done).
    const player = useKoBets.getState().name || undefined;
    const payload = JSON.stringify({ subscription: sub.toJSON(), notifyAll, player });
    if (payload !== lastPayload) {
      const r = await fetch(PUSH_WORKER_URL + "/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      });
      if (!r.ok) return false;
      lastPayload = payload;
    }
    return notifyAll;
  } catch {
    return false;
  }
}

// Ask the worker to send a REAL push to this browser right now — used as the
// "notifications on" confirmation so the user sees the full closed-app path work.
// Returns false if push isn't configured/granted or the send failed.
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
