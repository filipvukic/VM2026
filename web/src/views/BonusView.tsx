import { useData, usePlayersDb } from "../state/dataset";
import { useSheets } from "../state/sheets";
import { Flag } from "../lib/flags";
import { Avatar } from "../components/Avatar";
import { PlayerImg } from "../components/PlayerImg";
import { bestPhoto, findPlayer } from "../lib/playerPhoto";
import type { BonusSlot, Dataset, RawBonusKey } from "../data/types";

const SLOTS: { key: BonusSlot; raw: RawBonusKey; label: string; team: boolean }[] = [
  { key: "winner", raw: "winner", label: "Vinnare", team: true },
  { key: "silver", raw: "silver", label: "Silver", team: true },
  { key: "bronze", raw: "bronze", label: "Brons", team: true },
  { key: "topscorer", raw: "top_scorer", label: "Skyttekung", team: false },
  { key: "bestplayer", raw: "best_player", label: "Bästa spelare", team: false },
  { key: "youngplayer", raw: "best_young", label: "Bästa unga spelare", team: false },
  { key: "keeper", raw: "best_keeper", label: "Bästa målvakt", team: false },
];

interface Scorer {
  name: string;
  goals: number;
  assists: number;
}
function tallyScorers(ds: Dataset): Scorer[] {
  const map = new Map<string, Scorer>();
  const bump = (n: string | null | undefined, kind: "g" | "a") => {
    if (!n) return;
    const e = map.get(n) || { name: n, goals: 0, assists: 0 };
    if (kind === "g") e.goals++;
    else e.assists++;
    map.set(n, e);
  };
  ds.allMatches.forEach((m) => {
    if (m.status === "upcoming") return;
    m.scorers.forEach((g) => {
      bump(g.name, "g");
      if (g.assist) bump(g.assist, "a");
    });
  });
  return [...map.values()];
}

export function BonusView() {
  const ds = useData();
  const all = tallyScorers(ds);
  const goals = all.filter((s) => s.goals > 0).sort((a, b) => b.goals - a.goals || b.assists - a.assists || a.name.localeCompare(b.name)).slice(0, 12);
  const assists = all.filter((s) => s.assists > 0).sort((a, b) => b.assists - a.assists || b.goals - a.goals || a.name.localeCompare(b.name)).slice(0, 12);
  return (
    <div className="view container">
      <div className="section-head" style={{ marginTop: 6 }}>
        <div className="section-title">Bonus</div>
        <div className="kicker">Extrapoäng som avgörs när VM är slut</div>
      </div>
      <div className="bonus-grid">
        {SLOTS.map((s) => (
          <BonusCard key={s.key} slot={s} ds={ds} />
        ))}
      </div>

      {(goals.length > 0 || assists.length > 0) && (
        <div className="scorer-grid">
          {goals.length > 0 && <ScorerList title="Skytteligan" sub="flest mål" items={goals} metric="goals" />}
          {assists.length > 0 && <ScorerList title="Assistligan" sub="flest assist" items={assists} metric="assists" />}
        </div>
      )}

      <style>{`
        .bonus-grid{ display:grid; gap:14px; grid-template-columns:minmax(0,1fr); }
        @media(min-width:680px){ .bonus-grid{ grid-template-columns:minmax(0,1fr) minmax(0,1fr); } }
        @media(min-width:1040px){ .bonus-grid{ grid-template-columns:repeat(3,minmax(0,1fr)); } }
        .scorer-grid{ display:grid; gap:14px; grid-template-columns:minmax(0,1fr); margin-top:22px; }
        @media(min-width:760px){ .scorer-grid{ grid-template-columns:minmax(0,1fr) minmax(0,1fr); } }
      `}</style>
    </div>
  );
}

