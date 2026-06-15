import { useMemo, useState } from "react";
import { useData } from "../../state/dataset";
import { useSheets } from "../../state/sheets";
import { Avatar } from "../../components/Avatar";
import { RaceChart } from "./RaceChart";
import { computeRace } from "./movement";
import { classifyTip } from "../../data/scoring";
import type { Dataset, PlayerStanding } from "../../data/types";

interface Acc {
  p: PlayerStanding;
  played: number;
  exact: number;
  correct: number;
  hitRate: number; // (exact+correct)/played
  form: number; // points in last 10 played
  goalsAvg: number; // avg goals per tip
}

function computeAccuracy(ds: Dataset): Acc[] {
  const playedMatches = ds.allMatches
    .filter((m) => m.status === "played" && m.ga != null && m.gb != null)
    .sort((a, b) => +a.kickoff - +b.kickoff);
  return ds.players
    .map((p) => {
      const mine = playedMatches.filter((m) => p.tips[m.id]);
      let exact = 0, correct = 0, goals = 0;
      mine.forEach((m) => {
        const t = p.tips[m.id];
        goals += t[0] + t[1];
        const r = classifyTip(t, m.ga!, m.gb!).result;
        if (r === "exact") exact++;
        else if (r === "outcome") correct++;
      });
      const last3 = mine.slice(-3);
      const form = last3.reduce((s, m) => s + classifyTip(p.tips[m.id], m.ga!, m.gb!).points, 0);
      return {
        p,
        played: mine.length,
        exact,
        correct,
        hitRate: mine.length ? (exact + correct) / mine.length : 0,
        form,
        goalsAvg: mine.length ? goals / mine.length : 0,
      };
    })
    .filter((a) => a.played > 0);
}

export function InsightsView() {
  const ds = useData();
  const acc = useMemo(() => computeAccuracy(ds), [ds]);
  const race = useMemo(() => computeRace(ds), [ds]);

  return (
    <div className="view container" style={{ maxWidth: 980 }}>
      <div className="section-head" style={{ marginTop: 6 }}>
        <div className="section-title">Insikter</div>
      </div>

      {race.days.length >= 2 && (
        <div style={{ marginBottom: 14 }}>
          <RaceChart race={race} />
        </div>
      )}

      <div className="ins-grid">
        <AccuracyCard acc={acc} />
        <FormCard acc={acc} />
      </div>

      <H2HCard ds={ds} />

      <TriviaCard acc={acc} ds={ds} />

      <style>{`
        .ins-grid{ display:grid; gap:14px; grid-template-columns:minmax(0,1fr); }
        @media(min-width:820px){ .ins-grid{ grid-template-columns:minmax(0,1fr) minmax(0,1fr); } }
        .ins-row{ display:flex; align-items:center; gap:10px; width:100%; text-align:left; padding:5px 6px; border-radius:8px; transition:background .12s; }
        .ins-row:hover{ background:var(--surface-2); }
      `}</style>
    </div>
  );
}

function AccuracyCard({ acc }: { acc: Acc[] }) {
  const openPlayer = useSheets((s) => s.openPlayer);
  const ranked = [...acc].sort((a, b) => b.hitRate - a.hitRate || b.exact - a.exact);
  return (
    <div className="card card-pad">
      <div className="kicker" style={{ marginBottom: 12 }}>Träffsäkerhet</div>
      <div style={{ display: "grid", gap: 4 }}>
        {ranked.map((a) => (
          <button key={a.p.id} className="ins-row" onClick={() => openPlayer(a.p.id)}>
            <Avatar name={a.p.name} photo={a.p.photo} color={a.p.color} size={26} />
            <span style={{ flex: 1, fontWeight: 700, fontSize: 13.5 }}>{a.p.name}</span>
            <div className="bar" style={{ width: 90, height: 7, borderRadius: 999, background: "var(--surface-3)", overflow: "hidden" }}>
              <div style={{ width: `${a.hitRate * 100}%`, height: "100%", background: "var(--grad-soft)" }} />
            </div>
            <span className="num" style={{ width: 42, textAlign: "right", fontSize: 13 }}>{Math.round(a.hitRate * 100)}%</span>
          </button>
        ))}
      </div>
      <div className="dim" style={{ fontSize: 11, marginTop: 10 }}>Andel tippade matcher med rätt utgång eller exakt.</div>
    </div>
  );
}

