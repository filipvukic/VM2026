import { create } from "zustand";

const SUBS_KEY = "vm_notify_subs_v1";
const KO_KEY = "vm_notify_kickoff_v1";

function loadSubs(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SUBS_KEY) || "[]");
  } catch {
    return [];
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

export function fireNotification(title: string, body: string, tag: string) {
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, { body, tag, icon: "/images/wc2026-logo.svg" });
    }
  } catch {
    /* ignore */
  }
}
