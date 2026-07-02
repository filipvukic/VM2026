import { useEffect, useState } from "react";
import { asset } from "../lib/assets";
import { initials } from "../lib/format";
import { useLightbox } from "../state/lightbox";

interface AvatarProps {
  name: string;
  photo?: string | null;
  color?: string;
  size?: number;
  ring?: string | null; // ring color (e.g. rank highlight)
  zoomable?: boolean; // tap the photo to open it large in the lightbox
}

export function Avatar({ name, photo, color = "#7b6cff", size = 40, ring, zoomable = false }: AvatarProps) {
  const border = ring ? `2px solid ${ring}` : "1px solid var(--line-2)";
  const openLightbox = useLightbox((s) => s.open);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setLoaded(false); setFailed(false); }, [photo]);
  const showImg = !!photo && !failed;
  const canZoom = zoomable && showImg;
  return (
    <span
      title={name}
      onClick={canZoom ? () => openLightbox(asset(photo!), name) : undefined}
      style={{
        position: "relative",
        width: size,
        height: size,
        borderRadius: "50%",
        display: "inline-grid",
        placeItems: "center",
        overflow: "hidden",
        flexShrink: 0,
        background: `linear-gradient(140deg, ${color}, color-mix(in srgb, ${color} 55%, #000))`,
        border,
        boxShadow: ring ? `0 0 0 4px color-mix(in srgb, ${ring} 22%, transparent)` : undefined,
        fontFamily: "var(--font-display)",
        fontWeight: 800,
        fontSize: size * 0.4,
        color: "#fff",
        letterSpacing: 0,
        cursor: canZoom ? "zoom-in" : undefined,
      }}
    >
      {/* coloured initials sit underneath as the placeholder; the photo fades in
          over them once it paints, so there's never an empty box or a hard pop-in. */}
      {initials(name)}
      {showImg && (
        <img
          src={asset(photo!)}
          alt={name}
          width={size}
          height={size}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: loaded ? 1 : 0, transition: "opacity .3s ease" }}
        />
      )}
    </span>
  );
}