function FormCard({ acc }: { acc: Acc[] }) {
  const openPlayer = useSheets((s) => s.openPlayer);
  const ranked = [...acc].sort((a, b) => b.form - a.form);
  const max = Math.max(1, ...ranked.map((a) => a.form));
  return (
    <div className="card card-pad">
      <div className="kicker" style={{ marginBottom: 12 }}>Hetast just nu <span className="dim">· senaste 3</span></div>
      <div style={{ display: "grid", gap: 4 }}>
        {ranked.map((a, i) => (
          <button key={a.p.id} className="ins-row" onClick={() => openPlayer(a.p.id)}>
            <span className="num" style={{ width: 16, color: i === 0 ? "var(--hot)" : "var(--ink-3)", fontSize: 12 }}>{i + 1}</span>
            <Avatar name={a.p.name} photo={a.p.photo} color={a.p.color} size={26} />
            <span style={{ flex: 1, fontWeight: 700, fontSize: 13.5 }}>{a.p.name}</span>
            <div className="bar" style={{ width: 80, height: 7, borderRadius: 999, background: "var(--surface-3)", overflow: "hidden" }}>
              <div style={{ width: `${(a.form / max) * 100}%`, height: "100%", background: i === 0 ? "var(--grad)" : "var(--grad-cool)" }} />
            </div>
            <span className="num" style={{ width: 34, textAlign: "right", fontSize: 13 }}>{a.form}p</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function H2HCard({ ds }: { ds: Dataset }) {
  const [a, setA] = useState<string>(ds.players[0]?.id);
  const [b, setB] = useState<string>(ds.players[1]?.id);
  const pa = ds.players.find((p) => p.id === a);
  const pb = ds.players.find((p) => p.id === b);

  const cmp = useMemo(() => {
    if (!pa || !pb) return null;
    const shared = ds.allMatches.filter(
      (m) => m.status === "played" && m.ga != null && pa.tips[m.id] && pb.tips[m.id]
    );
    let aw = 0, bw = 0, tie = 0;
    shared.forEach((m) => {
      const ap = classifyTip(pa.tips[m.id], m.ga!, m.gb!).points;
      const bp = classifyTip(pb.tips[m.id], m.ga!, m.gb!).points;
      if (ap > bp) aw++;
      else if (bp > ap) bw++;
      else tie++;
    });
    return { shared: shared.length, aw, bw, tie };
  }, [pa, pb, ds]);

  if (!pa || !pb) return null;

  return (
    <div className="card card-pad" style={{ marginTop: 14 }}>
      <div className="kicker" style={{ marginBottom: 2 }}>Tvekamp</div>
      <div className="dim" style={{ fontSize: 11.5, marginBottom: 14 }}>
        Välj två spelare och jämför dem direkt mot varandra — vem som fått flest poäng på matcher ni <b>båda</b> tippat, plus exakta, bonus och placering.
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <PlayerPick players={ds.players} value={a} onChange={setA} align="left" />
        <div style={{ textAlign: "center", minWidth: 70 }}>
          <div className="num" style={{ fontSize: 26 }}>
            <span style={{ color: pa.total >= pb.total ? "var(--ink)" : "var(--ink-3)" }}>{pa.total}</span>
            <span className="dim" style={{ margin: "0 5px" }}>–</span>
            <span style={{ color: pb.total >= pa.total ? "var(--ink)" : "var(--ink-3)" }}>{pb.total}</span>
          </div>
          <div className="kicker" style={{ fontSize: 8.5 }}>poäng</div>
        </div>
        <PlayerPick players={ds.players} value={b} onChange={setB} align="right" />
      </div>

      {cmp && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", height: 28, borderRadius: 8, overflow: "hidden", gap: 2 }}>
            <Seg pct={pct(cmp.aw, cmp.shared)} label={`${cmp.aw}`} color="var(--hot)" />
            <Seg pct={pct(cmp.tie, cmp.shared)} label={`${cmp.tie}`} color="var(--ink-3)" />
            <Seg pct={pct(cmp.bw, cmp.shared)} label={`${cmp.bw}`} color="var(--cool)" />
          </div>
          <div className="dim" style={{ fontSize: 11, textAlign: "center", marginTop: 8 }}>
            På {cmp.shared} gemensamma matcher: {pa.name} bäst {cmp.aw} ggr · lika {cmp.tie} · {pb.name} bäst {cmp.bw} ggr
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
            <CmpRow label="Exakta" a={pa.exact} b={pb.exact} />
            <CmpRow label="Rätt utgång" a={pa.correct} b={pb.correct} />
            <CmpRow label="Bonuspoäng" a={pa.bonusPts} b={pb.bonusPts} />
            <CmpRow label="Placering" a={pa.rank} b={pb.rank} lowerBetter />
          </div>
        </div>
      )}
    </div>
  );
}

function CmpRow({ label, a, b, lowerBetter }: { label: string; a: number; b: number; lowerBetter?: boolean }) {
  const aBetter = lowerBetter ? a < b : a > b;
  const bBetter = lowerBetter ? b < a : b > a;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 11px", borderRadius: 8, background: "var(--surface)" }}>
      <span className="num" style={{ fontSize: 15, color: aBetter ? "var(--hot)" : "var(--ink-2)" }}>{a}</span>
      <span className="dim" style={{ fontSize: 11, fontWeight: 700 }}>{label}</span>
      <span className="num" style={{ fontSize: 15, color: bBetter ? "var(--cool-2)" : "var(--ink-2)" }}>{b}</span>
    </div>
  );
}

function PlayerPick({ players, value, onChange, align }: { players: PlayerStanding[]; value: string; onChange: (v: string) => void; align: "left" | "right" }) {
  const p = players.find((x) => x.id === value);
  return (
    <label style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: align === "right" ? "flex-end" : "flex-start", gap: 8 }}>
      {p && <Avatar name={p.name} photo={p.photo} color={p.color} size={42} />}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ background: "var(--surface)", color: "var(--ink)", border: "1px solid var(--line-2)", borderRadius: 8, padding: "6px 8px", fontWeight: 700, fontSize: 12.5, maxWidth: 130 }}
      >
        {players.map((pl) => (
          <option key={pl.id} value={pl.id}>{pl.name}</option>
        ))}
      </select>
    </label>
  );
}

