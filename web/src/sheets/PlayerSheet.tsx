import { useEffect, useRef } from "react";
import { useData } from "../state/dataset";
import { useSheets } from "../state/sheets";
import { Sheet, type SheetChrome } from "../components/Sheet";
import { Avatar } from "../components/Avatar";
import { Flag } from "../lib/flags";
import { classifyTip } from "../data/scoring";
import { svDayMonth } from "../lib/format";
import { fixName } from "../data/static/names";
import { isLive } from "../lib/liveState";
import { liveMinuteText } from "../lib/liveMinute";
import { useNow } from "../state/useNow";
import type { BonusSlot } from "../data/types";

const BONUS_LABEL: Record<BonusSlot, string> = {
  winner: "Vinnare", silver: "Silver", bronze: "Brons",
  topscorer: "Skyttekung", bestplayer: "Bästa spelare", youngplayer: "Bästa unga", keeper: "Bästa målvakt",
};

export function PlayerSheet({ id, ...chrome }: { id: string } & SheetChrome) {
  const ds = useData();
  const openMatch = useSheets((s) => s.openMatch);
  const openTeam = useSheets((s) => s.openTeam);
  const openFbPlayer = useSheets((s) => s.openFbPlayer);
  const now = useNow(30_000); // tick the live minute while the sheet is open
  const p = ds.players.find((x) => x.id === id);
  if (!p) return null;

  // Matches being played right now (so a tipster's profile shows the live action +
  // how their tip is doing against the running score).
  const live = ds.allMatches.filter(isLive).sort((a, b) => +a.kickoff - +b.kickoff);
  const updatedAt = ds.updatedAt ? new Date(ds.updatedAt).getTime() : null;

  // chronological: the WC's first played match at the top
  const tipped = ds.allMatches
    .filter((m) => p.tips[m.id])
    .sort((a, b) => +a.kickoff - +b.kickoff);
  // the next match this player has tipped that hasn't finished (live or upcoming)
  const nextId = tipped.find((m) => m.status !== "played")?.id;
  const nextRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = nextRef.current;
    if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "center" }), 250);
  }, [nextId]);

  return (
    <Sheet {...chrome} accent={p.color}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <Avatar name={p.name} photo={p.photo} color={p.color} size={58} ring={p.rank <= 3 ? "var(--gold)" : null} zoomable />
        <div style={{ flex: 1 }}>
          <div className="display" style={{ fontSize: 28 }}>{p.name}</div>
          <div className="dim" style={{ fontWeight: 700, fontSize: 13 }}>#{p.rank} i ligan</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginTop: 16 }}>
        <Kpi label="Poäng totalt" value={p.total} accent="var(--gold)" />
        <Kpi label="Från matcher" value={p.points} />
        <Kpi label="Från bonus" value={p.bonusPts} />
        <Kpi label="Exakta resultat" value={p.exact} accent="var(--win)" />
      </div>
      <div className="dim" style={{ fontSize: 11.5, marginTop: 8, textAlign: "center" }}>
        {p.exact} exakta · {p.correct} rätt utgång · {p.other} tröstpoäng
      </div>

      {/* live now — current results of matches being played + this player's tip */}
      {live.length > 0 && (
        <div className="card card-pad" style={{ marginTop: 14, border: "1px solid color-mix(in srgb, var(--hot) 30%, var(--line-2))", background: "color-mix(in srgb, var(--hot) 5%, var(--surface))" }}>
          <div className="kicker" style={{ marginBottom: 10, display: "inline-flex", alignItems: "center", gap: 8, color: "var(--hot-2)" }}>
            <span className="live-dot" style={{ background: "var(--hot)" }} />Pågår nu
          </div>
          <div style={{ display: "grid", gap: 7 }}>
            {live.map((m) => {
              const tip = p.tips[m.id];
              const home = m.home ? ds.teams[m.home] : null;
              const away = m.away ? ds.teams[m.away] : null;
              const res = tip && m.ga != null && m.gb != null ? classifyTip(tip, m.ga, m.gb).result : null;
              const tipCol = res === "exact" ? "var(--gold)" : res === "outcome" ? "var(--win)" : res === "floor" ? "var(--ink-3)" : "var(--ink-2)";
              return (
                <button key={m.id} onClick={() => m._realId && openMatch(m.id)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 9px", borderRadius: 9, background: "var(--surface)", width: "100%", textAlign: "left", minWidth: 0 }}>
                  <span className="live-pill" style={{ flex: "0 0 auto", fontSize: 8.5, padding: "2px 6px" }}><span className="live-dot" style={{ width: 5, height: 5 }} />{liveMinuteText(m, updatedAt, now)}</span>
                  <Flag iso={home?.iso} code={m.home} size={15} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{home?.name || "?"}</span>
                  <span className="num" style={{ flex: "0 0 auto", fontSize: 15, fontWeight: 800, color: "var(--hot)" }}>{m.ga ?? 0}–{m.gb ?? 0}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{away?.name || "?"}</span>
                  <Flag iso={away?.iso} code={m.away} size={15} />
                  <span className="num" title="tips" style={{ flex: "0 0 auto", width: 46, textAlign: "right", fontSize: 11.5, fontWeight: 800, color: tipCol }}>{tip ? `${tip[0]}–${tip[1]}` : "–"}</span>
                </button>
              );
            })}
          </div>
          <div className="dim" style={{ fontSize: 10, marginTop: 8 }}>Live-resultat · {p.name}s tips till höger (guld = exakt, grön = rätt utgång just nu).</div>
        </div>
      )}

      {/* bonus picks */}
      <div className="card card-pad" style={{ marginTop: 14 }}>
        <div className="kicker" style={{ marginBottom: 10 }}>Bonustips</div>
        <div style={{ display: "grid", gap: 7 }}>
          {(Object.keys(BONUS_LABEL) as BonusSlot[]).map((k) => {
            const v = p.bonus[k];
            const isTeam = k === "winner" || k === "silver" || k === "bronze";
            const teamCode = isTeam ? (v as string | null) : null;
            const t = teamCode ? ds.teams[teamCode] : null;
            const text = isTeam ? t?.name || "—" : Array.isArray(v) ? fixName(v[0]) : "—";
            const actual = ds.bonusActual?.[mapKey(k)];
            const correct = actual && isTeam ? actual === t?.name || ds.teams[teamCode!]?.name === actual : actual && !isTeam && text !== "—" ? actual.toLowerCase().includes(text.toLowerCase()) : false;
            const playerName = !isTeam && text !== "—" ? text : null;
            const clickable = !!teamCode || !!playerName;
            const open = () => { if (teamCode) openTeam(teamCode); else if (playerName) openFbPlayer(playerName); };
            return (
              <button key={k} onClick={clickable ? open : undefined} disabled={!clickable}
                style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 8px", borderRadius: 8, background: "var(--surface)", width: "100%", textAlign: "left", cursor: clickable ? "pointer" : "default" }}>
                <span className="dim" style={{ width: 104, fontSize: 11.5, fontWeight: 700 }}>{BONUS_LABEL[k]}</span>
                {t && <Flag iso={t.iso} code={teamCode} size={16} />}
                <span style={{ flex: 1, fontWeight: 700, fontSize: 13.5, color: clickable ? "var(--cool-2)" : undefined }}>{text}</span>
                {correct && <span className="chip solid" style={{ background: "var(--win)", color: "#0a0712", fontSize: 9.5, padding: "1px 6px" }}>RÄTT</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* match tips */}
      {tipped.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="kicker" style={{ marginBottom: 8 }}>Matchtips ({tipped.length})</div>
          <div style={{ display: "grid", gap: 7, gridTemplateColumns: "minmax(0, 1fr)" }}>
            {tipped.map((m) => {
              const tip = p.tips[m.id];
              const home = m.home ? ds.teams[m.home] : null;
              const away = m.away ? ds.teams[m.away] : null;
              const played = m.status === "played" && m.ga != null && m.gb != null;
              const pts = played ? classifyTip(tip, m.ga!, m.gb!).points : null;
              // Colour the row by result: exact (5) = gold, right outcome (2) =
              // green, wrong (1, "tröstpoäng") = red.
              const accent = pts === 5 ? "var(--gold)" : pts === 2 ? "var(--win)" : pts === 1 ? "var(--loss)" : null;
              const openThis = () => m._realId && openMatch(m.id);
              const isNext = m.id === nextId;
              const bg = isNext
                ? "color-mix(in srgb, var(--cool) 12%, var(--surface))"
                : accent
                  ? `color-mix(in srgb, ${accent} 10%, var(--surface))`
                  : undefined;
              return (
                // a row of separate click targets: the team names open the team,
                // the date + score open the match (nested buttons aren't allowed,
                // so the container is a div). minWidth:0 everywhere lets the team
                // names ellipsis instead of pushing the row off-screen.
                <div key={m.id} ref={isNext ? nextRef : undefined} className="card" style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 10px", borderRadius: "var(--r-md)", minWidth: 0, background: bg, border: isNext ? "1.5px solid var(--cool)" : undefined, borderLeft: !isNext && accent ? `3px solid ${accent}` : undefined, position: "relative" }}>
                  {isNext && <span className="chip" style={{ position: "absolute", top: -8, left: 10, fontSize: 8.5, padding: "1px 7px", background: "var(--cool)", color: "#0a0712", fontWeight: 800, letterSpacing: ".05em" }}>NÄSTA</span>}
                  <button onClick={openThis} className="dim" style={{ flex: "0 0 auto", width: 42, fontSize: 10.5, fontWeight: 700, padding: 0, textAlign: "left" }}>{svDayMonth(m.kickoff)}</button>
                  <button onClick={() => m.home && openTeam(m.home)} disabled={!m.home} style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 5, padding: 0 }}>
                    <Flag iso={home?.iso} code={m.home} size={15} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: m.home ? "var(--cool-2)" : undefined }}>{home?.name || "?"}</span>
                  </button>
                  <button onClick={openThis} className="num" style={{ flex: "0 0 auto", textAlign: "center", padding: 0, whiteSpace: "nowrap" }}>
                    <span style={{ color: "var(--cool-2)" }}>{tip[0]}–{tip[1]}</span>
                    {played && <span className="dim" style={{ fontSize: 10.5 }}> ({m.ga}–{m.gb})</span>}
                  </button>
                  <button onClick={() => m.away && openTeam(m.away)} disabled={!m.away} style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 5, padding: 0 }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: m.away ? "var(--cool-2)" : undefined }}>{away?.name || "?"}</span>
                    <Flag iso={away?.iso} code={m.away} size={15} />
                  </button>
                  {pts != null && <span className="num" style={{ flex: "0 0 auto", width: 20, textAlign: "right", fontSize: 13, color: accent || "var(--ink-2)" }}>{pts}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Sheet>
  );
}

function mapKey(k: BonusSlot): "winner" | "silver" | "bronze" | "top_scorer" | "best_player" | "best_young" | "best_keeper" {
  const map: Record<BonusSlot, any> = {
    winner: "winner", silver: "silver", bronze: "bronze",
    topscorer: "top_scorer", bestplayer: "best_player", youngplayer: "best_young", keeper: "best_keeper",
  };
  return map[k];
}

function Kpi({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="card" style={{ padding: "10px 8px", textAlign: "center" }}>
      <div className="num" style={{ fontSize: 24, color: accent || "var(--ink)" }}>{value}</div>
      <div className="kicker" style={{ fontSize: 9 }}>{label}</div>
    </div>
  );
}
