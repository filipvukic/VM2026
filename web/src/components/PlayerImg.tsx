import { useState } from "react";
import { initials } from "../lib/format";
import { useLightbox } from "../state/lightbox";

// Player photo that gracefully falls back to initials when the src is missing
// OR fails to load (ESPN headshots 404 for many players until TheSportsDB
// enrichment adds a cutout). When `zoomable`, tapping a *loaded* photo opens it
// large in the lightbox (only when there's a real image to enlarge).
export function PlayerImg({
  src,
  name,
  size = 88,
  radius = 18,
  fontSize,
  zoomable = false,
}: {
  src?: string | null;
  name: string;
  size?: number;
  radius?: number;
  fontSize?: number;
  zoomable?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const openLightbox = useLightbox((s) => s.open);
  const show = src && !failed;
  const canZoom = zoomable && !!show;
  return (
    <span
      onClick={canZoom ? () => openLightbox(src!, name) : undefined}
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
        cursor: canZoom ? "zoom-in" : undefined,
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
