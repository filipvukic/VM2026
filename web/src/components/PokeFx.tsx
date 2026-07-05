import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { usePresence } from "../state/presence";
import { armPokeSound, playPokeSound } from "../lib/pokeSound";
import { buzz } from "../lib/haptics";

// Getting poked ("puffa") should feel like a PRANK — for ~2–7s a random effect hijacks your
// screen with sound + a buzz. One of ~10 disruptive effects is picked at random: rave with real
// music, cop lights + siren, the whole app flipping upside-down, a glitch/static takeover, colour
// invert, a fake cracked screen, a giant emoji swallowing the screen, a bug swarm, an earthquake,
// or a full spin-out. Overlays are pointer-events:none so nothing actually breaks; whole-page
// effects ride a <body> class that self-reverts. Only the RECIPIENT gets pranked.

const KINDS = ["disco", "police", "flip", "glitch", "invert", "crack", "takeover", "swarm", "quake", "spinout"] as const;
type Kind = (typeof KINDS)[number];

// Whole-page effects → a body class (the rest are overlay-only).
const BODY: Partial<Record<Kind, string>> = { flip: "pfx-flip", glitch: "pfx-glitch", invert: "pfx-invert", quake: "pfx-quake", spinout: "pfx-spinout" };
// How long each prank runs (ms). Disco/police linger — that's the annoying part.
const DUR: Record<Kind, number> = { disco: 6800, police: 4200, flip: 2500, glitch: 1600, invert: 2300, crack: 2600, takeover: 2300, swarm: 3400, quake: 1500, spinout: 1900 };

const TAKEOVER = ["🤡", "👁️", "👀", "😈", "🤪", "👽", "🙃", "🥴", "👺", "🐸"];
const SWARMERS = ["🐛", "🤡", "🕷️", "🪳", "🐜", "🦟", "👁️"];
const DANCERS = ["🕺", "💃", "🪩", "🥳", "🎉", "🦄"];

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
const cssVars = (o: Record<string, string | number>) => o as CSSProperties;

interface Fx { id: number; kind: Kind; from: string; emoji: string }

const randomFx = (from: string, id: number): Fx => ({ id, kind: pick(KINDS), from, emoji: pick(TAKEOVER) });

// Imperative trigger so the "🎲 Testa" button can preview a random prank on your own screen.
// Fires the prank in-gesture (reliable audio on iOS) AND raises the "who" banner via the store.
let fire: ((from: string) => void) | null = null;
export function previewPokeFx() {
  fire?.("Du");
  usePresence.getState().selfPokeBanner("Du");
}

export function PokeFx() {
  const incoming = usePresence((s) => s.incoming);
  const seen = useRef(0);
  const [fx, setFx] = useState<Fx | null>(null);

  const play = useCallback((from: string, id: number) => {
    const next = randomFx(from, id);
    setFx(next);
    buzz(next.kind === "quake" ? [0, 400] : [60, 50, 130, 50, 220]);
    playPokeSound(next.kind);
  }, []);

  // Fire for each NEW poke (highest unseen ts). `self` entries are 🎲-preview banners whose prank
  // already played in-gesture, so we just advance `seen` and let the banner show (no double prank).
  useEffect(() => {
    if (!incoming.length) return;
    const latest = incoming.reduce((m, p) => (p.ts > m.ts ? p : m), incoming[0]);
    if (latest.ts <= seen.current) return;
    seen.current = latest.ts;
    if (latest.self) return;
    play(latest.from, latest.ts);
  }, [incoming, play]);

  // Self-preview trigger + arm audio on the user's taps.
  useEffect(() => {
    fire = (from) => play(from, Date.now() + Math.random());
    const disarm = armPokeSound();
    return () => { fire = null; disarm(); };
  }, [play]);

  // Body-class effects + auto-clear. Disco/police keep buzzing for the whole run (extra annoying).
  useEffect(() => {
    if (!fx) return;
    const bodyClass = BODY[fx.kind];
    if (bodyClass) document.body.classList.add(bodyClass);
    let beat: number | undefined;
    if (fx.kind === "disco" || fx.kind === "police") beat = window.setInterval(() => buzz([0, 110]), 480);
    const t = window.setTimeout(() => setFx(null), DUR[fx.kind]);
    return () => {
      window.clearTimeout(t);
      if (beat) window.clearInterval(beat);
      if (bodyClass) document.body.classList.remove(bodyClass);
    };
  }, [fx]);

  return (
    <>
      {fx && <FxLayer fx={fx} />}
      <style>{PFX_CSS}</style>
    </>
  );
}

