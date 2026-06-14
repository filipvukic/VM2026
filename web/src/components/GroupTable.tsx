import { useData } from "../state/dataset";
import { useSheets } from "../state/sheets";
import { Flag, groupColor } from "../lib/flags";

// Compact group standings table. Highlights `highlight` team codes (e.g. the two
// teams in a match). Click a row → team sheet.
export function GroupTable({
  letter,
  highlight = [],
  deltas,
}: {
  letter: string;
  highlight?: (string | null)[];
  deltas?: Record<string, number>;
}) {
  const ds = useData();
  const openTeam = useSheets((s) => s.openTeam);
  const rows = ds.groupTables[letter] || [];
  if (!rows.length) return null;
  const hi = new Set(highlight.filter(Boolean) as string[]);

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div style={{ display: "flex", padding: "9px 14px 5px", fontSize: 10, fontWeight: 800, letterSpacing: ".06em", color: "var(--ink-3)" }}>
        <span style={{ width: 20 }} />
        <span style={{ flex: 1, color: groupColor(letter) }}>GRUPP {letter}</span>
        <span style={{ width: 28, textAlign: "center" }}>SP</span>
        <span style={{ width: 28, textAlign: "center" }}>MS</span>
        <span style={{ width: 28, textAlign: "center", color: "var(--ink)" }}>P</span>
      </div>
      {rows.map((r) => {
        const t = ds.teams[r.code];
        const tbd = r.code.indexOf("TBD") === 0;
        const on = hi.has(r.code);
        const qual = r.pos <= 2 ? "var(--win)" : r.pos === 3 ? "var(--gold)" : "transparent";
        return (
          <button
            key={r.code}
            disabled={tbd}
            onClick={() => !tbd && openTeam(r.code)}
            style={{ display: "flex", alignItems: "center", padding: "7px 14px", width: "100%", textAlign: "left", background: on ? "color-mix(in srgb, var(--cool) 16%, transparent)" : undefined, opacity: tbd ? 0.5 : 1 }}
          >
            <span className="num" style={{ width: 20, textAlign: "center", fontSize: 12, color: "var(--ink-3)", borderLeft: `3px solid ${qual}`, paddingLeft: 4 }}>{r.pos}</span>
            <span style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, fontWeight: on ? 800 : 700, fontSize: 13, minWidth: 0 }}>
              <Flag iso={t?.iso} code={r.code} size={16} />
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tbd ? "Att lottas" : t?.name || r.code}</span>
              {deltas && deltas[r.code] != null && (
                <span className="chip" style={{ padding: "0 6px", fontSize: 9.5, color: deltas[r.code] === 3 ? "var(--win)" : deltas[r.code] === 1 ? "var(--gold)" : "var(--ink-3)", borderColor: "transparent", background: "var(--surface-3)" }}>
                  +{deltas[r.code]}
                </span>
              )}
            </span>
            <span className="num" style={{ width: 28, textAlign: "center", fontSize: 12.5, color: "var(--ink-2)" }}>{r.sp}</span>
            <span className="num" style={{ width: 28, textAlign: "center", fontSize: 12.5, color: r.ms > 0 ? "var(--win)" : r.ms < 0 ? "var(--loss)" : "var(--ink-2)" }}>{r.ms > 0 ? "+" : ""}{r.ms}</span>
            <span className="num" style={{ width: 28, textAlign: "center", fontSize: 14 }}>{r.p}</span>
          </button>
        );
      })}
    </div>
  );
}
