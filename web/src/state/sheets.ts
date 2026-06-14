// Modal stack for the match / team / player detail sheets. Sheets can stack
// (team → match → team); the array order is the z-order. Pop closes the top.
import { create } from "zustand";

export type SheetEntry =
  | { type: "match"; id: string }
  | { type: "team"; code: string }
  | { type: "player"; id: string }
  | { type: "fbplayer"; name: string; espnId?: string | null };

interface SheetState {
  stack: SheetEntry[];
  openMatch: (id: string) => void;
  openTeam: (code: string) => void;
  openPlayer: (id: string) => void;
  openFbPlayer: (name: string, espnId?: string | null) => void;
  close: () => void;
  closeAll: () => void;
}

// Guard against runaway depth (and accidental re-push of the same entry).
function push(stack: SheetEntry[], e: SheetEntry): SheetEntry[] {
  const top = stack[stack.length - 1];
  if (top && JSON.stringify(top) === JSON.stringify(e)) return stack;
  return [...stack.slice(-5), e];
}

export const useSheets = create<SheetState>((set) => ({
  stack: [],
  openMatch: (id) => set((s) => ({ stack: push(s.stack, { type: "match", id }) })),
  openTeam: (code) => set((s) => ({ stack: push(s.stack, { type: "team", code }) })),
  openPlayer: (id) => set((s) => ({ stack: push(s.stack, { type: "player", id }) })),
  openFbPlayer: (name, espnId) => set((s) => ({ stack: push(s.stack, { type: "fbplayer", name, espnId }) })),
  close: () => set((s) => ({ stack: s.stack.slice(0, -1) })),
  closeAll: () => set({ stack: [] }),
}));