function FxLayer({ fx }: { fx: Fx }) {
  const body = useMemo(() => renderKind(fx), [fx.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="pfx" aria-hidden>{body}</div>;
}

function renderKind(fx: Fx) {
  switch (fx.kind) {
    case "disco":
      return (
        <>
          <div className="pfx-rave" />
          <div className="pfx-beam" />
          <div className="pfx-ball">🪩</div>
          {[[16, 70], [82, 66], [30, 22], [70, 26], [50, 84]].map(([x, y], i) => (
            <span key={i} className="pfx-dancer" style={cssVars({ left: `${x}vw`, top: `${y}vh`, animationDelay: `${i * 0.08}s` })}>{DANCERS[i % DANCERS.length]}</span>
          ))}
        </>
      );
    case "police":
      return (
        <>
          <div className="pfx-cop pfx-cop-l" />
          <div className="pfx-cop pfx-cop-r" />
          <div className="pfx-siren">🚨</div>
          <div className="pfx-busted">BUSTED av {fx.from} 🚓</div>
        </>
      );
    case "glitch":
      return (
        <>
          <div className="pfx-glitchbars" />
          <div className="pfx-noise-txt">S̸I̶G̷N̴A̷L̶ ̴L̸O̵S̷T</div>
        </>
      );
    case "invert":
      return <div className="pfx-err">⚠️</div>;
    case "quake":
      return Array.from({ length: 10 }, (_, i) => (
        <span key={i} className="pfx-boom" style={cssVars({ left: `${rnd(8, 92)}vw`, top: `${rnd(10, 86)}vh`, "--dl": `${rnd(0, 0.7)}s`, fontSize: `${rnd(60, 130)}px` })}>{pick(["💥", "🌟", "⚡"])}</span>
      ));
    case "crack":
      return <CrackGlass />;
    case "takeover":
      return <div className="pfx-take">{fx.emoji}</div>;
    case "swarm": {
      const bug = pick(SWARMERS);
      const n = 30;
      return Array.from({ length: n }, (_, i) => (
        <span key={i} className="pfx-crawl" style={cssVars({
          left: `${rnd(0, 100)}vw`, top: `${rnd(0, 100)}vh`,
          "--dx": `${rnd(-30, 30)}vw`, "--dy": `${rnd(-30, 30)}vh`,
          "--r0": `${rnd(0, 360)}deg`, "--r1": `${rnd(0, 720)}deg`,
          "--dur": `${rnd(1.4, 2.6)}s`, "--jit": `${rnd(0.1, 0.2)}s`,
          fontSize: `${rnd(34, 84)}px`,
        })}>{bug}</span>
      ));
    }
    default: // flip, spinout → the body animation is the whole effect
      return null;
  }
}

function CrackGlass() {
  const cracks = useMemo(() => {
    const ox = rnd(25, 75), oy = rnd(25, 75);
    const spokes = Array.from({ length: 11 }, () => {
      const a = rnd(0, Math.PI * 2), len = rnd(35, 90);
      return { x2: ox + Math.cos(a) * len, y2: oy + Math.sin(a) * len, a, len };
    });
    const branches = spokes.flatMap((s) => {
      const bx = ox + (s.x2 - ox) * rnd(0.4, 0.7), by = oy + (s.y2 - oy) * rnd(0.4, 0.7);
      const ba = s.a + rnd(-0.6, 0.6), bl = rnd(10, 26);
      return [{ x1: bx, y1: by, x2: bx + Math.cos(ba) * bl, y2: by + Math.sin(ba) * bl }];
    });
    const ring = Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2, r = rnd(6, 11);
      return { x: ox + Math.cos(a) * r, y: oy + Math.sin(a) * r };
    });
    return { ox, oy, spokes, branches, ring };
  }, []);
  const line = (x1: number, y1: number, x2: number, y2: number, k: string, w = 0.4) =>
    <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,.92)" strokeWidth={w} vectorEffect="non-scaling-stroke" strokeLinecap="round" />;
  return (
    <svg className="pfx-crack" viewBox="0 0 100 100" preserveAspectRatio="none">
      <polygon points={cracks.ring.map((p) => `${p.x},${p.y}`).join(" ")} fill="rgba(255,255,255,.14)" stroke="rgba(255,255,255,.9)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      {cracks.spokes.map((s, i) => line(cracks.ox, cracks.oy, s.x2, s.y2, `s${i}`, 0.6))}
      {cracks.branches.map((b, i) => line(b.x1, b.y1, b.x2, b.y2, `b${i}`))}
    </svg>
  );
}

