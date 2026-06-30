import { create } from "zustand";
import { PUSH_WORKER_URL } from "../lib/pushConfig";
import type { Dataset, Match } from "../data/types";

// Per-person knockout tips, stored on the worker (KV) and gated by a login code.
// The code is kept in localStorage so a returning visitor stays "logged in".
export type Tip = [number, number];

// A KO match's bet key = its real fixture id (stable, matches the worker's keys).
export const koFid = (m: Match) => String(m._realId ?? "");

// Matches you can tip right now, PER ROUND: a whole round opens once ALL its matches
// are drawn and it hasn't started (earliest kickoff in the future). Mirrors the
// worker's openFixtureIds so the home reminder works even before login.
export function koOpenMatches(ds: Dataset, now: number): Match[] {
  const k = ds.knockout;
  const out: Match[] = [];
  // r32 is excluded — slutspelstips starts at the round of 16.
  for (const list of [k.r16, k.qf, k.sf, k.third, k.final]) {
    const real = list.filter((m) => m._realId);
    if (!real.length || !real.every((m) => m.home && m.away)) continue; // not fully drawn
    const kos = real.map((m) => m.kickoff?.getTime()).filter((t): t is number => !!t && Number.isFinite(t));
    if (!kos.length || Math.min(...kos) <= now) continue; // started → locked
    out.push(...real);
  }
  return out;
}
const LS_KEY = "vm_ko_code";
const saved = (() => { try { return localStorage.getItem(LS_KEY); } catch { return null; } })();

interface KoState {
  code: string | null; // login code (persisted)
  name: string | null; // participant the code belongs to
  bets: Record<string, Tip>; // fixtureId -> tip
  open: Set<string>; // fixture ids currently editable (round not started + drawn)
  status: "idle" | "loading" | "saving";
  error: string | null;
  sheetOpen: boolean; // the betting modal — openable from anywhere (home reminder, bracket)
  setSheet: (open: boolean) => void;
  login: (code: string) => Promise<boolean>;
  refresh: () => Promise<void>;
  save: (bets: Record<string, Tip>) => Promise<boolean>;
  logout: () => void;
}

const api = (path: string, init?: RequestInit) => fetch(PUSH_WORKER_URL + path, init);

export const useKoBets = create<KoState>((set, get) => ({
  code: saved,
  name: null,
  bets: {},
  open: new Set(),
  status: "idle",
  error: null,
  sheetOpen: false,
  setSheet: (sheetOpen) => set({ sheetOpen }),

  login: async (code) => {
    const c = code.trim().toUpperCase();
    set({ status: "loading", error: null });
    try {
      const r = await api("/ko/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: c }) });
      if (!r.ok) { set({ status: "idle", error: "Fel kod — kontrollera och försök igen." }); return false; }
      const { name } = (await r.json()) as { name: string };
      try { localStorage.setItem(LS_KEY, c); } catch { /* private mode */ }
      set({ code: c, name, status: "idle", error: null });
      await get().refresh();
      return true;
    } catch {
      set({ status: "idle", error: "Kunde inte nå servern. Försök igen." });
      return false;
    }
  },

  refresh: async () => {
    const code = get().code;
    if (!code) return;
    set({ status: "loading" });
    try {
      const r = await api("/ko/bets?code=" + encodeURIComponent(code));
      if (r.status === 401) { get().logout(); return; }
      const d = (await r.json()) as { name: string; bets: Record<string, Tip>; open: string[] };
      set({ name: d.name, bets: d.bets || {}, open: new Set(d.open || []), status: "idle", error: null });
    } catch {
      set({ status: "idle", error: "Kunde inte hämta tipsen." });
    }
  },

  save: async (bets) => {
    const code = get().code;
    if (!code) return false;
    set({ status: "saving", error: null });
    try {
      const r = await api("/ko/bets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, bets }) });
      if (!r.ok) { set({ status: "idle", error: "Kunde inte spara." }); return false; }
      const d = (await r.json()) as { bets: Record<string, Tip>; open: string[] };
      set({ bets: d.bets || {}, open: new Set(d.open || []), status: "idle", error: null });
      return true;
    } catch {
      set({ status: "idle", error: "Kunde inte spara — försök igen." });
      return false;
    }
  },

  logout: () => {
    try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
    set({ code: null, name: null, bets: {}, open: new Set(), error: null });
  },
}));

// Resume a saved session on load.
if (saved) useKoBets.getState().refresh();
