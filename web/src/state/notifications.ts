import { create } from "zustand";

const SUBS_KEY = "vm_notify_subs_v1";
const KO_KEY = "vm_notify_kickoff_v1";
const SEEN_KEY = "vm_notify_seen_v1";

function loadSubs(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SUBS_KEY) || "[]");
  } catch {
    return [];
  }
}

// Per-match {goals, status} we've already alerted on, persisted so that a goal
// scored while the app was backgrounded/closed still fires a catch-up alert the
// moment the user reopens it (mobile browsers kill the tab, wiping in-memory
// state — without this the watcher would re-baseline to the current score and
// stay silent about everything that happened while away).
export type SeenMap = Record<string, { g: number; status: string }>;
export function loadSeen(): SeenMap {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) || "{}");
  } catch {
    return {};
  }
}
export function saveSeen(map: SeenMap) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

interface NotifState {
  supported: boolean;
  permission: NotificationPermission;
  subscribed: string[]; // match ids you want notified about (goals/kickoff/full-time)
  kickoffAll: boolean; // notify when ANY match kicks off
  request: () => Promise<boolean>;
  toggleMatch: (id: string) => Promise<void>;
  setKickoffAll: (v: boolean) => Promise<void>;
}

export const useNotif = create<NotifState>((set, get) => ({
  supported: typeof window !== "undefined" && "Notification" in window,
  permission: typeof window !== "undefined" && "Notification" in window ? Notification.permission : "denied",
  subscribed: loadSubs(),
  kickoffAll: (() => {
    try {
      return localStorage.getItem(KO_KEY) === "1";
    } catch {
      return false;
    }
  })(),

  request: async () => {
    if (!("Notification" in window)) return false;
    let perm = Notification.permission;
    if (perm === "default") perm = await Notification.requestPermission();
    set({ permission: perm });
    return perm === "granted";
  },

  toggleMatch: async (id) => {
    const ok = await get().request();
    if (!ok) return;
    const cur = get().subscribed;
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    try {
      localStorage.setItem(SUBS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    set({ subscribed: next });
  },

  setKickoffAll: async (v) => {
    if (v) {
      const ok = await get().request();
      if (!ok) return;
    }
    try {
      localStorage.setItem(KO_KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
    set({ kickoffAll: v });
  },
}));

// Notification Triggers (Chromium) let us schedule a kickoff notification that
// fires even when the tab/app is CLOSED — no backend needed. Unsupported on
// Safari/iOS (there we fall back to foreground-only notifications).
export function triggersSupported(): boolean {
  try {
    return (
      "serviceWorker" in navigator &&
      "Notification" in window &&
      "showTrigger" in Notification.prototype &&
      typeof (window as unknown as { TimestampTrigger?: unknown }).TimestampTrigger !== "undefined"
    );
  } catch {
    return false;
  }
}

export async function syncKickoffTriggers(items: { tag: string; ts: number; title: string; body: string }[]) {
  if (!triggersSupported() || Notification.permission !== "granted") return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.getNotifications();
    existing.filter((n) => (n.tag || "").startsWith("kosched-")).forEach((n) => n.close());
    const TT = (window as unknown as { TimestampTrigger: new (t: number) => unknown }).TimestampTrigger;
    for (const it of items) {
      if (it.ts <= Date.now()) continue;
      await reg.showNotification(it.title, {
        body: it.body,
        tag: it.tag,
        icon: "/images/wc2026-logo.svg",
        // @ts-expect-error showTrigger is experimental
        showTrigger: new TT(it.ts),
        data: { url: "/" },
      });
    }
  } catch {
    /* ignore */
  }
}

// serviceWorker.ready never rejects — if the SW failed to register it just hangs.
// Race it against a short timeout so a missing SW falls back instead of hanging.
function swReady(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return Promise.resolve(null);
  return Promise.race([
    navigator.serviceWorker.ready.catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
  ]);
}

export async function fireNotification(title: string, body: string, tag: string) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const opts: NotificationOptions & { renotify?: boolean } = {
    body,
    tag,
    renotify: true,
    icon: "/images/wc2026-logo.svg",
    badge: "/images/wc2026-logo.svg",
    data: { url: "/" },
  };
  // Prefer the service worker's showNotification(): on Chrome for ANDROID the
  // `new Notification()` constructor throws ("Illegal constructor"), so the old
  // path silently failed on mobile. The SW path works on desktop AND mobile.
  try {
    const reg = await swReady();
    if (reg) {
      await reg.showNotification(title, opts);
      return;
    }
  } catch {
    /* fall through to the constructor */
  }
  try {
    new Notification(title, opts);
  } catch {
    /* ignore (e.g. mobile without an active SW) */
  }
}
