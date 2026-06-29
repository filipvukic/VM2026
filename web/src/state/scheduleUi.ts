import { create } from "zustand";

// Shared Matcher-page UI state so the header's "LIVE" pill can deep-link straight to
// the schedule with the live filter applied (instead of the default "today" view).
export type SchedFilter = "all" | "live" | "upcoming" | "played";

interface ScheduleUI {
  mode: "list" | "bracket";
  filter: SchedFilter;
  setMode: (m: "list" | "bracket") => void;
  setFilter: (f: SchedFilter) => void;
  goLive: () => void; // list view + live filter (used by the header LIVE pill)
}

export const useScheduleUI = create<ScheduleUI>((set) => ({
  mode: "list",
  filter: "all",
  setMode: (mode) => set({ mode }),
  setFilter: (filter) => set({ filter }),
  goLive: () => set({ mode: "list", filter: "live" }),
}));
