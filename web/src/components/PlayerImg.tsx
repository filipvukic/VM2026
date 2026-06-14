import { useState } from "react";
import { initials } from "../lib/format";

// Player photo that gracefully falls back to initials when the src is missing
// OR fails to load (ESPN headshots 404 for many players until TheSportsDB
// enrichment adds a cutout).
export function PlayerImg({
  src,
  name,
  size = 88,
  radius = 18,
  fontSize,
}: {
  src?: string | null;
  name: string;
  size?: number;
  radius?: number;
  fontSize?: number;
}) {
  const [failed, setFailed] = useState(false);
  const show = src && !failed;
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        overflow: "hidden",
        background: "var(--surface-3)",
        display: "grid",
        placeItems: "center",
        flexShrink: 0,
        border: "1px solid var(--line-2)",
      }}
    >
      {show ? (
        <img
          src={src!}
          alt={name}
          loading="lazy"
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="num" style={{ fontSize: fontSize ?? size * 0.34, color: "var(--ink-2)" }}>
          {initials(name)}
        </span>
      )}
    </span>
  );
}
