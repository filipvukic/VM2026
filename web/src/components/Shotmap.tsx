import type { MatchShot } from "../data/types";

// Shot map on a full pitch: home attacks right, away attacks left (mirrored).
// Dot size ∝ xG; colour by outcome. Pass optaId to show one player's shots.
const W = 105, H = 68;

function PitchLines() {
  const s = { fill: "none", stroke: "rgba(255,255,255,.22)", strokeWidth: 0.5 } as const;
  return (
    <g style={s as any}>
      <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx="1" />
      <line x1={W / 2} y1="0.5" x2={W / 2} y2={H - 0.5} />
      <circle cx={W / 2} cy={H / 2} r="9.15" />
      <rect x="0.5" y={H / 2 - 20.15} width="16.5" height="40.3" />
      <rect x={W - 0.5 - 16.5} y={H / 2 - 20.15} width="16.5" height="40.3" />
    </g>
  );
}

export function Shotmap({ shots, homeTla, optaId, height = 168 }: {
  shots: MatchShot[];
  homeTla: string;
  optaId?: string;
  height?: number;
}) {
  const list = (optaId ? shots.filter((s) => s.optaId === optaId) : shots).filter((s) => s.x != null && s.y != null);
  if (!list.length) return <div className="dim" style={{ fontSize: 12, textAlign: "center", padding: 16 }}>Inga skott.</div>;

  const color = (s: MatchShot) => (s.goal ? "var(--gold)" : s.onTarget ? "var(--win)" : "rgba(255,255,255,.45)");
  const r = (xg: number) => 1.3 + Math.sqrt(Math.max(0, xg)) * 4.2;

  return (
    <div style={{ width: "100%", maxWidth: height * (W / H), margin: "0 auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block", background: "linear-gradient(150deg,#0f3a22,#0c2c1a)", borderRadius: 10, border: "1px solid var(--line-2)" }}>
        <PitchLines />
        {list.map((s, i) => {
          const home = s.tla === homeTla;
          const px = home ? (s.x / 100) * W : W - (s.x / 100) * W;
          const py = home ? (s.y / 100) * H : H - (s.y / 100) * H;
          return (
            <circle key={i} cx={px} cy={py} r={r(s.xg)} fill={color(s)} fillOpacity={s.goal ? 0.95 : 0.6}
              stroke={s.goal ? "#0a0712" : "rgba(0,0,0,.4)"} strokeWidth={s.goal ? 0.6 : 0.3}>
              <title>{`${s.player} — ${s.min ?? "?"}' · xG ${s.xg.toFixed(2)}${s.goal ? " · MÅL" : ""}`}</title>
            </circle>
          );
        })}
      </svg>
      <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 6, fontSize: 9.5 }} className="dim">
        <span><span style={{ color: "var(--gold)" }}>●</span> Mål</span>
        <span><span style={{ color: "var(--win)" }}>●</span> På mål</span>
        <span><span style={{ opacity: 0.5 }}>●</span> Utanför</span>
        <span>· storlek = xG</span>
      </div>
    </div>
  );
}
