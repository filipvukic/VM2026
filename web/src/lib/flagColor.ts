import { useEffect, useState } from "react";

// Each flag's signature colour, derived from the ACTUAL flag image — so it's always a
// real flag colour, never a hand-maintained map that can be wrong (e.g. Morocco is red,
// not green). Loads the flagcdn PNG (CORS-open), samples the dominant saturated hue on a
// tiny canvas, and caches in memory + localStorage so it's instant next time.

const mem = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();
const LS = "flagcol:";

function rgbToHsl(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  let h = 0, s = 0;
  if (d) {
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s, l };
}
const toHex = (r: number, g: number, b: number) =>
  "#" + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("");

function dominant(img: HTMLImageElement): string | null {
  const cw = 48, ch = 36;
  const cv = document.createElement("canvas");
  cv.width = cw; cv.height = ch;
  const ctx = cv.getContext("2d", { willReadFrequently: true } as CanvasRenderingContext2DSettings);
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, cw, ch);
  let data: Uint8ClampedArray;
  try { data = ctx.getImageData(0, 0, cw, ch).data; } catch { return null; }
  // bucket pixels by hue (12° bins), weighted by saturation; skip white/black/grey
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a < 200) continue;
    const { h, s, l } = rgbToHsl(r, g, b);
    if (s < 0.28 || l < 0.14 || l > 0.9) continue;
    const key = Math.round(h / 12);
    const e = bins.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    e.n += s; e.r += r * s; e.g += g * s; e.b += b * s;
    bins.set(key, e);
  }
  let best: { n: number; r: number; g: number; b: number } | null = null;
  for (const e of bins.values()) if (!best || e.n > best.n) best = e;
  if (!best) return null;
  let r = best.r / best.n, g = best.g / best.n, b = best.b / best.n;
  // lift dark/muted colours so the winning line reads on the dark bracket
  const { h, s, l } = rgbToHsl(r, g, b);
  if (l < 0.42 || s < 0.55) {
    const ll = Math.max(l, 0.46), ss = Math.max(s, 0.6);
    const c = (1 - Math.abs(2 * ll - 1)) * ss, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), mm = ll - c / 2;
    const seg = Math.floor(h / 60) % 6;
    const [rr, gg, bb] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][seg];
    r = (rr + mm) * 255; g = (gg + mm) * 255; b = (bb + mm) * 255;
  }
  return toHex(r, g, b);
}

export function flagColorSync(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const k = iso.toLowerCase();
  if (mem.has(k)) return mem.get(k)!;
  try { const v = localStorage.getItem(LS + k); if (v) { mem.set(k, v); return v; } } catch { /* ignore */ }
  return null;
}

export function ensureFlagColor(iso: string | null | undefined): Promise<string | null> {
  if (!iso) return Promise.resolve(null);
  const k = iso.toLowerCase();
  const cached = flagColorSync(k);
  if (cached) return Promise.resolve(cached);
  if (pending.has(k)) return pending.get(k)!;
  const p = new Promise<string | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = dominant(img);
      if (c) { mem.set(k, c); try { localStorage.setItem(LS + k, c); } catch { /* ignore */ } }
      resolve(c);
    };
    img.onerror = () => resolve(null);
    img.src = `https://flagcdn.com/w160/${k}.png`;
  });
  pending.set(k, p);
  return p;
}

// Loads colours for the given isos and re-renders when they're ready.
export function useFlagColors(isos: (string | null | undefined)[]): void {
  const key = isos.filter(Boolean).join("|");
  const [, bump] = useState(0);
  useEffect(() => {
    let alive = true;
    const todo = [...new Set(isos.filter((i): i is string => !!i && !flagColorSync(i)))];
    if (!todo.length) return;
    Promise.all(todo.map(ensureFlagColor)).then(() => { if (alive) bump((x) => x + 1); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
