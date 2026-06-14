import type { FormEntry } from "../data/types";

const COLOR: Record<string, string> = {
  V: "var(--win)",
  W: "var(--win)",
  O: "var(--ink-3)",
  D: "var(--ink-3)",
  F: "var(--loss)",
  L: "var(--loss)",
};
const LETTER: Record<string, string> = { V: "V", W: "V", O: "O", D: "O", F: "F", L: "F" };

/** Last-5 form as compact V/O/F pills (most-recent last). */
export function FormDots({ form, max = 5 }: { form: FormEntry[]; max?: number }) {
  const items = form.slice(-max);
  if (!items.length) return <span className="dim" style={{ fontSize: 12 }}>—</span>;
  return (
    <span style={{ display: "inline-flex", gap: 4 }}>
      {items.map((f, i) => {
        const r = (f.r || "").toUpperCase();
        return (
          <span
            key={i}
            title={`${f.opp || f.vs} ${f.gf}–${f.ga}`}
            style={{
              width: 18,
              height: 18,
              borderRadius: 5,
              display: "grid",
              placeItems: "center",
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: 11,
              color: r === "O" || r === "D" ? "var(--ink)" : "#0a0712",
              background: COLOR[r] || "var(--surface-3)",
              opacity: r === "O" || r === "D" ? 0.85 : 1,
            }}
          >
            {LETTER[r] || "·"}
          </span>
        );
      })}
    </span>
  );
}

/** Form from a "WWDLW" string (used by TEAM_DETAILS). */
export function FormString({ form }: { form?: string }) {
  if (!form) return null;
  return (
    <span style={{ display: "inline-flex", gap: 4 }}>
      {form.split("").map((c, i) => {
        const r = c.toUpperCase();
        const key = r === "W" ? "V" : r === "L" ? "F" : "O";
        return (
          <span
            key={i}
            style={{
              width: 18,
              height: 18,
              borderRadius: 5,
              display: "grid",
              placeItems: "center",
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: 11,
              color: key === "O" ? "var(--ink)" : "#0a0712",
              background: COLOR[key],
            }}
          >
            {key}
          </span>
        );
      })}
    </span>
  );
}
