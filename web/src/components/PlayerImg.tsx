import { useEffect, useState } from "react";
import { initials } from "../lib/format";
import { useLightbox } from "../state/lightbox";

// Player photo that gracefully falls back to initials when the src is missing
// OR fails to load (ESPN headshots 404 for many players until TheSportsDB
// enrichment adds a cutout). Pass `srcs` for a prioritised list (e.g. official
// headshot → db photo) — each failing url advances to the next. When `zoomable`,
// tapping a *loaded* photo opens it large in the lightbox.
export function PlayerImg({
  src,
  srcs,
  name,
  size = 88,
  radius = 18,
  fontSize,
  zoomable = false,
}: {
  src?: string | null;
  srcs?: string[];
  name: string;
  size?: number;
  radius?: number;
  fontSize?: number;
  zoomable?: boolean;
}) {
  const list = (srcs && srcs.length ? srcs : src ? [src] : []).filter(Boolean);
  const key = list.join("|");
  const [idx, setIdx] = useState(0);
  useEffect(() => setIdx(0), [key]); // reset when the player (its url list) changes
  const openLightbox = useLightbox((s) => s.open);
  const cur = idx < list.length ? list[idx] : null;
  const show = !!cur;
  const canZoom = zoomable && show;
  return (
    <span
      onClick={canZoom ? () => openLightbox(cur!, name) : undefined}
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
          src={cur!}
          alt={name}
          decoding="async"
          onClick={canZoom ? () => openLightbox(cur!, name) : undefined}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          onError={() => setIdx((i) => i + 1)}
        />
      ) : (
        <span className="num" style={{ fontSize: fontSize ?? size * 0.34, color: "var(--ink-2)" }}>
          {initials(name)}
        </span>
      )}
    </span>
  );
}
