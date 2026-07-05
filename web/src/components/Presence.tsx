import { useEffect, useState } from "react";
import { usePresence, POKE_COOLDOWN_MS } from "../state/presence";
import { useKoBets } from "../state/koBets";
import { useData } from "../state/dataset";
import { useNow } from "../state/useNow";
import { PokeFx, previewPokeFx } from "./PokeFx";

// In-app presence: a small bottom-left pill showing which pool players are live right now
// (INCLUDING you), tap to expand + "poke" (puffa) them (once per minute each). Plus a
// toast when someone pokes you. Always shown once you're logged in (presence needs your
// KO name).
export function Presence() {
  const me = useKoBets((s) => s.name);
  const online = usePresence((s) => s.online);
  const incoming = usePresence((s) => s.incoming);
  return (
    <>
      {me && <OnlineBar me={me} online={online} />}
      <PokeToasts incoming={incoming} />
      <PokeFx />
      <style>{`
        .pres-bar{ position:fixed; left:12px; z-index:90; bottom:calc(74px + env(safe-area-inset-bottom)); }
        @media(min-width:920px){ .pres-bar{ bottom:16px; } }
        .pres-live{ width:8px; height:8px; border-radius:50%; background:var(--win); box-shadow:0 0 0 0 color-mix(in srgb,var(--win) 70%,transparent); animation:presPulse 2s infinite; flex:0 0 auto; }
        @keyframes presPulse{ 0%{ box-shadow:0 0 0 0 color-mix(in srgb,var(--win) 60%,transparent);} 70%{ box-shadow:0 0 0 7px transparent;} 100%{ box-shadow:0 0 0 0 transparent;} }
        .pres-pill{ display:inline-flex; align-items:center; gap:8px; padding:8px 13px; border-radius:var(--r-pill); font-size:12.5px; font-weight:800; color:var(--ink);
          background:color-mix(in srgb, var(--surface-2) 92%, transparent); border:1px solid var(--line-2); box-shadow:var(--shadow-lift); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); }
        .pres-pill:active{ transform:scale(.96); }
        .pres-dots{ display:inline-flex; }
        .pres-dot{ width:15px; height:15px; border-radius:50%; border:2px solid var(--surface-2); margin-right:-6px; }
        .pres-panel{ width:min(84vw,270px); background:linear-gradient(180deg,var(--surface-2),var(--bg-2)); border:1px solid var(--line-2); border-radius:var(--r-lg); box-shadow:var(--shadow-lift); overflow:hidden; animation:presIn .2s ease; }
        @keyframes presIn{ from{ transform:translateY(8px); opacity:0;} to{ transform:none; opacity:1;} }
        .pres-head{ display:flex; align-items:center; gap:8px; padding:11px 13px; font-size:12.5px; font-weight:800; border-bottom:1px solid var(--line); }
        .pres-close{ margin-left:auto; color:var(--ink-3); font-size:13px; font-weight:800; width:22px; height:22px; }
        .pres-list{ padding:6px; display:grid; gap:3px; max-height:46vh; overflow-y:auto; }
        .pres-row{ display:flex; align-items:center; gap:9px; padding:5px 6px; border-radius:9px; }
        .pres-ava{ width:26px; height:26px; border-radius:50%; display:grid; place-items:center; color:#fff; font-weight:800; font-size:12px; flex:0 0 auto; }
        .pres-nm{ flex:1; min-width:0; font-weight:700; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .pres-poke{ flex:0 0 auto; font-size:11.5px; font-weight:800; padding:6px 10px; border-radius:var(--r-pill); background:var(--grad-soft); color:#fff; white-space:nowrap; transition:transform .1s, opacity .15s; }
        .pres-poke:active{ transform:scale(.94); } .pres-poke:disabled{ opacity:.5; background:var(--surface-3); color:var(--ink-3); }
        .pres-you{ flex:0 0 auto; font-size:10.5px; font-weight:800; letter-spacing:.04em; text-transform:uppercase; color:var(--ink-3); background:var(--surface-3); padding:5px 9px; border-radius:var(--r-pill); }
        .pres-test{ background:var(--surface-3); color:var(--ink-2); }
        /* z above the prank overlay (.pfx is 9998) so the "who" is visible ON TOP of the chaos. */
        .poke-toasts{ position:fixed; top:calc(14px + env(safe-area-inset-top)); left:0; right:0; z-index:10000; display:flex; flex-direction:column; align-items:center; gap:8px; pointer-events:none; padding:0 12px; }
        .poke-toast{ pointer-events:auto; display:inline-flex; align-items:center; gap:11px; padding:12px 18px 12px 12px; border-radius:var(--r-pill); font-size:15px; font-weight:700; color:var(--ink); max-width:92vw;
          background:var(--surface-2); border:1px solid var(--line-2); box-shadow:0 12px 32px rgba(0,0,0,.4), 0 0 0 3px color-mix(in srgb,var(--cool) 32%, transparent);
          animation:pokeIn .5s cubic-bezier(.2,1.25,.3,1) both; }
        @keyframes pokeIn{ 0%{ transform:translateY(-34px) scale(.9); opacity:0;} 62%{ transform:translateY(3px) scale(1.02); opacity:1;} 100%{ transform:none; opacity:1;} }
        .poke-toast.leaving{ animation:pokeOut .42s cubic-bezier(.4,0,.55,1) both; }
        @keyframes pokeOut{ from{ transform:none; opacity:1;} to{ transform:translateY(-40px) scale(.9); opacity:0;} }
        .poke-ava{ width:30px; height:30px; border-radius:50%; display:grid; place-items:center; color:#fff; font-weight:800; font-size:14px; flex:0 0 auto; box-shadow:0 0 0 2px var(--surface-2); }
        .poke-txt{ white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .poke-txt b{ font-weight:900; }
      `}</style>
    </>
  );
}

