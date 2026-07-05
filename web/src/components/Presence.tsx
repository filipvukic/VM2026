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
        .poke-toasts{ position:fixed; top:calc(12px + env(safe-area-inset-top)); left:0; right:0; z-index:500; display:flex; flex-direction:column; align-items:center; gap:8px; pointer-events:none; }
        .poke-toast{ pointer-events:auto; display:inline-flex; align-items:center; gap:10px; padding:11px 16px; border-radius:var(--r-pill); font-size:13.5px; font-weight:700; color:var(--ink);
          background:linear-gradient(135deg, color-mix(in srgb,var(--cool) 22%, var(--surface-2)), var(--surface-2)); border:1px solid var(--line-2); box-shadow:var(--shadow-lift); animation:pokeIn .3s cubic-bezier(.2,.7,.2,1); }
        @keyframes pokeIn{ from{ transform:translateY(-14px); opacity:0;} to{ transform:none; opacity:1;} }
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

function PokeToasts({ incoming }: { incoming: { from: string; ts: number }[] }) {
  const dismiss = usePresence((s) => s.dismissPoke);
  useEffect(() => {
    if (!incoming.length) return;
    const t = setTimeout(() => dismiss(0), 5000);
    return () => clearTimeout(t);
  }, [incoming, dismiss]);
  if (!incoming.length) return null;
  return (
    <div className="poke-toasts">
      {incoming.map((p, i) => (
        <div key={`${p.from}-${p.ts}-${i}`} className="poke-toast" onClick={() => dismiss(i)}>
          <span style={{ fontSize: 20 }}>👉</span>
          <span><b>{p.from}</b> puffade dig!</span>
        </div>
      ))}
    </div>
  );
}
