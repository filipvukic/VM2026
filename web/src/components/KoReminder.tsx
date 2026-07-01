import { useData } from "../state/dataset";
import { useKoBets, koOpenMatches, koFid } from "../state/koBets";
import { useNow } from "../state/useNow";

// Home-page reminder + entry point for the knockout tips. Gold + a clear CTA while a
// round is open and anything's untipped, a calm green "all set" once done, and a neutral
// "log in / opens soon" state while the knockout is still to come so the way in is always
// visible. Opens the betting modal directly. (This is the ONLY place to enter KO tips.)
export function KoReminder() {
  const ds = useData();
  const { name, bets, setSheet } = useKoBets();
  const now = useNow(60_000); // re-evaluate as matches kick off / new ones get drawn

  const openMatches = koOpenMatches(ds, now);
  const total = openMatches.length;
  // Any R16+ match still to be played → the knockout tips are relevant (even before a
  // round is fully drawn/open), so keep the entry point on the home page.
  const koPending = [ds.knockout.r16, ds.knockout.qf, ds.knockout.sf, ds.knockout.third, ds.knockout.final]
    .some((list) => list.some((m) => m._realId && m.status !== "played"));
  if (total === 0 && !koPending) return null; // knockout over (or not on the board yet)

  const tipped = name ? openMatches.filter((m) => bets[koFid(m)]).length : 0;
  const remaining = total - tipped;
  const allDone = total > 0 && !!name && remaining === 0;
  const state = total === 0 ? "pending" : allDone ? "done" : "open";

  const sub =
    total === 0
      ? name
        ? `Inloggad som ${name} · nästa omgång öppnar när den lottats`
        : "Logga in med din kod inför slutspelet"
      : !name
        ? `${total} ${total === 1 ? "match" : "matcher"} att tippa — logga in med din kod`
        : allDone
          ? `Alla ${total} tips inlagda · ändra när du vill`
          : `${remaining} av ${total} matcher otippade — fyll i innan avspark`;

  return (
    <button className={`kor ${state}`} onClick={() => setSheet(true)}>
      <span className="kor-ic">{allDone ? "✅" : "🏆"}</span>
      <span className="kor-txt">
        <b>Slutspelstips{state === "open" ? " är öppet" : ""}</b>
        <span className="kor-sub">{sub}</span>
      </span>
      {allDone ? <span className="kor-go">›</span> : <span className="kor-cta">{name ? (total === 0 ? "Visa" : "Tippa") : "Logga in"}</span>}
      <style>{`
        .kor{ display:flex; align-items:center; gap:12px; width:100%; text-align:left; padding:13px 14px; margin:6px 0 16px;
          border-radius:var(--r-lg); border:1px solid; transition:transform .12s; }
        .kor:active{ transform:scale(.99); }
        .kor.open{ border-color:color-mix(in srgb, var(--gold) 50%, var(--line-2));
          background:linear-gradient(120deg, color-mix(in srgb, var(--gold) 20%, var(--surface)), var(--surface) 70%);
          box-shadow:0 0 0 1px color-mix(in srgb, var(--gold) 22%, transparent), 0 6px 22px -12px color-mix(in srgb, var(--gold) 60%, transparent); }
        .kor.done{ border-color:color-mix(in srgb, var(--win) 32%, var(--line-2)); background:color-mix(in srgb, var(--win) 8%, var(--surface)); }
        .kor.pending{ border-color:color-mix(in srgb, var(--cool) 40%, var(--line-2));
          background:linear-gradient(120deg, color-mix(in srgb, var(--cool) 15%, var(--surface)), var(--surface) 72%); }
        .kor.pending .kor-cta{ background:var(--cool); color:#fff; }
        .kor-ic{ font-size:22px; flex:0 0 auto; }
        .kor-txt{ flex:1; min-width:0; display:flex; flex-direction:column; }
        .kor-txt b{ font-size:14.5px; }
        .kor-sub{ font-size:11.5px; font-weight:700; color:var(--ink-3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .kor-cta{ flex:0 0 auto; font-weight:800; font-size:13px; color:#0a0712; background:var(--gold); padding:8px 15px; border-radius:var(--r-pill); white-space:nowrap; }
        .kor.done .kor-go, .kor-go{ color:var(--ink-3); font-size:22px; font-weight:700; flex:0 0 auto; }
      `}</style>
    </button>
  );
}
