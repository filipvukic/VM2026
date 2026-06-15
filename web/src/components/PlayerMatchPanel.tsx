import type { MatchStatsDetail } from "../data/types";
import { Heatmap } from "./Heatmap";
import { Shotmap } from "./Shotmap";
import { ratingColor } from "../lib/rating";

// One player's performance in a match: rating, key numbers, heat map and shots.
// Reused in the match Statistik tab and on football-player profiles.
export function PlayerMatchPanel({ stats, optaId, subtitle }: {
  stats: MatchStatsDetail;
  optaId: string;
  subtitle?: string;
}) {
  const p = stats.players.find((x) => x.optaId === optaId);
  if (!p) return null;
  const heat = stats.heatmap?.players?.[optaId] || [];
  const playerShots = stats.shots.filter((s) => s.optaId === optaId);
  const entries = Object.entries(p.stats);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        {p.rating != null && (
          <span className="num" style={{ fontSize: 20, fontWeight: 800, padding: "4px 10px", borderRadius: 9, background: ratingColor(p.rating), color: "#0a0712", minWidth: 46, textAlign: "center" }}>
            {p.rating.toFixed(1)}
          </span>
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{p.name}</div>
          <div className="dim" style={{ fontSize: 11 }}>
            {subtitle || (p.gk ? "Målvakt" : p.pos || "")}{p.shirt ? ` · #${p.shirt}` : ""}{p.min != null ? ` · ${p.min} min spelade` : ""}
          </div>
        </div>
      </div>

      {heat.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div className="kicker" style={{ marginBottom: 8 }}>Heatmap</div>
          <Heatmap points={heat} />
        </div>
      )}

      {playerShots.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div className="kicker" style={{ marginBottom: 8 }}>Skott ({playerShots.length})</div>
          <Shotmap shots={playerShots} homeTla={stats.homeTla} optaId={optaId} />
        </div>
      )}

      {entries.length > 0 && (
        <div>
          <div className="kicker" style={{ marginBottom: 8 }}>Statistik</div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: "1px", background: "var(--line)", borderRadius: 10, overflow: "hidden" }}>
            {entries.map(([label, val]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "8px 11px", background: "var(--surface)" }}>
                <span className="dim" style={{ fontSize: 11.5, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
                <span className="num" style={{ fontSize: 12.5, fontWeight: 700, flexShrink: 0 }}>{val}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
