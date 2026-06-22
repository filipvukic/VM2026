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
  const canZoom = zoomable && !!photo;
  return (
    <span
      title={name}
      onClick={canZoom ? () => openLightbox(asset(photo!), name) : undefined}
      style={{
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
      {photo ? (
        <img
          src={asset(photo)}
          alt={name}
          width={size}
          height={size}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        initials(name)
      )}
    </span>
  );
}
