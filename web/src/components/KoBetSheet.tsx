import { useEffect, useMemo, useState } from "react";
import { useData } from "../state/dataset";
import { useKoBets, koFid, type Tip } from "../state/koBets";
import { Flag } from "../lib/flags";
import { svDayMonth } from "../lib/format";
import type { Dataset, Match } from "../data/types";

// Knockout tipping modal. Log in with a personal code, then set a score for every drawn
// match that hasn't kicked off (locked ones show read-only). Opened from anywhere via
// the store's sheetOpen flag (home reminder + bracket CTA).
export function KoBetSheet() {
  const ds = useData();
  const { name, bets, open: openIds, status, error, login, save, sheetOpen, setSheet } = useKoBets();
  const [codeInput, setCodeInput] = useState("");
  const [draft, setDraft] = useState<Record<string, Tip>>({});
  const [flash, setFlash] = useState(false);

  useEffect(() => { setDraft({ ...bets }); }, [bets]);
  const rounds = useMemo(() => koRounds(ds), [ds]);

  if (!sheetOpen) return null;
  const close = () => setSheet(false);
  const loggedIn = !!name;

  const openList = rounds.flatMap((r) => r.matches).filter((m) => openIds.has(koFid(m)));
  const tipped = openList.filter((m) => (draft[koFid(m)] || bets[koFid(m)])).length;
  const total = openList.length;

  const setTip = (id: string, side: 0 | 1, val: number) =>
    setDraft((d) => {
      const cur = d[id] || bets[id] || [0, 0];
      return { ...d, [id]: side === 0 ? [val, cur[1]] : [cur[0], val] };
    });
  const onSave = async () => {
    const payload: Record<string, Tip> = {};
    for (const id of openIds) if (draft[id]) payload[id] = draft[id];
    if (await save(payload)) { setFlash(true); setTimeout(() => setFlash(false), 2200); }
  };

  return (
    <div className="kob-root" role="dialog" aria-modal="true">
      <div className="kob-dim" onClick={close} />
      <div className="kob-panel">
        <div className="kob-head">
          <div style={{ minWidth: 0 }}>
            <div className="kob-title">🏆 Slutspelstips</div>
            {loggedIn && <div className="kob-sub">{name} · <b style={{ color: tipped === total && total ? "var(--win)" : "var(--ink-2)" }}>{tipped}/{total}</b> tippade</div>}
          </div>
          <button className="kob-x" onClick={close} aria-label="Stäng">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" /></svg>
          </button>
        </div>

        {!loggedIn ? (
          <div className="kob-login">
            <div className="kob-login-ic">🔑</div>
            <div className="kob-login-h">Logga in för att tippa</div>
            <p className="kob-login-p">Ange din personliga kod. Du sätter resultat på varje lottad match och kan ändra ända tills matchen startar.</p>
            <form onSubmit={async (e) => { e.preventDefault(); if (await login(codeInput)) setCodeInput(""); }} className="kob-login-form">
              <input className="kob-code" value={codeInput} onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                placeholder="DIN KOD" autoCapitalize="characters" autoComplete="off" maxLength={6} aria-label="Inloggningskod" />
              <button className="kob-btn" type="submit" disabled={status === "loading" || codeInput.trim().length < 4}>
                {status === "loading" ? "…" : "Logga in"}
              </button>
            </form>
            {error && <div className="kob-err">{error}</div>}
          </div>
        ) : (
          <>
            <div className="kob-body">
              {total === 0 && (
                <div className="kob-empty">
                  <div style={{ fontSize: 26, marginBottom: 6 }}>⏳</div>
                  Inga matcher att tippa just nu.<br />Så fort nästa match är lottad dyker den upp här.
                </div>
              )}
              {rounds.map((r) => {
                // only matches you can still act on — drawn + not already played (played
                // ones live in the bracket; here they'd just be clutter you can't tip)
                const drawn = r.matches.filter((m) => m.home && m.away && m.status !== "played");
                const anyOpen = r.matches.some((m) => openIds.has(koFid(m)));
                if (!drawn.length) {
                  return r.future ? (
                    <div key={r.key} className="kob-round">
                      <div className="kob-round-h"><span>{r.label}</span></div>
                      <div className="kob-pending">Lottas när föregående omgång är klar</div>
                    </div>
                  ) : null;
                }
                return (
                  <div key={r.key} className="kob-round">
                    <div className="kob-round-h"><span>{r.label}</span>{anyOpen && <span className="kob-round-tag">öppen</span>}</div>
                    {drawn.map((m) => {
                      const id = koFid(m);
                      const editable = openIds.has(id);
                      const home = m.home ? ds.teams[m.home] : null;
                      const away = m.away ? ds.teams[m.away] : null;
                      const t = draft[id] || bets[id] || null;
                      const played = m.status === "played" && m.ga != null && m.gb != null;
                      return (
                        <div key={id} className={`kob-row${editable ? " edit" : ""}`}>
                          <div className="kob-team h">
                            <span className="kob-nm">{home?.name || "?"}</span>
                            <Flag iso={home?.iso} code={m.home} size={18} />
                          </div>
                          {editable ? (
                            <div className="kob-edit">
                              <Stepper value={t ? t[0] : 0} onChange={(v) => setTip(id, 0, v)} />
                              <span className="kob-dash">–</span>
                              <Stepper value={t ? t[1] : 0} onChange={(v) => setTip(id, 1, v)} />
                            </div>
                          ) : (
                            <div className="kob-locked">
                              <span className="kob-locked-tip">{t ? `${t[0]}–${t[1]}` : "–"}</span>
                              {played && <span className="kob-locked-res">facit {m.ga}–{m.gb}</span>}
                            </div>
                          )}
                          <div className="kob-team a">
                            <Flag iso={away?.iso} code={m.away} size={18} />
                            <span className="kob-nm">{away?.name || "?"}</span>
                          </div>
                          <div className="kob-meta">{editable ? `Stänger vid avspark · ${svDayMonth(m.kickoff)}` : played ? "spelad" : "låst"}</div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
              {error && <div className="kob-err" style={{ margin: "4px 4px 0" }}>{error}</div>}
            </div>
            <div className="kob-foot">
              <button className="kob-logout" onClick={() => useKoBets.getState().logout()}>Logga ut</button>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {flash && <span className="kob-saved">Sparat ✓</span>}
                <button className="kob-btn" onClick={onSave} disabled={status === "saving" || total === 0}>
                  {status === "saving" ? "Sparar…" : "Spara tips"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <style>{`
        .kob-root{ position:fixed; inset:0; z-index:400; display:flex; align-items:flex-end; justify-content:center; }
        @media(min-width:560px){ .kob-root{ align-items:center; padding:16px; } }
        .kob-dim{ position:absolute; inset:0; background:rgba(4,2,10,.62); backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px); animation:kobDim .25s ease; }
        @keyframes kobDim{ from{ opacity:0; } to{ opacity:1; } }
        .kob-panel{ position:relative; width:100%; max-width:540px; max-height:92dvh; display:flex; flex-direction:column;
          background:linear-gradient(180deg, var(--surface-2), var(--bg-2)); border:1px solid var(--line-2);
          border-radius:var(--r-xl) var(--r-xl) 0 0; box-shadow:var(--shadow-lift); animation:kobIn .3s cubic-bezier(.2,.7,.2,1); overflow:hidden; }
        @media(min-width:560px){ .kob-panel{ border-radius:var(--r-xl); } }
        @keyframes kobIn{ from{ transform:translateY(24px); opacity:.5; } to{ transform:none; opacity:1; } }
        .kob-head{ display:flex; align-items:center; justify-content:space-between; gap:10px; padding:16px 18px 13px;
          border-bottom:1px solid var(--line); background:linear-gradient(135deg, color-mix(in srgb, var(--cool) 14%, transparent), transparent); }
        .kob-title{ font-family:var(--font-display); font-weight:800; font-size:19px; white-space:nowrap; }
        .kob-sub{ font-size:12px; font-weight:700; color:var(--ink-3); margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .kob-x{ width:34px; height:34px; flex:0 0 auto; display:grid; place-items:center; border-radius:50%; color:var(--ink-2); background:var(--surface-3); }

        .kob-login{ padding:26px 22px 28px; text-align:center; }
        .kob-login-ic{ font-size:34px; }
        .kob-login-h{ font-family:var(--font-display); font-weight:800; font-size:19px; margin-top:6px; }
        .kob-login-p{ color:var(--ink-3); font-size:13px; line-height:1.55; margin:8px auto 16px; max-width:330px; }
        .kob-login-form{ display:flex; gap:8px; max-width:340px; margin:0 auto; }
        .kob-code{ flex:1; min-width:0; background:var(--surface); border:1px solid var(--line-2); border-radius:var(--r-md);
          padding:12px 14px; font-family:var(--font-display); font-weight:800; font-size:19px; letter-spacing:.2em; text-align:center; color:var(--ink); text-transform:uppercase; }
        .kob-code:focus{ border-color:var(--cool); outline:none; }
        .kob-btn{ background:var(--grad-soft); color:#fff; font-weight:800; font-size:14px; padding:12px 18px; border-radius:var(--r-md); white-space:nowrap; transition:transform .12s, opacity .15s; }
        .kob-btn:active{ transform:scale(.96); } .kob-btn:disabled{ opacity:.45; }
        .kob-err{ color:var(--loss); font-size:12.5px; font-weight:700; margin-top:12px; }

        .kob-body{ overflow-y:auto; padding:14px 16px 16px; display:grid; gap:18px; }
        .kob-empty{ text-align:center; color:var(--ink-3); font-size:13.5px; line-height:1.5; padding:26px 10px; background:var(--surface); border:1px solid var(--line); border-radius:var(--r-lg); }
        .kob-round-h{ display:flex; align-items:center; gap:8px; margin-bottom:6px; }
        .kob-round-h span:first-child{ font-family:var(--font-display); text-transform:uppercase; letter-spacing:.06em; font-weight:800; font-size:11px; color:var(--ink-3); }
        .kob-round-tag{ font-size:8.5px; font-weight:900; letter-spacing:.05em; text-transform:uppercase; color:var(--win); background:color-mix(in srgb, var(--win) 16%, transparent); padding:1px 6px; border-radius:var(--r-pill); }
        .kob-pending{ font-size:12px; color:var(--ink-3); padding:6px 2px; }
        .kob-row{ display:grid; grid-template-columns:minmax(0,1fr) auto minmax(0,1fr); align-items:center; gap:8px;
          padding:9px 8px; border-radius:var(--r-md); background:var(--surface); border:1px solid var(--line); margin-bottom:7px; }
        .kob-row.edit{ border-color:color-mix(in srgb, var(--cool) 32%, var(--line)); background:color-mix(in srgb, var(--cool) 6%, var(--surface)); }
        .kob-team{ display:flex; align-items:center; gap:7px; min-width:0; }
        .kob-team.h{ justify-content:flex-end; }
        .kob-nm{ font-size:13px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .kob-edit{ display:flex; align-items:center; gap:7px; }
        .kob-dash{ color:var(--ink-3); font-weight:800; font-size:15px; }
        .kob-locked{ display:flex; flex-direction:column; align-items:center; min-width:54px; }
        .kob-locked-tip{ font-family:var(--font-display); font-weight:800; font-size:16px; font-variant-numeric:tabular-nums; }
        .kob-locked-res{ font-size:9px; font-weight:700; color:var(--ink-3); }
        .kob-meta{ grid-column:1 / -1; text-align:center; font-size:9px; font-weight:700; letter-spacing:.02em; color:var(--ink-3); margin-top:2px; text-transform:uppercase; }
        .kob-step{ display:flex; align-items:center; background:var(--surface-3); border:1px solid var(--line-2); border-radius:9px; overflow:hidden; }
        .kob-step button{ width:26px; height:34px; display:grid; place-items:center; color:var(--ink-2); font-size:17px; font-weight:800; line-height:1; transition:background .12s; }
        .kob-step button:active{ background:var(--cool); color:#fff; }
        .kob-step .v{ width:24px; text-align:center; font-family:var(--font-display); font-weight:800; font-size:18px; font-variant-numeric:tabular-nums; }

        .kob-foot{ display:flex; align-items:center; justify-content:space-between; padding:12px 16px calc(12px + env(safe-area-inset-bottom));
          border-top:1px solid var(--line); background:var(--surface-2); }
        .kob-logout{ color:var(--ink-3); font-size:12.5px; font-weight:700; }
        .kob-saved{ color:var(--win); font-size:13px; font-weight:800; animation:kobDim .2s ease; }
      `}</style>
    </div>
  );
}

function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="kob-step">
      <button type="button" aria-label="minska" onClick={() => onChange(Math.max(0, value - 1))}>−</button>
      <span className="v">{value}</span>
      <button type="button" aria-label="öka" onClick={() => onChange(Math.min(20, value + 1))}>+</button>
    </div>
  );
}

function koRounds(ds: Dataset): { key: string; label: string; matches: Match[]; future: boolean }[] {
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