const PFX_CSS = `
  .pfx{ position:fixed; inset:0; z-index:9998; pointer-events:none; overflow:hidden; }
  .pfx > span, .pfx > div, .pfx > svg{ position:absolute; will-change:transform,opacity; }

  /* ---- DISCO / rave (with music) ---- */
  .pfx-rave{ inset:0; mix-blend-mode:hard-light; animation:pfxStrobe .4s steps(1,end) infinite; }
  @keyframes pfxStrobe{ 0%{ background:hsla(340,100%,55%,.55);} 20%{ background:hsla(90,100%,55%,.55);} 40%{ background:hsla(200,100%,55%,.55);} 60%{ background:hsla(50,100%,55%,.55);} 80%{ background:hsla(280,100%,55%,.55);} 100%{ background:hsla(160,100%,55%,.55);} }
  .pfx-beam{ left:50%; top:50%; width:260vmax; height:260vmax; margin-left:-130vmax; margin-top:-130vmax; mix-blend-mode:screen; opacity:.5;
    background:conic-gradient(from 0deg, transparent 0 10%, rgba(255,255,255,.35) 10% 15%, transparent 15% 33%, rgba(255,255,255,.28) 33% 38%, transparent 38% 66%, rgba(255,255,255,.3) 66% 72%, transparent 72%);
    animation:pfxSpin360 2.6s linear infinite; }
  .pfx-ball{ left:50%; top:36%; transform:translate(-50%,-50%); font-size:min(32vw,210px); line-height:1; animation:pfxSpin360c 1.1s linear infinite; }
  .pfx-dancer{ font-size:min(20vw,140px); line-height:1; transform:translate(-50%,-50%); animation:pfxDance .46s ease-in-out infinite alternate; }
  @keyframes pfxDance{ from{ transform:translate(-50%,-50%) translateY(0) rotate(-14deg) scale(1);} to{ transform:translate(-50%,-50%) translateY(-9%) rotate(14deg) scale(1.14);} }
  @keyframes pfxSpin360{ from{ transform:rotate(0);} to{ transform:rotate(360deg);} }
  @keyframes pfxSpin360c{ from{ transform:translate(-50%,-50%) rotate(0);} to{ transform:translate(-50%,-50%) rotate(360deg);} }

  /* ---- POLICE (siren) ---- */
  .pfx-cop{ top:0; bottom:0; width:56%; mix-blend-mode:screen; }
  .pfx-cop-l{ left:0; background:radial-gradient(circle at 28% 42%, rgba(255,36,36,.95), rgba(255,0,0,.18) 55%, transparent 72%); animation:pfxCop .5s steps(1,end) infinite; }
  .pfx-cop-r{ right:0; background:radial-gradient(circle at 72% 42%, rgba(46,86,255,.95), rgba(0,0,255,.18) 55%, transparent 72%); animation:pfxCop .5s steps(1,end) infinite; animation-delay:.25s; }
  @keyframes pfxCop{ 0%{ opacity:1;} 50%{ opacity:.04;} 100%{ opacity:1;} }
  .pfx-siren{ left:50%; top:46%; transform:translate(-50%,-50%); font-size:min(38vw,250px); line-height:1; animation:pfxSirenP .5s ease-in-out infinite; }
  @keyframes pfxSirenP{ 0%,100%{ transform:translate(-50%,-50%) scale(1) rotate(-9deg);} 50%{ transform:translate(-50%,-50%) scale(1.14) rotate(9deg);} }
  .pfx-busted{ left:50%; bottom:15%; transform:translate(-50%,0); font-family:var(--font-display,inherit); font-weight:900; font-size:min(9vw,58px); color:#fff; letter-spacing:.03em; white-space:nowrap; text-shadow:0 3px 0 #000, 0 0 22px rgba(255,255,255,.6); animation:pfxBusted .4s ease-in-out infinite alternate; }
  @keyframes pfxBusted{ from{ transform:translate(-50%,0) scale(1);} to{ transform:translate(-50%,0) scale(1.09);} }

  /* ---- GLITCH overlay (body class does the jitter) ---- */
  .pfx-glitchbars{ inset:0; mix-blend-mode:overlay; background:repeating-linear-gradient(0deg, transparent 0 5px, rgba(0,0,0,.32) 5px 7px); animation:pfxBars .2s steps(3,end) infinite; }
  @keyframes pfxBars{ from{ transform:translateY(0);} to{ transform:translateY(7px);} }
  .pfx-noise-txt{ left:50%; top:46%; transform:translate(-50%,-50%); font-family:ui-monospace,monospace; font-weight:800; font-size:min(11vw,66px); color:#0f0; letter-spacing:.06em; white-space:nowrap; text-shadow:2px 0 red,-2px 0 cyan; animation:pfxNoiseTxt .11s steps(2,end) infinite; }
  @keyframes pfxNoiseTxt{ 0%{ transform:translate(-50%,-50%) skewX(0); opacity:1;} 50%{ transform:translate(-53%,-50%) skewX(7deg); opacity:.65;} 100%{ transform:translate(-47%,-50%) skewX(-5deg); opacity:1;} }

  /* ---- INVERT overlay marker (body class inverts the page) ---- */
  .pfx-err{ left:50%; top:50%; transform:translate(-50%,-50%); font-size:min(26vw,180px); line-height:1; animation:pfxErr .5s ease-in-out infinite alternate; }
  @keyframes pfxErr{ from{ transform:translate(-50%,-50%) scale(1);} to{ transform:translate(-50%,-50%) scale(1.12);} }

  /* ---- CRACKED SCREEN ---- */
  .pfx-crack{ inset:0; width:100%; height:100%; filter:drop-shadow(0 1px 1px rgba(0,0,0,.6)); animation:pfxCrackIn .16s ease-out forwards, pfxCrackOut .5s ease-in 2.1s forwards; }
  @keyframes pfxCrackIn{ from{ opacity:0; transform:scale(1.05);} to{ opacity:1; transform:scale(1);} }
  @keyframes pfxCrackOut{ to{ opacity:0;} }

  /* ---- GIANT TAKEOVER ---- */
  .pfx-take{ left:50%; top:50%; font-size:min(130vw,900px); line-height:1; filter:drop-shadow(0 12px 40px rgba(0,0,0,.5));
    animation:pfxTake 2.3s cubic-bezier(.2,1.3,.3,1) forwards; }
  @keyframes pfxTake{
    0%{ transform:translate(-50%,-50%) scale(0) rotate(-30deg); opacity:0;}
    16%{ transform:translate(-50%,-50%) scale(1) rotate(0); opacity:1;}
    30%{ transform:translate(-50%,-50%) scale(.9) rotate(5deg);}
    44%{ transform:translate(-50%,-50%) scale(1.03) rotate(-5deg);}
    58%{ transform:translate(-50%,-50%) scale(.97) rotate(3deg);}
    72%{ transform:translate(-50%,-50%) scale(1) rotate(-2deg);}
    88%{ opacity:1;}
    100%{ transform:translate(-50%,-50%) scale(2.6) rotate(0); opacity:0;}
  }

  /* ---- BUG SWARM ---- */
  .pfx-crawl{ line-height:1; transform:translate(-50%,-50%); animation:pfxCrawl var(--dur) ease-in-out infinite alternate, pfxJit var(--jit) steps(2,end) infinite; }
  @keyframes pfxCrawl{ from{ transform:translate(-50%,-50%) rotate(var(--r0));} to{ transform:translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) rotate(var(--r1));} }
  @keyframes pfxJit{ from{ margin:-3px 0 0 -3px;} to{ margin:3px 0 0 3px;} }

  /* ---- QUAKE booms ---- */
  .pfx-boom{ line-height:1; transform:translate(-50%,-50%); animation:pfxBoom .8s cubic-bezier(.2,1.4,.3,1) var(--dl) forwards; }
  @keyframes pfxBoom{ 0%{ transform:translate(-50%,-50%) scale(0) rotate(-20deg); opacity:0;} 35%{ transform:translate(-50%,-50%) scale(1.25) rotate(6deg); opacity:1;} 70%{ transform:translate(-50%,-50%) scale(1.1) rotate(-2deg); opacity:1;} 100%{ transform:translate(-50%,-50%) scale(1.6) rotate(0); opacity:0;} }

  /* ================= whole-page (<body>) pranks — all self-revert ================= */
  body.pfx-flip{ animation:pfxFlip 2.5s cubic-bezier(.5,.05,.2,1); }
  @keyframes pfxFlip{ 0%{ transform:rotate(0);} 12%{ transform:rotate(180deg);} 88%{ transform:rotate(180deg);} 100%{ transform:rotate(360deg);} }

  body.pfx-spinout{ animation:pfxSpinout 1.9s cubic-bezier(.4,.1,.2,1); }
  @keyframes pfxSpinout{ 0%{ transform:rotate(0) scale(1);} 40%{ transform:rotate(360deg) scale(1.3);} 70%{ transform:rotate(680deg) scale(.82);} 100%{ transform:rotate(720deg) scale(1);} }

  body.pfx-quake{ animation:pfxQuake 1.4s cubic-bezier(.36,.07,.19,.97); }
  @keyframes pfxQuake{
    0%,100%{ transform:translate(0,0) rotate(0);}
    8%,88%{ transform:translate(-5px,3px) rotate(-.8deg);}
    16%,80%{ transform:translate(9px,-5px) rotate(1.1deg);}
    24%,48%,72%{ transform:translate(-16px,7px) rotate(-1.8deg);}
    36%,60%{ transform:translate(16px,-7px) rotate(1.8deg);}
  }

  body.pfx-glitch{ animation:pfxGlitch .1s steps(2,end) infinite; }
  @keyframes pfxGlitch{
    0%{ transform:translate(0,0) skew(0); filter:none; }
    20%{ transform:translate(-7px,2px) skewX(-2deg); filter:hue-rotate(90deg) saturate(2); }
    40%{ transform:translate(6px,-3px) skewX(3deg); filter:hue-rotate(-60deg); }
    60%{ transform:translate(-4px,-2px) skew(0); filter:invert(.15) hue-rotate(180deg); }
    80%{ transform:translate(7px,3px) skewX(-1deg); filter:contrast(1.7); }
    100%{ transform:translate(0,0) skew(0); filter:none; }
  }

  body.pfx-invert{ animation:pfxInvert 2.3s steps(1,end); }
  @keyframes pfxInvert{ 0%{ filter:none;} 6%{ filter:invert(1) hue-rotate(180deg);} 90%{ filter:invert(1) hue-rotate(180deg);} 100%{ filter:none;} }

  @media (prefers-reduced-motion: reduce){
    body.pfx-flip, body.pfx-spinout, body.pfx-quake, body.pfx-glitch{ animation-duration:.3s; }
  }
`;