function TriviaCard({ acc, ds }: { acc: Acc[]; ds: Dataset }) {
  if (!acc.length) return null;
  const optimist = [...acc].sort((a, b) => b.goalsAvg - a.goalsAvg)[0];
  const cautious = [...acc].sort((a, b) => a.goalsAvg - b.goalsAvg)[0];
  const sharpest = [...acc].sort((a, b) => b.exact - a.exact)[0];
  return (
    <div className="card card-pad" style={{ marginTop: 14 }}>
      <div className="kicker" style={{ marginBottom: 12 }}>Kuriosa</div>
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
        <Trivia emoji="🎯" label="Vassast" p={sharpest.p} sub={`${sharpest.exact} exakta`} />
        <Trivia emoji="⚽" label="Måloptimist" p={optimist.p} sub={`${optimist.goalsAvg.toFixed(1)} mål/tips`} />
        <Trivia emoji="🧱" label="Försiktigast" p={cautious.p} sub={`${cautious.goalsAvg.toFixed(1)} mål/tips`} />
      </div>
    </div>
  );
}

function Trivia({ emoji, label, p, sub }: { emoji: string; label: string; p: PlayerStanding; sub: string }) {
  const openPlayer = useSheets((s) => s.openPlayer);
  return (
    <button onClick={() => openPlayer(p.id)} style={{ padding: "12px", borderRadius: 12, background: "var(--surface)", border: "1px solid var(--line)", textAlign: "left", display: "flex", alignItems: "center", gap: 11 }}>
      <Avatar name={p.name} photo={p.photo} color={p.color} size={38} />
      <div style={{ minWidth: 0 }}>
        <div className="kicker" style={{ fontSize: 9 }}>{emoji} {label}</div>
        <div style={{ fontWeight: 800, fontSize: 14, marginTop: 2, color: p.color }}>{p.name}</div>
        <div className="dim" style={{ fontSize: 11 }}>{sub}</div>
      </div>
    </button>
  );
}

const pct = (n: number, total: number) => (total ? (n / total) * 100 : 33.3);
function Seg({ pct, label, color }: { pct: number; label: string; color: string }) {
  return (
    <div style={{ width: `${pct}%`, minWidth: 26, background: color, display: "grid", placeItems: "center", color: "#0a0712", fontWeight: 800, fontSize: 12 }}>
      {label}
    </div>
  );
}
