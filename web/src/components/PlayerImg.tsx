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
  hold = false,
}: {
  src?: string | null;
  srcs?: string[];
  name: string;
  size?: number;
  radius?: number;
  fontSize?: number;
  zoomable?: boolean;
  // Keep shimmering (don't show the current photo yet) while a better source is
  // still being resolved — the good photo then loads first, weaker ones only fall
  // back on error. Used by line-up/bench photos waiting for the FotMob id.
  hold?: boolean;
}) {
  const list = (srcs && srcs.length ? srcs : src ? [src] : []).filter(Boolean);
  const key = list.join("|");
  const [idx, setIdx] = useState(0);
  const [imgLoaded, setImgLoaded] = useState(false);
  useEffect(() => { setIdx(0); }, [key]); // reset when the player (its url list) changes
  const openLightbox = useLightbox((s) => s.open);
  const cur = hold ? null : idx < list.length ? list[idx] : null;
  useEffect(() => { setImgLoaded(false); }, [cur]); // skeleton until the (new) photo paints
  const show = !!cur;
  const canZoom = zoomable && show;
  const skel = hold || (show && !imgLoaded);
  return (
    <span
      onClick={canZoom ? () => openLightbox(cur!, name) : undefined}
      className={skel ? "img-skel" : undefined}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        overflow: "hidden",
        background: skel ? undefined : "var(--surface-3)",
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
          onLoad={() => setImgLoaded(true)}
          onClick={canZoom ? () => openLightbox(cur!, name) : undefined}
          style={{ width: "100%", height: "100%", objectFit: "cover", opacity: imgLoaded ? 1 : 0, transition: "opacity .3s ease" }}
          onError={() => setIdx((i) => i + 1)}
        />
      ) : hold ? null : (
        <span className="num" style={{ fontSize: fontSize ?? size * 0.34, color: "var(--ink-2)" }}>
          {initials(name)}
        </span>
      )}
    </span>
  );
}
