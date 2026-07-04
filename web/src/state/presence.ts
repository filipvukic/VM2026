import { create } from "zustand";
import { PUSH_WORKER_URL } from "../lib/pushConfig";
import { useKoBets } from "./koBets";

// In-app presence + "poke" (puffa). Near-real-time without blowing the KV free tier:
// a cheap GET poll (~7s) reads who's online, and we only WRITE on arrive / keepalive /
// leave. An explicit leave (tab hidden >2s, or page close via sendBeacon) removes you so
// others see you gone within a poll. Only active for logged-in players.
interface PokeIn { from: string; ts: number }

// You can poke the same person again once per minute (matches the worker cooldown).
export const POKE_COOLDOWN_MS = 60_000;

interface PresenceState {
  online: string[]; // names online now (INCLUDING yourself)
  incoming: PokeIn[]; // pokes received → toast + clear
  pokedAt: Record<string, number>; // name → last-poked ms (1-min cooldown, then resets)
  dismissPoke: (i: number) => void;
  poke: (to: string) => Promise<boolean>;
  announce: () => Promise<void>; // WRITE: arrive / keepalive
  poll: () => Promise<void>; // READ: frequent, cheap
  leave: () => Promise<void>; // WRITE: explicit leave (fetch)
  leaveBeacon: () => void; // best-effort leave on page close
}

// Persist the last-poked timestamps for the session so a reload keeps the cooldown honest.
const SS = "vm_pokedAt";
const initialPokedAt: Record<string, number> = (() => {
  try { return JSON.parse(sessionStorage.getItem(SS) || "{}"); } catch { return {}; }
})();
const savePokedAt = (p: Record<string, number>) => { try { sessionStorage.setItem(SS, JSON.stringify(p)); } catch { /* private mode */ } };

const post = (path: string, body: unknown) =>
  fetch(PUSH_WORKER_URL + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

type PresResp = { online: string[]; pokes: PokeIn[] };
const applyResp = (
  set: (fn: (s: PresenceState) => Partial<PresenceState>) => void,
  d: PresResp,
) => set((s) => ({ online: d.online || [], incoming: [...s.incoming, ...(d.pokes || [])] }));

export const usePresence = create<PresenceState>((set, get) => ({
  online: [],
  incoming: [],
  pokedAt: initialPokedAt,
  dismissPoke: (i) => set((s) => ({ incoming: s.incoming.filter((_, k) => k !== i) })),

  poke: async (to) => {
    const me = useKoBets.getState().name;
    if (!me) return false;
    const last = get().pokedAt[to] || 0;
    if (Date.now() - last < POKE_COOLDOWN_MS) return false; // still on cooldown
    const pokedAt = { ...get().pokedAt, [to]: Date.now() };
    set({ pokedAt });
    savePokedAt(pokedAt);
    try {
      const r = await post("/poke", { from: me, to });
      const d = (await r.json()) as { ok?: boolean };
      return !!d.ok;
    } catch {
      return false;
    }
  },

  announce: async () => {
    const me = useKoBets.getState().name;
    if (!me) { set({ online: [] }); return; }
    try {
      const r = await post("/presence", { name: me });
      if (r.ok) applyResp(set, (await r.json()) as PresResp);
    } catch { /* offline / CORS on localhost */ }
  },

  poll: async () => {
    const me = useKoBets.getState().name;
    if (!me) { set({ online: [] }); return; }
    try {
      const r = await fetch(PUSH_WORKER_URL + "/presence?me=" + encodeURIComponent(me));
      if (r.ok) applyResp(set, (await r.json()) as PresResp);
    } catch { /* offline / CORS on localhost */ }
  },

  leave: async () => {
    const me = useKoBets.getState().name;
    set({ online: [] });
    if (!me) return;
    try { await post("/presence/leave?name=" + encodeURIComponent(me), {}); } catch { /* ignore */ }
  },

  leaveBeacon: () => {
    const me = useKoBets.getState().name;
    if (!me || typeof navigator === "undefined" || !navigator.sendBeacon) return;
    try { navigator.sendBeacon(PUSH_WORKER_URL + "/presence/leave?name=" + encodeURIComponent(me)); } catch { /* ignore */ }
  },
}));

const POLL_MS = 7000;
const KEEPALIVE_MS = 240000; // refresh my ts every 4 min so long sessions don't go stale
const HIDE_DEBOUNCE_MS = 2000; // ignore quick app-switches so they don't churn KV writes
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let leaveTimer: ReturnType<typeof setTimeout> | null = null;
let lastAnnounce = 0;
let joined = false; // am I currently in the presence key?

async function join() {
  lastAnnounce = Date.now();
  joined = true;
  await usePresence.getState().announce();
}

export function startPresence() {
  if (pollTimer || typeof document === "undefined") return;

  const cycle = async () => {
    pollTimer = null;
    const me = useKoBets.getState().name;
    if (me && !document.hidden) {
      if (!joined || Date.now() - lastAnnounce > KEEPALIVE_MS) await join();
      else await usePresence.getState().poll();
    }
    pollTimer = setTimeout(cycle, POLL_MS);
  };

  // Join immediately if already logged in + visible.
  if (useKoBets.getState().name && !document.hidden) join();
  cycle();

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      // Debounced leave — a quick flick to another app and back writes nothing.
      if (!leaveTimer) leaveTimer = setTimeout(() => { leaveTimer = null; joined = false; usePresence.getState().leave(); }, HIDE_DEBOUNCE_MS);
    } else {
      if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; } // never actually left
      if (useKoBets.getState().name && !joined) join();
      else usePresence.getState().poll(); // refresh the list right away
    }
  });

  // Reliable leave when the tab/app actually closes.
  const beacon = () => { joined = false; usePresence.getState().leaveBeacon(); };
  window.addEventListener("pagehide", beacon);
  window.addEventListener("beforeunload", beacon);

  // React to login/logout immediately.
  useKoBets.subscribe((s, prev) => {
    if (s.name && s.name !== prev.name) join();
    else if (!s.name && prev.name) { joined = false; usePresence.getState().leave(); }
  });
}
