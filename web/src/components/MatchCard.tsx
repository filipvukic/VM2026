import type { Match } from "../data/types";
import { useData } from "../state/dataset";
import { Flag } from "../lib/flags";
import { svTime } from "../lib/format";
import { liveMinuteText } from "../lib/liveMinute";
import { isLive } from "../lib/liveState";
import { broadcastForPair } from "../data/static/broadcasts";
import { useNow } from "../state/useNow";

interface Props {
  match: Match;
  onOpen?: (m: Match) => void;
  myTip?: [number, number] | null;
  compact?: boolean;
}

// Match card: the two teams stacked (flag · name · score), a hairline, then a clean
// status line (live minute / Slut / Avspark) with a status-coloured dot and the TV
// channel. No loud accent border — the dot + score colour carry the state.
export function MatchCard({ match: m, onOpen, myTip, compact }: Props) {
  const ds = useData();
  const now = useNow(isLive(m) ? 30_000 : 0);
  const updatedAt = ds.updatedAt ? new Date(ds.updatedAt).getTime() : null;
  const home = m.home ? ds.teams[m.home] : null;
  const away = m.away ? ds.teams[m.away] : null;
  const live = isLive(m);
  const played = m.status === "played" || (m.status === "live" && !!m.likelyEnded);
  const showScore = played || live;
  const bc = !played ? broadcastForPair(m.home, m.away, home?.name, away?.name, m.fifa) : null;
  const state = live ? "live" : played ? "done" : "soon";

  const TeamRow = ({ side }: { side: "h" | "a" }) => {
    const code = side === "h" ? m.home : m.away;
    const t = code ? ds.teams[code] : null;
    const name = t?.name || (side === "h" ? m.fromA : m.fromB) || "TBD";
    const proj = !code ? (side === "h" ? m.projHome : m.projAway) : null;
    const projName = proj ? ds.teams[proj]?.name : null;
    const score = side === "h" ? m.ga : m.gb;
    const isWin = played && m.winner != null && m.winner === code;
    const isLoss = played && m.winner != null && code != null && m.winner !== code;
    return (
      <div className={`mc-row${isWin ? " win" : ""}${isLoss ? " loss" : ""}`}>
        <Flag iso={t?.iso} code={code} size={compact ? 22 : 26} />
        <span className="mc-name" style={t ? undefined : { color: "var(--ink-3)" }}>{projName || name}</span>
        {isWin && <span className="mc-win">✓</span>}
        {showScore && code && <span className="mc-sc">{score ?? 0}</span>}
      </div>
    );
  };

  return (
    <button
      className={`mc mc-${state}${compact ? " compact" : ""}`}
      onClick={onOpen ? () => onOpen(m) : undefined}
      style={{ cursor: onOpen ? "pointer" : "default" }}
    >
      <div className="mc-rows">
        <TeamRow side="h" />
        <TeamRow side="a" />
      </div>
      <div className="mc-foot">
        <span className="mc-status">
          {live ? (
            <><span className="mc-dot" /><span className="mc-live-min">{liveMinuteText(m, updatedAt, now)}</span></>
          ) : played ? (
            <><span className="mc-dot" />Slut{m.pen ? ` · str ${m.pen[0]}–${m.pen[1]}` : ""}</>
          ) : (
            <><span className="mc-dot" />Avspark <b>{svTime(m.kickoff)}</b></>
          )}
        </span>
        <span className="mc-foot-r">
          {myTip && !showScore && <span className="mc-tip">ditt {myTip[0]}–{myTip[1]}</span>}
          {bc?.broadcaster && <span className="mc-tv">{bc.label}</span>}
        </span>
      </div>
    </button>
  );
}
