import { useMemo, useState } from "react";
import type { RaceSeries } from "./movement";
import { svDayMonth } from "../../lib/format";

// Interactive cumulative-points chart. Tap a name to focus it — deselected
// players turn grey (still visible, just faded) so you can highlight your own.
export function RaceChart({ race }: { race: RaceSeries }) {
  const ranked = useMemo(() => [...race.lines].sort((a, b) => (b.points.at(-1) || 0) - (a.points.at(-1) || 0)), [race]);
  const allIds = useMemo(() => new Set(ranked.map((l) => l.id)), [ranked]);
  const [active, setActive] = useState<Set<string>>(() => new Set(ranked.map((l) => l.id)));
  const [hover, setHover] = useState<string | null>(null);

  const W = 660, H = 280, padL = 30, padR = 14, padT = 14, padB = 28;
  const maxPts = Math.max(1, ...ranked.flatMap((l) => l.points));
  const n = race.days.length;
  const x = (i: number) => padL + (n <= 1 ? 0 : (i / (n - 1)) * (W - padL - padR));
  const y = (p: number) => padT + (1 - p / maxPts) * (H - padT - padB);

  if (race.days.length < 2) return null;
  const yTicks = 4;
  const allActive = active.size === allIds.size;
  const noneActive = active.size === 0;

  const toggle = (id: string) =>
    setActive((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // draw inactive first (under), active on top
  const drawOrder = [...ranked].sort((a, b) => Number(active.has(a.id)) - Number(active.has(b.id)));

  return (
    <div className="card card-pad">
      <div className="section-head" style={{ margin: "0 0 4px" }}>
        <div className="kicker">Poängracet <span className="dim">· ackumulerat per speldag</span></div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="chip" onClick={() => setActive(new Set(allIds))} style={allActive ? { opacity: 0.5 } : {}}>Markera alla</button>
          <button className="chip" onClick={() => setActive(new Set())} style={noneActive ? { opacity: 0.5 } : {}}>Avmarkera alla</button>
        </div>
      </div>
      <div className="dim" style={{ fontSize: 11, marginBottom: 8 }}>Tryck på en spelare nedan för att markera/avmarkera — avmarkerade blir grå.</div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", overflow: "visible" }}>
        {Array.from({ length: yTicks + 1 }).map((_, i) => {
          const val = Math.round((maxPts / yTicks) * i);
          const yy = y(val);
          return (
            <g key={i}>
              <line x1={padL} y1={yy} x2={W - padR} y2={yy} stroke="var(--line)" strokeWidth="1" />
              <text x={padL - 6} y={yy + 3} textAnchor="end" fontSize="9" fill="var(--ink-3)">{val}</text>
            </g>
          );
        })}
        {race.days.map((d, i) => (
          <text key={d} x={x(i)} y={H - 9} textAnchor="middle" fontSize="9" fill="var(--ink-3)">
            {svDayMonth(new Date(d + "T12:00:00Z"))}
          </text>
        ))}
        {drawOrder.map((l) => {
          const on = active.has(l.id);
          const isHover = hover === l.id;
          const d = l.points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p)}`).join(" ");
          return (
            <path
              key={l.id}
              d={d}
              fill="none"
              stroke={on ? l.color : "var(--ink-3)"}
              strokeWidth={isHover ? 4 : on ? 2.6 : 1.3}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={on ? (hover && !isHover ? 0.35 : 1) : 0.22}
              onMouseEnter={() => setHover(l.id)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: "pointer", transition: "opacity .15s, stroke-width .15s, stroke .2s" }}
            />
          );
        })}
        {ranked.filter((l) => active.has(l.id)).map((l) => {
          const lastI = l.points.length - 1;
          const isHover = hover === l.id;
          return (
            <g key={l.id} opacity={hover && !isHover ? 0.4 : 1}>
              <circle cx={x(lastI)} cy={y(l.points[lastI])} r={isHover ? 5 : 3.5} fill={l.color} stroke="var(--bg)" strokeWidth="1.5" />
              {isHover && (
                <text x={x(lastI) - 8} y={y(l.points[lastI]) - 8} textAnchor="end" fontSize="11" fontWeight="800" fill={l.color}>
                  {l.name} {l.points[lastI]}p
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 12 }}>
        {ranked.map((l) => {
          const on = active.has(l.id);
          return (
            <button
              key={l.id}
              onClick={() => toggle(l.id)}
              onMouseEnter={() => setHover(l.id)}
              onMouseLeave={() => setHover(null)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                borderRadius: "var(--r-pill)",
                border: "1px solid var(--line-2)",
                background: on ? "var(--surface-2)" : "transparent",
                color: on ? "var(--ink)" : "var(--ink-3)",
                fontSize: 11.5,
                fontWeight: 700,
                opacity: on ? 1 : 0.6,
              }}
            >
              <span style={{ width: 10, height: 10, borderRadius: 3, background: on ? l.color : "var(--ink-3)" }} />
              {l.name}
              <span className="num dim">{l.points.at(-1)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
