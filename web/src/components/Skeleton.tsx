import { useEffect, useState, type CSSProperties } from "react";

// Ghost / skeleton loaders — the same shimmer language as the photo & flag
// placeholders (.img-skel), applied to text, blocks, circles and whole views
// while their data loads. Use these ANYWHERE content pops in after a fetch so the
// layout is filled with a soft shimmer instead of a blank gap or a hard pop-in.

/** Base shimmer box. Defaults to a full-width text line. */
export function Skel({
  w = "100%",
  h = 12,
  r,
  circle = false,
  className,
  style,
}: {
  w?: number | string;
  h?: number | string;
  r?: number | string;
  circle?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={`skel${circle ? " skel-circle" : ""}${className ? ` ${className}` : ""}`}
      style={{ width: w, height: circle && h === 12 ? w : h, borderRadius: circle ? "50%" : r, ...style }}
    />
  );
}

/** A few stacked text lines (last one shorter), for paragraph / label placeholders. */
export function SkelText({
  lines = 3,
  gap = 8,
  lineHeight = 11,
  lastWidth = "58%",
  style,
}: {
  lines?: number;
  gap?: number;
  lineHeight?: number;
  lastWidth?: number | string;
  style?: CSSProperties;
}) {
  return (
    <span style={{ display: "flex", flexDirection: "column", gap, ...style }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skel key={i} h={lineHeight} w={i === lines - 1 && lines > 1 ? lastWidth : "100%"} />
      ))}
    </span>
  );
}

/** An arbitrary image that shimmers until it paints, then fades in. For logos /
 *  badges that have no coloured-initial fallback (players/avatars use PlayerImg). */
export function SkelImg({
  src,
  alt = "",
  w,
  h,
  radius = 8,
  fit = "contain",
  style,
}: {
  src?: string | null;
  alt?: string;
  w: number | string;
  h: number | string;
  radius?: number;
  fit?: CSSProperties["objectFit"];
  style?: CSSProperties;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setLoaded(false); setFailed(false); }, [src]);
  const show = !!src && !failed;
  return (
    <span
      className={show && !loaded ? "img-skel" : undefined}
      style={{ width: w, height: h, borderRadius: radius, overflow: "hidden", flexShrink: 0, display: "inline-block", ...style }}
    >
      {show && (
        <img
          src={src!}
          alt={alt}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          style={{ width: "100%", height: "100%", objectFit: fit, opacity: loaded ? 1 : 0, transition: "opacity .3s ease" }}
        />
      )}
    </span>
  );
}

/** Ghost of a football pitch with a plausible XI, shown while a line-up loads. */
export function PitchSkeleton() {
  const rows = [1, 4, 3, 3]; // GK + a generic outfield shape (11 players)
  const dots: { x: number; y: number }[] = [];
  rows.forEach((count, idx) => {
    const y = 88 - (idx / (rows.length - 1)) * 74;
    for (let i = 0; i < count; i++) dots.push({ x: ((i + 1) / (count + 1)) * 100, y });
  });
  return (
    <div className="pk">
      <div className="pk-lines" />
      {dots.map((d, i) => (
        <div key={i} className="pk-ppl" style={{ left: `${d.x}%`, top: `${d.y}%` }}>
          <span className="skel skel-circle pk-dot" />
          <span className="skel pk-name" />
        </div>
      ))}
      <style>{`
        .pk{ position:relative; width:100%; aspect-ratio:7/10.2; max-width:440px; margin:0 auto;
          border-radius:18px; overflow:hidden; background:linear-gradient(170deg,#0f3a22,#0c2c1a);
          border:1px solid var(--line-2); box-shadow:inset 0 0 60px rgba(0,0,0,.4); }
        .pk-lines{ position:absolute; inset:0; opacity:.5;
          background:
            radial-gradient(circle at 50% 50%, transparent 48px, rgba(255,255,255,.16) 49px, transparent 51px),
            linear-gradient(rgba(255,255,255,.16),rgba(255,255,255,.16)) 50% 50%/100% 1px no-repeat;
          background-repeat:no-repeat; }
        .pk-ppl{ position:absolute; transform:translate(-50%,-50%); display:flex; flex-direction:column; align-items:center; gap:7px; }
        .pk-dot{ width:46px; height:46px; box-shadow:0 6px 14px -6px rgba(0,0,0,.8); }
        .pk-name{ width:34px; height:8px; border-radius:5px; }
      `}</style>
    </div>
  );
}

/** Ghost of the match Stats tab (team-compare bars + player-rating rows). */
export function StatsSkeleton() {
  return (
    <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 14 }}>
      {/* team-compare card */}
      <div className="card card-pad">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <Skel w={90} h={14} />
          <Skel w={54} h={11} />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <Skel w="100%" h={6} r={999} />
          </div>
        ))}
      </div>
      {/* player-rating rows */}
      <div className="card card-pad">
        <Skel w={150} h={12} style={{ marginBottom: 12 }} />
        <div style={{ display: "grid", gap: 6 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Skel w={38} h={22} r={7} />
              <Skel w={18} h={13} r={3} />
              <Skel w={`${45 + ((i * 13) % 35)}%`} h={12} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Ghost of a single player's match panel (rating + heatmap + stat grid). */
export function PlayerPanelSkeleton() {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <Skel w={46} h={30} r={9} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Skel w="55%" h={14} style={{ marginBottom: 6 }} />
          <Skel w="35%" h={10} />
        </div>
      </div>
      <Skel w={90} h={10} style={{ marginBottom: 8 }} />
      <Skel w="100%" h={150} r={10} style={{ marginBottom: 14 }} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "var(--line)", borderRadius: 10, overflow: "hidden" }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "10px 11px", background: "var(--surface)" }}>
            <Skel w="55%" h={10} />
            <Skel w={20} h={10} />
          </div>
        ))}
      </div>
    </div>
  );
}