function ScorerList({ title, sub, items, metric }: { title: string; sub: string; items: Scorer[]; metric: "goals" | "assists" }) {
  const db = usePlayersDb();
  const openFb = useSheets((s) => s.openFbPlayer);
  return (
    <div>
      <div className="section-head" style={{ margin: "0 0 10px" }}>
        <div className="section-title" style={{ fontSize: 19 }}>{title}</div>
        <div className="kicker">{sub}</div>
      </div>
      <div className="card" style={{ overflow: "hidden" }}>
        {items.map((s, i) => {
          const main = metric === "goals" ? s.goals : s.assists;
          const other = metric === "goals" ? s.assists : s.goals;
          const otherLabel = metric === "goals" ? "assist" : "mål";
          return (
            <button
              key={s.name}
              onClick={() => openFb(s.name, findPlayer(s.name, db)?.espnId)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 11, padding: "9px 14px", textAlign: "left", borderBottom: i < items.length - 1 ? "1px solid var(--line)" : "none" }}
            >
              <span className="num" style={{ width: 18, color: i === 0 ? "var(--gold)" : "var(--ink-3)", fontSize: 13 }}>{i + 1}</span>
              <PlayerImg src={bestPhoto(findPlayer(s.name, db))} name={s.name} size={30} radius={8} fontSize={11} />
              <span style={{ flex: 1, fontWeight: 700, fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</span>
              {other > 0 && <span className="num dim" style={{ fontSize: 11.5 }}>{other} {otherLabel}</span>}
              <span className="num" style={{ color: "var(--gold)", fontSize: 16, width: 26, textAlign: "right" }}>{main}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BonusCard({ slot, ds }: { slot: (typeof SLOTS)[number]; ds: Dataset }) {
  const openTeam = useSheets((s) => s.openTeam);
  const openFb = useSheets((s) => s.openFbPlayer);
  const openPlayer = useSheets((s) => s.openPlayer);
  const db = usePlayersDb();
  const points = ds.bonusPoints?.[slot.raw] ?? 0;
  const actual = ds.bonusActual?.[slot.raw] || null;

  // tally picks
  const tally = new Map<string, { label: string; code: string | null; photo: string | null; people: { id: string; name: string; color: string; photo: string | null }[] }>();
  ds.players.forEach((p) => {
    const v = p.bonus[slot.key];
    let key: string, label: string, code: string | null = null, photo: string | null = null;
    if (slot.team) {
      code = (v as string | null) || null;
      if (!code) return;
      label = ds.teams[code]?.name || code;
      key = code;
    } else {
      const name = Array.isArray(v) ? v[0] : null;
      if (!name || name === "-") return;
      label = name;
      key = name.toLowerCase();
      photo = bestPhoto(findPlayer(name, db));
    }
    if (!tally.has(key)) tally.set(key, { label, code, photo, people: [] });
    tally.get(key)!.people.push({ id: p.id, name: p.name, color: p.color, photo: p.photo });
  });
  const ranked = [...tally.values()].sort((a, b) => b.people.length - a.people.length);
  const top = ranked[0];

  const openPick = (code: string | null, label: string) => (slot.team && code ? openTeam(code) : !slot.team ? openFb(label) : undefined);

  return (
    <div className="card" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderBottom: "1px solid var(--line)" }}>
        <div className="kicker" style={{ fontSize: 11 }}>{slot.label}</div>
        <span className="chip" style={{ background: "var(--surface-3)", borderColor: "transparent", color: "var(--gold)" }}>{points}p</span>
      </div>

      <div style={{ padding: "14px" }}>
        {actual ? (
          <button onClick={() => (slot.team ? undefined : openFb(actual))} style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12, padding: "8px 10px", borderRadius: 10, width: "100%", textAlign: "left", background: "color-mix(in srgb, var(--gold) 14%, transparent)", border: "1px solid color-mix(in srgb, var(--gold) 38%, transparent)" }}>
            <span className="chip solid" style={{ background: "var(--gold)", color: "#0a0712", fontSize: 9.5 }}>{slot.raw === "top_scorer" ? "LEDER NU" : "FACIT"}</span>
            <span style={{ fontWeight: 800 }}>{actual}</span>
          </button>
        ) : (
          <div className="dim" style={{ fontSize: 11.5, marginBottom: 12 }}>Avgörs när VM är slut</div>
        )}

        {top ? (
          <button onClick={() => openPick(top.code, top.label)} style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 12, width: "100%", textAlign: "left" }}>
            {slot.team && top.code ? (
              <Flag iso={ds.teams[top.code]?.iso} code={top.code} size={32} />
            ) : (
              <PlayerImg src={top.photo} name={top.label} size={38} radius={11} fontSize={14} />
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 16, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{top.label}</div>
              <div className="dim" style={{ fontSize: 11 }}>flest tror på detta · {top.people.length} st</div>
            </div>
          </button>
        ) : (
          <div className="dim" style={{ fontSize: 12 }}>Inga tips ännu.</div>
        )}

        {/* all picks */}
        <div style={{ display: "grid", gap: 6, marginTop: "auto" }}>
          {ranked.map((r) => (
            <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button onClick={() => openPick(r.code, r.label)} style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, minWidth: 0, textAlign: "left" }}>
                {slot.team && r.code ? (
                  <Flag iso={ds.teams[r.code]?.iso} code={r.code} size={16} />
                ) : (
                  <PlayerImg src={r.photo} name={r.label} size={20} radius={6} fontSize={9} />
                )}
                <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.label}</span>
              </button>
              <span style={{ display: "inline-flex", marginRight: 4 }}>
                {r.people.slice(0, 5).map((pp, i) => (
                  <button key={pp.name} onClick={() => openPlayer(pp.id)} style={{ marginLeft: i ? -7 : 0, display: "inline-flex" }} title={pp.name}>
                    <Avatar name={pp.name} photo={pp.photo} color={pp.color} size={20} />
                  </button>
                ))}
              </span>
              <span className="num dim" style={{ fontSize: 12, width: 18, textAlign: "right" }}>{r.people.length}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