const norm = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

function OnlineBar({ me, online }: { me: string; online: string[] }) {
  const [open, setOpen] = useState(false);
  const ds = useData();
  const poke = usePresence((s) => s.poke);
  const pokedAt = usePresence((s) => s.pokedAt);
  const [busy, setBusy] = useState<string | null>(null);
  const now = useNow(open ? 2000 : 0); // tick while open so a cooldown re-enables the button
  const color = (n: string) => ds.players.find((p) => p.name === n)?.color || "var(--cool)";
  const same = (a: string, b: string) => norm(a) === norm(b);
  // Always include yourself, first — even before the first heartbeat lands.
  const names = [me, ...online.filter((n) => !same(n, me))];
  const onCooldown = (n: string) => (pokedAt[n] || 0) + POKE_COOLDOWN_MS > now;
  const onPoke = async (n: string) => { setBusy(n); await poke(n); setBusy(null); };
  return (
    <div className="pres-bar">
      {!open ? (
        <button className="pres-pill" onClick={() => setOpen(true)}>
          <span className="pres-dots">{names.slice(0, 3).map((n) => <span key={n} className="pres-dot" style={{ background: color(n) }} />)}</span>
          <span className="pres-live" /> {names.length} inne nu
        </button>
      ) : (
        <div className="pres-panel">
          <div className="pres-head"><span className="pres-live" /> {names.length} inne nu<button className="pres-close" onClick={() => setOpen(false)} aria-label="Stäng">✕</button></div>
          <div className="pres-list">
            {names.map((n) => {
              const self = same(n, me);
              const cooling = onCooldown(n);
              return (
                <div key={n} className="pres-row">
                  <span className="pres-ava" style={{ background: color(n) }}>{n.slice(0, 1).toUpperCase()}</span>
                  <span className="pres-nm">{n}{self ? " · du" : ""}</span>
                  {self ? (
                    <button className="pres-poke pres-test" onClick={() => previewPokeFx()} title="Testa en slumpad puff på dig själv">🎲 Testa</button>
                  ) : (
                    <button className="pres-poke" disabled={cooling || busy === n} onClick={() => onPoke(n)}>
                      {busy === n ? "…" : cooling ? "Puffad ✓" : "👉 Puffa"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

type Poke = { from: string; ts: number; self?: boolean };

function PokeToasts({ incoming }: { incoming: Poke[] }) {
  const ds = useData();
  const color = (n: string) => ds.players.find((p) => p.name === n)?.color || "var(--cool)";
  if (!incoming.length) return null;
  return (
    <div className="poke-toasts">
      {/* keyed by identity so poll re-renders don't remount → each toast's own timer keeps running */}
      {incoming.map((p) => <PokeToast key={`${p.from}-${p.ts}`} p={p} color={color(p.from)} />)}
    </div>
  );
}

// Each toast owns its dismiss timer (set once on mount) so the 7s presence poll can't reset it —
// that was why the banner never went away. A self-test looks identical to a real poke.
function PokeToast({ p, color }: { p: Poke; color: string }) {
  const dismiss = usePresence((s) => s.dismissPoke);
  const [leaving, setLeaving] = useState(false);
  // Slide in, rest ~6s, then play the slide-out and only THEN unmount (so the exit is smooth, not
  // an abrupt disappear).
  useEffect(() => {
    const t1 = window.setTimeout(() => setLeaving(true), 6000);
    const t2 = window.setTimeout(() => dismiss(p), 6000 + 430);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, [p, dismiss]);
  const close = () => { setLeaving(true); window.setTimeout(() => dismiss(p), 430); };
  return (
    <div className={`poke-toast${leaving ? " leaving" : ""}`} onClick={close}>
      <span className="poke-ava" style={{ background: color }}>{p.from.slice(0, 1).toUpperCase()}</span>
      <span className="poke-txt"><b>{p.from}</b> puffade dig! 👉</span>
    </div>
  );
}
