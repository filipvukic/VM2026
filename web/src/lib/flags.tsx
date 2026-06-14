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

/** Country flag via flagcdn, with a graceful fallback to the team code. */
export function Flag({ iso, code, size = 22, rounded = true, className }: FlagProps) {
  const ratio = 4 / 3;
  const w = Math.round(size * ratio);
  const radius = rounded ? Math.max(2, Math.round(size * 0.18)) : 0;
  if (!iso) {
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
  return (
    <img
      className={className}
      src={`https://flagcdn.com/w${px}/${iso}.png`}
      srcSet={`https://flagcdn.com/w${px * 2}/${iso}.png 2x`}
      alt=""
      loading="lazy"
      width={w}
      height={size}
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
