import type { Match } from "../data/types";
import { useData } from "../state/dataset";
import { Flag, groupColor } from "../lib/flags";
import { svTime } from "../lib/format";
import { liveMinuteText } from "../lib/liveMinute";
import { useNow } from "../state/useNow";

interface Props {
  match: Match;
  onOpen?: (m: Match) => void;
  myTip?: [number, number] | null;
  compact?: boolean;
}

export function MatchCard({ match: m, onOpen, myTip, compact }: Props) {
  const ds = useData();
  const now = useNow(m.status === "live" ? 30_000 : 0);
  const updatedAt = ds.updatedAt ? new Date(ds.updatedAt).getTime() : null;
  const home = m.home ? ds.teams[m.home] : null;
  const away = m.away ? ds.teams[m.away] : null;
  const homeName = home?.name || m.fromA || "TBD";
  const awayName = away?.name || m.fromB || "TBD";
  const projHome = !m.home && m.projHome ? ds.teams[m.projHome]?.name : null;
  const projAway = !m.away && m.projAway ? ds.teams[m.projAway]?.name : null;

  const played = m.status === "played";
  const live = m.status === "live";
  const win = m.winner;
  // Status-colored left edge so played / live / upcoming are scannable at a glance.
  const accent = live ? "var(--hot)" : played ? "var(--win)" : "var(--cool)";

  const Side = ({ side }: { side: "h" | "a" }) => {
    const code = side === "h" ? m.home : m.away;
    const name = side === "h" ? homeName : awayName;
    const proj = side === "h" ? projHome : projAway;
    const isWin = played && win && win === code;
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          flex: 1,
          minWidth: 0,
          flexDirection: side === "a" ? "row-reverse" : "row",
          textAlign: side === "a" ? "right" : "left",
          opacity: played && win && win !== code && code ? 0.55 : 1,
        }}
      >
        <Flag iso={code ? ds.teams[code]?.iso : null} code={code} size={compact ? 22 : 26} />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontWeight: isWin ? 800 : 700,
              fontSize: compact ? 13.5 : 15,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {name}
          </div>
          {proj && (
            <div className="dim" style={{ fontSize: 10.5, fontWeight: 700 }}>
              just nu: {proj}
            </div>
          )}
        </div>
      </div>
    );
  };

  const Center = () => {
    if (played || live) {
      return (
        <div style={{ display: "grid", placeItems: "center", padding: "0 12px", minWidth: 78 }}>
          <div
            className="num"
            style={{
              fontSize: compact ? 22 : 27,
              lineHeight: 1,
              color: live ? "var(--hot)" : "var(--ink)",
              letterSpacing: "0.02em",
            }}
          >
            {m.ga ?? 0}<span style={{ opacity: 0.4, margin: "0 4px" }}>–</span>{m.gb ?? 0}
          </div>
          {m.pen && (
            <div className="dim" style={{ fontSize: 9.5, fontWeight: 800, marginTop: 2 }}>
              str {m.pen[0]}–{m.pen[1]}
            </div>
          )}
          {live ? (
            <div className="live-pill" style={{ marginTop: 5, fontSize: 9.5, padding: "2px 7px" }}>
              <span className="live-dot" style={{ width: 5, height: 5 }} />
              {liveMinuteText(m, updatedAt, now)}
            </div>
          ) : (
            <div className="chip" style={{ marginTop: 4, fontSize: 8.5, padding: "1px 7px", background: "color-mix(in srgb,var(--win) 16%, transparent)", borderColor: "color-mix(in srgb,var(--win) 35%, transparent)", color: "var(--win)", letterSpacing: ".06em" }}>
              ✓ SLUT
            </div>
          )}
        </div>
      );
    }
    return (
      <div style={{ display: "grid", placeItems: "center", padding: "0 12px", minWidth: 78 }}>
        <div className="num" style={{ fontSize: compact ? 18 : 20, color: "var(--cool-2)" }}>
          {svTime(m.kickoff)}
        </div>
        <div className="chip" style={{ marginTop: 4, fontSize: 8.5, padding: "1px 7px", color: "var(--ink-3)", letterSpacing: ".06em" }}>
          KOMMANDE
        </div>
        {myTip && (
          <div className="chip" style={{ marginTop: 4, padding: "1px 7px", fontSize: 10, borderColor: "var(--cool)", color: "var(--cool-2)" }}>
            ditt: {myTip[0]}–{myTip[1]}
          </div>
        )}
      </div>
    );
  };

  return (
    <button
      onClick={onOpen ? () => onOpen(m) : undefined}
      className="card"
      style={{
        width: "100%",
        textAlign: "left",
        padding: compact ? "10px 12px" : "12px 14px",
        borderRadius: "var(--r-md)",
        display: "block",
        cursor: onOpen ? "pointer" : "default",
        borderLeft: `3px solid ${accent}`,
        position: "relative",
        background: played ? "linear-gradient(180deg, var(--surface), var(--bg-2))" : undefined,
        opacity: played ? 0.92 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "center" }}>
        <Side side="h" />
        <Center />
        <Side side="a" />
      </div>
    </button>
  );
}
