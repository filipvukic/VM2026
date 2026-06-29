import { useEffect, useMemo, useState } from "react";
import { useData } from "../state/dataset";
import { useKoBets, type Tip } from "../state/koBets";
import { Flag } from "../lib/flags";
import { svDayMonth } from "../lib/format";
import type { Dataset, Match } from "../data/types";

// Modal for entering knockout tips. Log in with a personal code, then set a score for
// every drawn match in a not-yet-started round (the current round and earlier are
// locked). Saving sends everything to the worker, which only stores the open ones.
export function KoBetSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ds = useData();
  const { code, name, bets, open: openIds, status, error, login, save, logout } = useKoBets();
  const [codeInput, setCodeInput] = useState("");
  const [draft, setDraft] = useState<Record<string, Tip>>({});
  const [savedFlash, setSavedFlash] = useState(false);

  // Seed the editable drafts from the stored tips whenever they (re)load.
  useEffect(() => { setDraft({ ...bets }); }, [bets]);

  const rounds = useMemo(() => koRounds(ds), [ds]);
  if (!open) return null;

  const loggedIn = !!name;
  const setTip = (id: string, side: 0 | 1, val: number) => {
    setDraft((d) => {
      const cur = d[id] || [0, 0];
      const next: Tip = side === 0 ? [val, cur[1]] : [cur[0], val];
      return { ...d, [id]: next };
    });
  };
  const onSave = async () => {
    // only send the editable ones
    const payload: Record<string, Tip> = {};
    for (const id of openIds) if (draft[id]) payload[id] = draft[id];
    const ok = await save(payload);
    if (ok) { setSavedFlash(true); setTimeout(() => setSavedFlash(false), 2000); }
  };

  const openCount = rounds.flatMap((r) => r.matches).filter((m) => openIds.has(fid(m))).length;

  return (
    <div className="kob-root" role="dialog" aria-modal="true">
      <div className="kob-dim" onClick={onClose} />
      <div className="kob-panel">
        <div className="kob-head">
          <div>
            <div className="kob-title">Slutspelstips</div>
            {loggedIn && <div className="dim" style={{ fontSize: 12, fontWeight: 700 }}>Inloggad som {name}</div>}
          </div>
          <button className="kob-x" onClick={onClose} aria-label="Stäng">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" /></svg>
          </button>
        </div>

        {!loggedIn ? (
          <div className="kob-login">
            <p className="dim" style={{ fontSize: 13.5, lineHeight: 1.5 }}>
              Ange din personliga kod för att lägga in tips på slutspelet. Du tippar varje match så fort
              den är lottad, fram tills omgången startar.
            </p>
            <form
              onSubmit={async (e) => { e.preventDefault(); if (await login(codeInput)) setCodeInput(""); }}
              style={{ display: "flex", gap: 8, marginTop: 6 }}
            >
              <input
                className="kob-code" value={codeInput} onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                placeholder="DIN KOD" autoCapitalize="characters" autoComplete="off" maxLength={6} inputMode="text"
              />
              <button className="kob-btn" type="submit" disabled={status === "loading" || codeInput.trim().length < 4}>
                {status === "loading" ? "…" : "Logga in"}
              </button>
            </form>
            {error && <div className="kob-err">{error}</div>}
          </div>
        ) : (
          <>
            <div className="kob-body">
              {openCount === 0 && (
                <div className="card card-pad dim" style={{ textAlign: "center", fontSize: 13 }}>
                  Inga matcher att tippa just nu. Så fort nästa omgångs matcher lottas dyker de upp här —
                  du kan ändra tills omgången startar.
                </div>
              )}
              {rounds.map((r) => {
                const determined = r.matches.filter((m) => m.home && m.away);
                if (!determined.length && !r.matches.some((m) => openIds.has(fid(m)))) {
                  // round not drawn yet — show a slim placeholder only for the next round(s)
                  if (r.future) return (
                    <div key={r.key} className="kob-round">
                      <div className="kob-round-h">{r.label}</div>
                      <div className="dim" style={{ fontSize: 12, padding: "2px 2px 4px" }}>Lottas när föregående omgång är klar.</div>
                    </div>
                  );
                  return null;
                }
                return (
                  <div key={r.key} className="kob-round">
                    <div className="kob-round-h">{r.label}</div>
                    {determined.map((m) => {
                      const id = fid(m);
                      const editable = openIds.has(id);
                      const home = m.home ? ds.teams[m.home] : null;
                      const away = m.away ? ds.teams[m.away] : null;
                      const t = draft[id] || bets[id] || null;
                      const played = m.status === "played" && m.ga != null && m.gb != null;
                      return (
                        <div key={id} className={`kob-row${editable ? "" : " locked"}`}>
                          <div className="kob-team h">
                            <span className="kob-nm">{home?.name || "?"}</span>
                            <Flag iso={home?.iso} code={m.home} size={16} />
                          </div>
                          <div className="kob-score">
                            {editable ? (
                              <>
                                <Stepper value={t ? t[0] : 0} onChange={(v) => setTip(id, 0, v)} />
                                <span className="kob-dash">–</span>
                                <Stepper value={t ? t[1] : 0} onChange={(v) => setTip(id, 1, v)} />
                              </>
                            ) : (
                              <span className="kob-fixed">{t ? `${t[0]}–${t[1]}` : "–"}</span>
                            )}
                          </div>
                          <div className="kob-team a">
                            <Flag iso={away?.iso} code={m.away} size={16} />
                            <span className="kob-nm">{away?.name || "?"}</span>
                          </div>
                          <div className="kob-meta">
                            {editable ? svDayMonth(m.kickoff) : played ? <span className="kob-lock">{m.ga}–{m.gb}</span> : <span className="kob-lock">låst</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
              {error && <div className="kob-err">{error}</div>}
            </div>
            <div className="kob-foot">
              <button className="kob-logout" onClick={logout}>Logga ut</button>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {savedFlash && <span className="kob-saved">Sparat ✓</span>}
                <button className="kob-btn" onClick={onSave} disabled={status === "saving" || openCount === 0}>
                  {status === "saving" ? "Sparar…" : "Spara tips"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <style>{`
        .kob-root{ position:fixed; inset:0; z-index:300; display:flex; align-items:flex-end; justify-content:center; }
        @media(min-width:560px){ .kob-root{ align-items:center; } }
        .kob-dim{ position:absolute; inset:0; background:rgba(4,2,10,.6); backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px); }
        .kob-panel{ position:relative; width:100%; max-width:560px; max-height:90dvh; display:flex; flex-direction:column;
          background:linear-gradient(180deg, var(--surface-2), var(--bg-2)); border:1px solid var(--line-2);
          border-radius:var(--r-xl) var(--r-xl) 0 0; box-shadow:var(--shadow-lift); animation:kobIn .28s cubic-bezier(.2,.7,.2,1); }
        @media(min-width:560px){ .kob-panel{ border-radius:var(--r-xl); } }
        @keyframes kobIn{ from{ transform:translateY(16px); opacity:.6; } to{ transform:none; opacity:1; } }
        .kob-head{ display:flex; align-items:center; justify-content:space-between; padding:16px 18px 12px; border-bottom:1px solid var(--line); }
        .kob-title{ font-family:var(--font-display); font-weight:800; font-size:20px; }
        .kob-x{ width:34px; height:34px; display:grid; place-items:center; border-radius:50%; color:var(--ink-2); background:var(--surface-3); }
        .kob-login{ padding:18px; }
        .kob-code{ flex:1; min-width:0; background:var(--surface); border:1px solid var(--line-2); border-radius:var(--r-md);
          padding:11px 14px; font-family:var(--font-display); font-weight:800; font-size:18px; letter-spacing:.18em; text-align:center; color:var(--ink); text-transform:uppercase; }
        .kob-btn{ background:var(--grad-soft); color:#fff; font-weight:800; font-size:14px; padding:11px 18px; border-radius:var(--r-md); white-space:nowrap; }
        .kob-btn:disabled{ opacity:.5; }
        .kob-err{ color:var(--loss); font-size:12.5px; font-weight:700; margin-top:10px; }
        .kob-body{ overflow-y:auto; padding:14px 16px; display:grid; gap:16px; }
        .kob-round-h{ font-family:var(--font-display); text-transform:uppercase; letter-spacing:.06em; font-weight:800; font-size:11px; color:var(--ink-3); margin-bottom:8px; }
        .kob-row{ display:grid; grid-template-columns:minmax(0,1fr) auto minmax(0,1fr); align-items:center; gap:8px;
          padding:8px 4px; border-top:1px solid var(--line); }
        .kob-row:first-of-type{ border-top:none; }
        .kob-row.locked{ opacity:.6; }
        .kob-team{ display:flex; align-items:center; gap:6px; min-width:0; }
        .kob-team.h{ justify-content:flex-end; }
        .kob-nm{ font-size:12.5px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .kob-score{ display:flex; align-items:center; gap:5px; }
        .kob-dash{ color:var(--ink-3); font-weight:800; }
        .kob-fixed{ font-family:var(--font-display); font-weight:800; font-size:15px; font-variant-numeric:tabular-nums; min-width:40px; text-align:center; }
        .kob-meta{ grid-column:1 / -1; text-align:center; font-size:9.5px; font-weight:700; color:var(--ink-3); }
        .kob-lock{ color:var(--ink-3); }
        .kob-step{ display:flex; flex-direction:column; align-items:center; }
        .kob-step button{ width:26px; height:18px; display:grid; place-items:center; color:var(--ink-2); background:var(--surface-3); font-weight:800; line-height:1; }
        .kob-step button:first-child{ border-radius:7px 7px 0 0; } .kob-step button:last-child{ border-radius:0 0 7px 7px; margin-top:2px; }
        .kob-step .v{ font-family:var(--font-display); font-weight:800; font-size:16px; padding:1px 0; font-variant-numeric:tabular-nums; }
        .kob-foot{ display:flex; align-items:center; justify-content:space-between; padding:12px 16px; border-top:1px solid var(--line); }
        .kob-logout{ color:var(--ink-3); font-size:12.5px; font-weight:700; }
        .kob-saved{ color:var(--win); font-size:12.5px; font-weight:800; }
        .kob-round{ }
      `}</style>
    </div>
  );
}

const fid = (m: Match) => String(m._realId ?? "");

function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="kob-step">
      <button type="button" aria-label="+" onClick={() => onChange(Math.min(20, value + 1))}>+</button>
      <span className="v">{value}</span>
      <button type="button" aria-label="−" onClick={() => onChange(Math.max(0, value - 1))}>−</button>
    </div>
  );
}

function koRounds(ds: Dataset) {
  const k = ds.knockout;
  return [
    { key: "r32", label: "Sextondelsfinal", matches: k.r32, future: false },
    { key: "r16", label: "Åttondelsfinal", matches: k.r16, future: true },
    { key: "qf", label: "Kvartsfinal", matches: k.qf, future: true },
    { key: "sf", label: "Semifinal", matches: k.sf, future: true },
    { key: "third", label: "Bronsmatch", matches: k.third, future: false },
    { key: "final", label: "Final", matches: k.final, future: false },
  ];
}
