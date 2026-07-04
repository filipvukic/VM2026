import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useData } from "../state/dataset";
import { useSheets } from "../state/sheets";
import { useNow } from "../state/useNow";
import { useKoBets, koFid, type Tip } from "../state/koBets";
import { Flag } from "../lib/flags";
import { svDayMonth } from "../lib/format";
import { reg90Score } from "../lib/reg90";
import type { Dataset, Match } from "../data/types";

// Knockout tipping modal. Log in with a personal code, then set a score for every drawn
// match that hasn't kicked off (locked ones show read-only). Opened from anywhere via
// the store's sheetOpen flag (home reminder + bracket CTA).
export function KoBetSheet() {
  const ds = useData();
  const openMatch = useSheets((s) => s.openMatch);
  const { name, bets, open: openIds, status, error, login, save, sheetOpen, setSheet } = useKoBets();
  const [draft, setDraft] = useState<Record<string, Tip>>({});
  const [flash, setFlash] = useState(false);
  // Tick while the sheet is open so a match locks the instant its kickoff passes.
  const now = useNow(sheetOpen ? 20_000 : 0);

  useEffect(() => { setDraft({ ...bets }); }, [bets]);
  const rounds = useMemo(() => koRounds(ds), [ds]);

  if (!sheetOpen) return null;
  const close = () => setSheet(false);
  const loggedIn = !!name;

  // AIRTIGHT: a match is editable only if the worker says it's open AND its own kickoff
  // is still in the future — so an open sheet locks each match exactly at its kickoff.
  const isEditable = (m: Match) => openIds.has(koFid(m)) && (m.kickoff?.getTime() ?? Infinity) > now;
  const openList = rounds.flatMap((r) => r.matches).filter(isEditable);
  const editableIds = new Set(openList.map(koFid));
  const tipped = openList.filter((m) => (draft[koFid(m)] || bets[koFid(m)])).length;
  const total = openList.length;
  // Open the full match view (closes this modal — a match sheet renders below it).
  const showMatch = (m: Match) => { setSheet(false); openMatch(m.id); };

  const setTip = (id: string, side: 0 | 1, val: number) =>
    setDraft((d) => {
      const cur = d[id] || bets[id] || [0, 0];
      return { ...d, [id]: side === 0 ? [val, cur[1]] : [cur[0], val] };
    });
  const onSave = async () => {
    const payload: Record<string, Tip> = {};
    for (const id of editableIds) if (draft[id]) payload[id] = draft[id];
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
          {loggedIn && <button className="kob-logout-top" onClick={() => useKoBets.getState().logout()}>Logga ut</button>}
          <button className="kob-x" onClick={close} aria-label="Stäng">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" /></svg>
          </button>
        </div>

        {!loggedIn ? (
          <div className="kob-login">
            <div className="kob-login-ic">🔑</div>
            <div className="kob-login-h">Logga in för att tippa</div>
            <p className="kob-login-p">Skriv in din personliga 6-teckens kod — du loggas in automatiskt. Varje match går att tippa så fort båda lagen är klara, och du kan ändra ända tills just den matchen startar.</p>
            <CodeBoxes onComplete={(code) => login(code)} disabled={status === "loading"} error={!!error} />
            <div className="kob-login-status">
              {status === "loading" ? "Loggar in…" : error ? <span className="kob-err">{error}</span> : "6 tecken"}
            </div>
          </div>
        ) : (
          <>
            <div className="kob-body">
              <div className="kob-rule">
                ⏱️ Tippa resultatet efter <b>90 min (ordinarie tid)</b>. Det kan bli <b>oavgjort</b> även i slutspelet — matchen avgörs sen i förlängning eller på straffar, men ditt tips gäller 90-minutersresultatet.
              </div>
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
                // matches in this round not yet drawn — they'll open as earlier rounds finish
                const pending = r.matches.filter((m) => !m.home || !m.away).length;
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
                      const editable = isEditable(m);
                      const home = m.home ? ds.teams[m.home] : null;
                      const away = m.away ? ds.teams[m.away] : null;
                      const t = draft[id] || bets[id] || null;
                      const played = m.status === "played" && m.ga != null && m.gb != null;
                      const reg = played ? reg90Score(m) : null; // 90-min result = what's scored
                      return (
                        // Tap anywhere except the steppers to open the full match view.
                        <div key={id} className={`kob-match${editable ? " edit" : ""}`} onClick={() => showMatch(m)} role="button">
                          <div className="kob-tm">
                            <Flag iso={home?.iso} code={m.home} size={20} />
                            <span className="kob-nm">{home?.name || "?"}</span>
                            {editable
                              ? <Stepper value={t ? t[0] : 0} onChange={(v) => setTip(id, 0, v)} />
                              : <span className="kob-sc">{t ? t[0] : "–"}</span>}
                          </div>
                          <div className="kob-tm">
                            <Flag iso={away?.iso} code={m.away} size={20} />
                            <span className="kob-nm">{away?.name || "?"}</span>
                            {editable
                              ? <Stepper value={t ? t[1] : 0} onChange={(v) => setTip(id, 1, v)} />
                              : <span className="kob-sc">{t ? t[1] : "–"}</span>}
                          </div>
                          <div className="kob-mfoot">
                            {editable
                              ? <span>Stänger vid avspark · {svDayMonth(m.kickoff)}</span>
                              : played
                                ? <span>Spelad{reg ? ` · 90 min ${reg[0]}–${reg[1]}` : ""}</span>
                                : <span>Låst</span>}
                            <span className="kob-open">Visa match ›</span>
                          </div>
                        </div>
                      );
                    })}
                    {pending > 0 && (
                      <div className="kob-pending">
                        {pending === 1 ? "1 match till lottas" : `${pending} matcher till lottas`} när föregående omgång är klar
                      </div>
                    )}
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
        .kob-logout-top{ flex:0 0 auto; font-size:11.5px; font-weight:800; color:var(--ink-2); padding:7px 12px; border-radius:var(--r-pill); background:var(--surface-3); border:1px solid var(--line-2); white-space:nowrap; }
        .kob-logout-top:active{ transform:scale(.96); }

        .kob-login{ padding:26px 22px 28px; text-align:center; }
        .kob-login-ic{ font-size:34px; }
        .kob-login-h{ font-family:var(--font-display); font-weight:800; font-size:19px; margin-top:6px; }
        .kob-login-p{ color:var(--ink-3); font-size:13px; line-height:1.55; margin:8px auto 16px; max-width:330px; }
        .kob-boxes{ display:flex; gap:8px; justify-content:center; margin:4px auto 0; }
        .kob-box{ width:44px; height:54px; text-align:center; background:var(--surface); border:1.5px solid var(--line-2);
          border-radius:13px; font-family:var(--font-display); font-weight:800; font-size:25px; color:var(--ink); text-transform:uppercase;
          caret-color:var(--cool); transition:border-color .15s, background .15s, transform .1s; }
        .kob-box:focus{ outline:none; border-color:var(--cool); background:color-mix(in srgb, var(--cool) 9%, var(--surface)); transform:translateY(-1px); }
        .kob-boxes.err .kob-box{ border-color:color-mix(in srgb, var(--loss) 55%, var(--line-2)); }
        @media(max-width:380px){ .kob-box{ width:40px; height:50px; font-size:22px; } .kob-boxes{ gap:6px; } }
        .kob-login-status{ margin-top:14px; font-size:12.5px; font-weight:700; color:var(--ink-3); min-height:18px; }
        .kob-btn{ background:var(--grad-soft); color:#fff; font-weight:800; font-size:14px; padding:12px 18px; border-radius:var(--r-md); white-space:nowrap; transition:transform .12s, opacity .15s; }
        .kob-btn:active{ transform:scale(.96); } .kob-btn:disabled{ opacity:.45; }
        .kob-err{ color:var(--loss); font-size:12.5px; font-weight:700; margin-top:12px; }

        .kob-body{ overflow-y:auto; padding:14px 16px 16px; display:grid; gap:18px; }
        .kob-rule{ font-size:12px; line-height:1.5; color:var(--ink-3); background:color-mix(in srgb, var(--cool) 8%, var(--surface));
          border:1px solid color-mix(in srgb, var(--cool) 26%, var(--line)); border-radius:var(--r-md); padding:10px 12px; }
        .kob-rule b{ color:var(--ink-2); }
        .kob-empty{ text-align:center; color:var(--ink-3); font-size:13.5px; line-height:1.5; padding:26px 10px; background:var(--surface); border:1px solid var(--line); border-radius:var(--r-lg); }
        .kob-round-h{ display:flex; align-items:center; gap:8px; margin-bottom:6px; }
        .kob-round-h span:first-child{ font-family:var(--font-display); text-transform:uppercase; letter-spacing:.06em; font-weight:800; font-size:11px; color:var(--ink-3); }
        .kob-round-tag{ font-size:8.5px; font-weight:900; letter-spacing:.05em; text-transform:uppercase; color:var(--win); background:color-mix(in srgb, var(--win) 16%, transparent); padding:1px 6px; border-radius:var(--r-pill); }
        .kob-pending{ font-size:11.5px; color:var(--ink-3); padding:6px 2px; }
        /* Vertical match card: each team gets a full row so the whole country name shows. */
        .kob-match{ padding:10px 12px; border-radius:var(--r-md); background:var(--surface); border:1px solid var(--line); margin-bottom:8px; cursor:pointer; transition:border-color .12s; }
        .kob-match:active{ border-color:var(--line-2); }
        .kob-match.edit{ border-color:color-mix(in srgb, var(--cool) 32%, var(--line)); background:color-mix(in srgb, var(--cool) 6%, var(--surface)); }
        .kob-tm{ display:flex; align-items:center; gap:10px; min-width:0; padding:3px 0; }
        .kob-tm + .kob-tm{ margin-top:2px; }
        .kob-nm{ flex:1; min-width:0; font-size:14px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .kob-sc{ flex:0 0 auto; min-width:34px; text-align:center; font-family:var(--font-display); font-weight:800; font-size:18px; font-variant-numeric:tabular-nums; }
        .kob-mfoot{ display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:8px; padding-top:7px; border-top:1px dashed var(--line); font-size:9.5px; font-weight:700; letter-spacing:.03em; color:var(--ink-3); text-transform:uppercase; }
        .kob-open{ flex:0 0 auto; color:var(--cool); font-weight:800; }
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
  // stopPropagation so tapping +/- edits the score without opening the match view.
  return (
    <div className="kob-step" onClick={(e) => e.stopPropagation()}>
      <button type="button" aria-label="minska" onClick={() => onChange(Math.max(0, value - 1))}>−</button>
      <span className="v">{value}</span>
      <button type="button" aria-label="öka" onClick={() => onChange(Math.min(20, value + 1))}>+</button>
    </div>
  );
}

// Six single-character boxes for the login code: auto-advances as you type, accepts a
// paste, and logs in automatically the moment all six are filled (no submit button).
function CodeBoxes({ onComplete, disabled, error }: { onComplete: (code: string) => void; disabled: boolean; error: boolean }) {
  const [vals, setVals] = useState<string[]>(["", "", "", "", "", ""]);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const code = vals.join("");
  const fired = useRef("");

  useEffect(() => { refs.current[0]?.focus(); }, []);
  useEffect(() => {
    if (code.length === 6 && fired.current !== code) { fired.current = code; onComplete(code); }
    if (code.length < 6) fired.current = "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const setAt = (i: number, raw: string) => {
    const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
    setVals((p) => {
      const n = [...p];
      if (clean === "") { n[i] = ""; return n; }
      for (let k = 0; k < clean.length && i + k < 6; k++) n[i + k] = clean[k];
      return n;
    });
    if (clean) setTimeout(() => refs.current[Math.min(i + clean.length, 5)]?.focus(), 0);
  };
  const onKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !vals[i] && i > 0) {
      refs.current[i - 1]?.focus();
      setVals((p) => { const n = [...p]; n[i - 1] = ""; return n; });
    } else if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
    else if (e.key === "ArrowRight" && i < 5) refs.current[i + 1]?.focus();
  };

  return (
    <div className={`kob-boxes${error ? " err" : ""}`}>
      {vals.map((v, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          className="kob-box"
          value={v}
          onChange={(e) => setAt(i, e.target.value)}
          onKeyDown={(e) => onKey(i, e)}
          onFocus={(e) => e.target.select()}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          aria-label={`Tecken ${i + 1} av 6`}
        />
      ))}
    </div>
  );
}

function koRounds(ds: Dataset): { key: string; label: string; matches: Match[]; future: boolean }[] {
  const k = ds.knockout;
  // Slutspelstips börjar i åttondelsfinalen — sextondelsfinalen var bara för test.
  return [
    { key: "r16", label: "Åttondelsfinal", matches: k.r16, future: true },
    { key: "qf", label: "Kvartsfinal", matches: k.qf, future: true },
    { key: "sf", label: "Semifinal", matches: k.sf, future: true },
    { key: "third", label: "Bronsmatch", matches: k.third, future: false },
    { key: "final", label: "Final", matches: k.final, future: false },
  ];
}
