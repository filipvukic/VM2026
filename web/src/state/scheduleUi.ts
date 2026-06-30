import { create } from "zustand";

// Shared Matcher-page UI state so the header's "LIVE" pill can deep-link straight to
// the schedule with the live filter applied (instead of the default "today" view).
export type SchedFilter = "all" | "live" | "upcoming" | "played";
export type BracketView = "tree" | "list"; // Cirkel | Lista (sub-filter of Slutspel)

interface ScheduleUI {
  mode: "list" | "bracket";
  filter: SchedFilter;
  view: BracketView;
  setMode: (m: "list" | "bracket") => void;
  setFilter: (f: SchedFilter) => void;
  setView: (v: BracketView) => void;
  goLive: () => void; // list view + live filter (used by the header LIVE pill)
}

export const useScheduleUI = create<ScheduleUI>((set) => ({
  mode: "list",
  filter: "all",
  view: "tree",
  setMode: (mode) => set({ mode }),
  setFilter: (filter) => set({ filter }),
  setView: (view) => set({ view }),
  goLive: () => set({ mode: "list", filter: "live" }),
}));
