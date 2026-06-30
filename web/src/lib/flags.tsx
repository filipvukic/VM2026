import { useEffect, useRef, useState } from "react";
import { useData } from "../state/dataset";

// Per-group accent colors (broadcast-style), used for group badges/tints.
const GROUP_COLORS: Record<string, string> = {
  A: "#ff2d6e", B: "#ff8a3d", C: "#ffcb45", D: "#2ee6a6",
  E: "#38c6f0", F: "#7b6cff", G: "#c061ff", H: "#ff5c8a",
  I: "#48d1a0", J: "#f0a93b", K: "#5ea0ff", L: "#ff6f91",
};
export const groupColor = (L?: string | null) => (L && GROUP_COLORS[L]) || "#7b6cff";
export const groupColorSoft = (L?: string | null) =>
  `color-mix(in srgb, ${groupColor(L)} 22%, transparent)`;

interface FlagProps {
  iso?: string | null;
  code?: string | null;
  size?: number;
  rounded?: boolean;
  className?: string;
}

/** Country flag via flagcdn. Loads eagerly (lazy-loading sometimes left flags
 *  blank on open) and, on a failed/flaky CDN response, retries a couple of times
 *  before falling back to the team code so a flag is never silently invisible. */
const FLAG_MAX_TRIES = 4;

export function Flag({ iso, code, size = 22, rounded = true, className }: FlagProps) {
  const ratio = 4 / 3;
  const w = Math.round(size * ratio);
  const radius = rounded ? Math.max(2, Math.round(size * 0.18)) : 0;
  const [tries, setTries] = useState(0);
  const loaded = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  // (re)arm a single retry timer → after `delay` bump `tries`, which cache-busts the
  // url (?r=) and refetches. One shared timer so onError and the hung-load backstop
  // never double-fire.
  const arm = (delay: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setTries((t) => t + 1), delay);
  };
  useEffect(() => {
    loaded.current = false;
    setTries(0);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [iso]);
  // Hung-load backstop: a cold open fires MANY flag requests at once and flagcdn can
  // drop some WITHOUT an error event, leaving a blank flag until you restart. If an
  // attempt neither loads nor errors within a few seconds, retry it. The window is
  // generous so slow-but-OK connections aren't interrupted.
  useEffect(() => {
    if (!iso || loaded.current || tries > FLAG_MAX_TRIES) return;
    arm(4500);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iso, tries]);

  // Coming back to the app (visibility / online / bfcache restore) often leaves flags
  // that failed or were backgrounded mid-load blank. Re-fetch the unloaded ones, with a
  // small random stagger so 30+ flags don't all burst flagcdn again at once.
  useEffect(() => {
    if (!iso) return;
    const retry = () => {
      if (document.visibilityState !== "visible" || loaded.current) return;
      window.setTimeout(() => { if (!loaded.current) setTries((t) => (t > FLAG_MAX_TRIES ? 1 : t + 1)); }, Math.floor(Math.random() * 700));
    };
    document.addEventListener("visibilitychange", retry);
    window.addEventListener("online", retry);
    window.addEventListener("pageshow", retry);
    return () => {
      document.removeEventListener("visibilitychange", retry);
      window.removeEventListener("online", retry);
      window.removeEventListener("pageshow", retry);
    };
  }, [iso]);

  if (!iso || tries > FLAG_MAX_TRIES) {
    return (
      <span
        className={className}
        style={{
          width: w,
          height: size,
          borderRadius: radius,
          display: "inline-grid",
          placeItems: "center",
          background: "var(--surface-3)",
          border: "1px solid var(--line-2)",
          fontFamily: "var(--font-display)",
          fontWeight: 800,
          fontSize: size * 0.42,
          color: "var(--ink-3)",
          flexShrink: 0,
        }}
      >
        {(code || "?").slice(0, 2)}
      </span>
    );
  }
  const px = size <= 22 ? 40 : size <= 40 ? 80 : 160;
  const bust = tries ? `?r=${tries}` : "";
  return (
    <img
      className={className}
      src={`https://flagcdn.com/w${px}/${iso}.png${bust}`}
      srcSet={`https://flagcdn.com/w${px * 2}/${iso}.png${bust} 2x`}
      alt=""
      decoding="async"
      width={w}
      height={size}
      onLoad={() => { loaded.current = true; if (timer.current) clearTimeout(timer.current); }}
      // Definite failure → retry after a short backoff (cache-busted), so a transient
      // flagcdn hiccup / cold-open burst recovers instead of burning all tries at once.
      onError={() => arm(500 + tries * 500)}
      style={{
        width: w,
        height: size,
        objectFit: "cover",
        borderRadius: radius,
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,.18)",
        flexShrink: 0,
      }}
    />
  );
}

/** Convenience: flag for a team code using the dataset's team→iso map. */
export function TeamFlag({ code, size = 22 }: { code?: string | null; size?: number }) {
  const ds = useData();
  const t = code ? ds.teams[code] : null;
  return <Flag iso={t?.iso} code={code} size={size} />;
}

export function teamName(ds: ReturnType<typeof useData>, code?: string | null, fallback = "TBD"): string {
  if (!code) return fallback;
  return ds.teams[code]?.name || code;
}
