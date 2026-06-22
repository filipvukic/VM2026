import { create } from "zustand";

// A single global image viewer (lightbox). Any player photo can open it with a
// larger version of the same src; clicking the backdrop or pressing Esc closes it.
interface LightboxState {
  src: string | null;
  alt: string;
  open: (src: string, alt?: string) => void;
  close: () => void;
}

export const useLightbox = create<LightboxState>((set) => ({
  src: null,
  alt: "",
  open: (src, alt = "") => set({ src, alt }),
  close: () => set({ src: null, alt: "" }),
}));
