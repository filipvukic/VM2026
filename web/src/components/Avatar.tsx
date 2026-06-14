import { asset } from "../lib/assets";
import { initials } from "../lib/format";

interface AvatarProps {
  name: string;
  photo?: string | null;
  color?: string;
  size?: number;
  ring?: string | null; // ring color (e.g. rank highlight)
}

export function Avatar({ name, photo, color = "#7b6cff", size = 40, ring }: AvatarProps) {
  const border = ring ? `2px solid ${ring}` : "1px solid var(--line-2)";
  return (
    <span
      title={name}
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
