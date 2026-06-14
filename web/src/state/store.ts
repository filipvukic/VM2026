import { create } from "zustand";
import type { LoadedData } from "../data/load";

type Status = "loading" | "ready" | "error";

interface AppState {
  raw: LoadedData | null;
  version: number; // bumps on every successful (re)load → drives memoized build()
  status: Status;
  lastUpdate: number;
  setLoaded: (d: LoadedData) => void;
  setError: () => void;
}

export const useStore = create<AppState>((set) => ({
  raw: null,
  version: 0,
  status: "loading",
  lastUpdate: 0,
  setLoaded: (d) => set((s) => ({ raw: d, version: s.version + 1, status: "ready", lastUpdate: Date.now() })),
  setError: () => set((s) => ({ status: s.raw ? "ready" : "error" })),
}));
