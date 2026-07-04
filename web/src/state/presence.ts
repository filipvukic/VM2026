import { create } from "zustand";
import { PUSH_WORKER_URL } from "../lib/pushConfig";
import { useKoBets } from "./koBets";

// In-app presence + "poke" (puffa). Only active for logged-in pool players. The poller
// heartbeats to the worker (which returns who else is online + any pokes for me) — but
// ONLY when logged in and the tab is visible, ~4 min apart, to stay tiny on KV writes.
interface PokeIn { from: string; ts: number }

interface PresenceState {
  online: string[]; // names online now (self filtered out)
  incoming: PokeIn[]; // pokes received → toast + clear
  poked: string[]; // names I've poked this session (max 1 each)
  dismissPoke: (i: number) => void;
  poke: (to: string) => Promise<boolean>;
  beat: () => Promise<void>;
}

const norm = (s: string) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

// Persist the "already poked" set for the session so a reload doesn't reset the 1-each cap.
const SS = "vm_poked";
const initialPoked: string[] = (() => {
  try { return JSON.parse(sessionStorage.getItem(SS) || "[]"); } catch { return []; }
})();
const savePoked = (p: string[]) => { try { sessionStorage.setItem(SS, JSON.stringify(p)); } catch { /* private mode */ } };

const api = (path: string, body: unknown) =>
  fetch(PUSH_WORKER_URL + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const usePresence = create<PresenceState>((set, get) => ({
  online: [],
  incoming: [],
  poked: initialPoked,
  dismissPoke: (i) => set((s) => ({ incoming: s.incoming.filter((_, k) => k !== i) })),

  poke: async (to) => {
    const me = useKoBets.getState().name;
    if (!me || get().poked.includes(to)) return false;
    // Optimistically mark as poked (so the button disables and can't be spammed).
    const poked = [...new Set([...get().poked, to])];
    set({ poked });
    savePoked(poked);
    try {
      const r = await api("/poke", { from: me, to });
      const d = (await r.json()) as { ok?: boolean };
      return !!d.ok;
    } catch {
      return false;
    }
  },

  beat: async () => {
    const me = useKoBets.getState().name;
    if (!me) { set({ online: [], incoming: [] }); return; }
    try {
      const r = await api("/presence", { name: me });
      if (!r.ok) return;
      const d = (await r.json()) as { online: string[]; pokes: PokeIn[] };
      const meNorm = norm(me);
      const online = (d.online || []).filter((n) => norm(n) !== meNorm);
      set((s) => ({ online, incoming: [...s.incoming, ...(d.pokes || [])] }));
    } catch {
      /* offline / CORS on localhost — presence just stays empty */
    }
  },
}));

let timer: ReturnType<typeof setTimeout> | null = null;

// Start the heartbeat loop. Beats only when logged in + visible (KV-frugal), and beats
// immediately on login so you show up right away.
export function startPresence() {
  if (timer) return;
  const tick = async () => {
    timer = null;
    const hidden = typeof document !== "undefined" && document.hidden;
    if (useKoBets.getState().name && !hidden) await usePresence.getState().beat();
    timer = setTimeout(tick, hidden ? 300000 : 240000); // 5 min hidden, 4 min visible
  };
  tick();
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && timer) { clearTimeout(timer); timer = null; tick(); }
    });
  }
  // Beat right away when someone logs in (name goes from null → set).
  useKoBets.subscribe((s, prev) => { if (s.name && s.name !== prev.name) usePresence.getState().beat(); });
}
