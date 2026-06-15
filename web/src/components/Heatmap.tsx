// Player heat map: blurred, screen-blended warm blobs over a pitch. Coordinates
// come from FotMob (viewBox "0 0 105 68", attacking left → right).
const W = 105, H = 68;

function PitchLines() {
  const s = { fill: "none", stroke: "rgba(255,255,255,.22)", strokeWidth: 0.5 } as const;
  return (
    <g style={s as any}>
      <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx="1" />
      <line x1={W / 2} y1="0.5" x2={W / 2} y2={H - 0.5} />
      <circle cx={W / 2} cy={H / 2} r="9.15" />
      <circle cx={W / 2} cy={H / 2} r="0.6" style={{ fill: "rgba(255,255,255,.3)" }} />
      {/* penalty + goal areas, both ends */}
      <rect x="0.5" y={H / 2 - 20.15} width="16.5" height="40.3" />
      <rect x="0.5" y={H / 2 - 9.16} width="5.5" height="18.32" />
      <rect x={W - 0.5 - 16.5} y={H / 2 - 20.15} width="16.5" height="40.3" />
      <rect x={W - 0.5 - 5.5} y={H / 2 - 9.16} width="5.5" height="18.32" />
    </g>
  );
}

export function Heatmap({ points, height = 150 }: { points: [number, number][]; height?: number }) {
  return (
    <div style={{ width: "100%", maxWidth: height * (W / H), margin: "0 auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block", background: "linear-gradient(150deg,#0f3a22,#0c2c1a)", borderRadius: 10, border: "1px solid var(--line-2)" }}>
        <defs>
          <radialGradient id="heatblob">
            <stop offset="0%" stopColor="#ff5a3c" stopOpacity="0.9" />
            <stop offset="55%" stopColor="#ff9f1c" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#ffd24a" stopOpacity="0" />
          </radialGradient>
          <filter id="heatblur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.6" />
          </filter>
        </defs>
        <PitchLines />
        <g filter="url(#heatblur)">
          {points.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="5.5" fill="url(#heatblob)" style={{ mixBlendMode: "screen" }} />
          ))}
        </g>
        <PitchLines />
      </svg>
      <div className="dim" style={{ fontSize: 9.5, textAlign: "center", marginTop: 4 }}>Anfallsriktning →</div>
    </div>
  );
}
