import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { usePresence } from "../state/presence";

// When SOMEONE pokes you ("puffa"), a completely random, over-the-top animation takes over
// your screen for ~1.5s. One of ~11 effects is picked at random per poke, so it's a surprise
// every time. Pure CSS transforms/opacity (GPU-friendly) + a couple of body-class shakes; the
// overlay is pointer-events:none so it never blocks the app. Only the RECIPIENT sees it.

const EMOJI = ["🎉","🤡","💩","🚀","⚽","🐄","🦩","🍕","👽","🔥","💥","🌈","🦄","🕺","💃","🥳","👻","🧨","🎈","🐸","🍺","🎊","😜","🤪","👀","💫","⭐","🪩","🦖","🐙","🍌","🛸","🐔","🥴","🤖","🎸","🦧","🧀","🪿"];
const POKEY = ["👉","👈","👆","👇","✊","👊","🤜","🤛","🫵","🖐️"];
const WORDS = ["PUFF!","BONK!","DUNK!","POW!","OJ!","AJ!","BOING!","YEET!","SMACK!","NUDGE!","PUFFAD!","WOOSH!","BAM!","TJENA!"];
const COLORS = ["#ff4d6d","#ffd23f","#4dd4ac","#5b8cff","#c77dff","#ff8c42","#48cae4","#f15bb5"];
const KINDS = ["blast","rain","stampede","megastamp","spinword","finger","disco","roll","quake","vortex","bubbles"] as const;
type Kind = (typeof KINDS)[number];

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
const cssVars = (o: Record<string, string | number>) => o as CSSProperties;

interface Fx { id: number; kind: Kind; from: string; emoji: string; color: string }

const randomFx = (from: string, id: number): Fx => ({ id, kind: pick(KINDS), from, emoji: pick(EMOJI), color: pick(COLORS) });

// Imperative trigger so you can preview a random effect on your OWN screen (self-test / for
// fun) without a real incoming poke — and without a toast. Wired up while PokeFx is mounted.
let fire: ((from: string) => void) | null = null;
export function previewPokeFx() { fire?.("Du"); }

export function PokeFx() {
  const incoming = usePresence((s) => s.incoming);
  const seen = useRef(0);
  const [fx, setFx] = useState<Fx | null>(null);

  // Fire an effect for each NEW poke (highest ts we haven't played yet).
  useEffect(() => {
    if (!incoming.length) return;
    const latest = incoming.reduce((m, p) => (p.ts > m.ts ? p : m), incoming[0]);
    if (latest.ts <= seen.current) return;
    seen.current = latest.ts;
    setFx(randomFx(latest.from, latest.ts));
  }, [incoming]);

  // Register the self-preview trigger for the "🎲 Testa" button on your own presence row.
  useEffect(() => {
    fire = (from) => setFx(randomFx(from, Date.now() + Math.random()));
    return () => { fire = null; };
  }, []);

  // Whole-page shakes ride on a body class; everything auto-clears.
  useEffect(() => {
    if (!fx) return;
    const bodyClass = fx.kind === "roll" ? "pfx-roll" : fx.kind === "quake" ? "pfx-quake" : null;
    if (bodyClass) document.body.classList.add(bodyClass);
    const dur = fx.kind === "roll" ? 1150 : fx.kind === "quake" ? 950 : 1900;
    const t = window.setTimeout(() => setFx(null), dur);
    return () => { window.clearTimeout(t); if (bodyClass) document.body.classList.remove(bodyClass); };
  }, [fx]);

  return (
    <>
      {fx && <FxLayer fx={fx} />}
      <style>{PFX_CSS}</style>
    </>
  );
}

function FxLayer({ fx }: { fx: Fx }) {
  // Randomise once per poke (keyed by id) so re-renders don't re-roll mid-animation.
  const body = useMemo(() => renderKind(fx), [fx.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="pfx" aria-hidden>{body}</div>;
}

function renderKind(fx: Fx) {
  const W = typeof window !== "undefined" ? window.innerWidth : 400;
  const H = typeof window !== "undefined" ? window.innerHeight : 700;
  const reach = Math.min(W, H) * 0.55;

  switch (fx.kind) {
    case "blast": {
      const n = 36;
      return Array.from({ length: n }, (_, i) => {
        const ang = rnd(0, Math.PI * 2), dist = rnd(90, reach);
        return <span key={i} className="pfx-p" style={cssVars({ "--dx": `${Math.cos(ang) * dist}px`, "--dy": `${Math.sin(ang) * dist}px`, "--sc": rnd(0.7, 1.7).toFixed(2), "--rot": `${rnd(-360, 360)}deg`, "--dur": `${rnd(0.9, 1.5)}s`, "--dl": `${rnd(0, 0.12)}s`, fontSize: `${rnd(20, 46)}px` })}>{pick(EMOJI)}</span>;
      });
    }
    case "rain": {
      const n = 28;
      return Array.from({ length: n }, (_, i) => (
        <span key={i} className="pfx-r" style={cssVars({ left: `${rnd(-2, 100)}vw`, "--rot": `${rnd(-540, 540)}deg`, "--dur": `${rnd(1.1, 1.9)}s`, "--dl": `${rnd(0, 0.5)}s`, fontSize: `${rnd(20, 42)}px` })}>{pick(EMOJI)}</span>
      ));
    }
    case "stampede": {
      const n = 11;
      const dir = Math.random() < 0.5 ? 1 : -1;
      return Array.from({ length: n }, (_, i) => (
        <span key={i} className="pfx-s" style={cssVars({ top: `${rnd(4, 88)}vh`, "--dir": dir, "--dur": `${rnd(0.8, 1.5)}s`, "--dl": `${rnd(0, 0.45)}s`, fontSize: `${rnd(30, 70)}px` })}>{pick(EMOJI)}</span>
      ));
    }
    case "vortex": {
      const n = 26;
      return Array.from({ length: n }, (_, i) => (
        <span key={i} className="pfx-v" style={cssVars({ "--a0": `${rnd(0, 360)}deg`, "--r": `${rnd(120, reach)}px`, "--dur": `${rnd(1, 1.6)}s`, "--dl": `${rnd(0, 0.2)}s`, fontSize: `${rnd(20, 40)}px` })}>{pick(EMOJI)}</span>
      ));
    }
    case "bubbles": {
      const n = 24;
      return Array.from({ length: n }, (_, i) => (
        <span key={i} className="pfx-bub" style={cssVars({ left: `${rnd(0, 100)}vw`, "--sway": `${rnd(-70, 70)}px`, "--dur": `${rnd(1.3, 2.2)}s`, "--dl": `${rnd(0, 0.6)}s`, fontSize: `${rnd(22, 46)}px` })}>{pick(EMOJI)}</span>
      ));
    }
    case "megastamp":
      return (
        <>
          <div className="pfx-flash" style={cssVars({ "--c": fx.color })} />
          <div className="pfx-stamp">{fx.emoji}</div>
        </>
      );
    case "spinword": {
      const txt = Math.random() < 0.5 ? pick(WORDS) : `${fx.from.toUpperCase()}!`;
      return <div className="pfx-word" style={cssVars({ "--c": fx.color })}>{txt}</div>;
    }
    case "finger": {
      const side = pick(["l", "r", "t", "b"] as const);
      return <div className={`pfx-finger pfx-finger-${side}`}>{pick(POKEY)}</div>;
    }
    case "disco":
      return (
        <>
          <div className="pfx-disco" />
          <div className="pfx-mirror">🪩</div>
        </>
      );
    case "quake":
      return Array.from({ length: 6 }, (_, i) => (
        <span key={i} className="pfx-boom" style={cssVars({ left: `${rnd(10, 90)}vw`, top: `${rnd(12, 82)}vh`, "--dl": `${rnd(0, 0.35)}s`, fontSize: `${rnd(40, 90)}px` })}>💥</span>
      ));
    case "roll":
      return <div className="pfx-swirl">🌀</div>;
    default:
      return null;
  }
}

const PFX_CSS = `
  .pfx{ position:fixed; inset:0; z-index:9998; pointer-events:none; overflow:hidden; }
  .pfx > span, .pfx > div{ position:absolute; will-change:transform,opacity; }

  .pfx-p{ left:50%; top:50%; line-height:1; animation:pfxBlast var(--dur) cubic-bezier(.12,.62,.3,1) var(--dl) forwards; }
  @keyframes pfxBlast{
    0%{ transform:translate(-50%,-50%) scale(.2) rotate(0); opacity:0; }
    12%{ opacity:1; }
    100%{ transform:translate(calc(-50% + var(--dx)), calc(-50% + var(--dy) + 40px)) scale(var(--sc)) rotate(var(--rot)); opacity:0; }
  }

  .pfx-r{ top:-8%; line-height:1; animation:pfxRain var(--dur) linear var(--dl) forwards; }
  @keyframes pfxRain{ from{ transform:translateY(0) rotate(0); opacity:1; } to{ transform:translateY(118vh) rotate(var(--rot)); opacity:1; } }

  .pfx-s{ left:-16%; line-height:1; animation:pfxRun var(--dur) linear var(--dl) forwards; }
  @keyframes pfxRun{ from{ transform:translateX(0); } to{ transform:translateX(calc(var(--dir) * 138vw)); } }

  .pfx-v{ left:50%; top:50%; line-height:1; transform-origin:0 0; animation:pfxVortex var(--dur) ease-in var(--dl) forwards; }
  @keyframes pfxVortex{
    0%{ transform:rotate(var(--a0)) translateX(0) scale(.2); opacity:0; }
    20%{ opacity:1; }
    100%{ transform:rotate(calc(var(--a0) + 560deg)) translateX(var(--r)) scale(1.1); opacity:0; }
  }

  .pfx-bub{ bottom:-12%; line-height:1; animation:pfxBub var(--dur) ease-in var(--dl) forwards; }
  @keyframes pfxBub{
    0%{ transform:translateY(0) translateX(0) scale(.4); opacity:0; }
    15%{ opacity:1; }
    100%{ transform:translateY(-120vh) translateX(var(--sway)) scale(1.15); opacity:0; }
  }

  .pfx-flash{ inset:0; background:radial-gradient(circle at center, var(--c) 0%, transparent 62%); animation:pfxFlash .55s ease-out forwards; }
  @keyframes pfxFlash{ from{ opacity:.85; } to{ opacity:0; } }
  .pfx-stamp{ left:50%; top:50%; line-height:1; font-size:min(52vw,360px); filter:drop-shadow(0 12px 30px rgba(0,0,0,.4)); animation:pfxStamp 1.5s cubic-bezier(.2,1.5,.3,1) forwards; }
  @keyframes pfxStamp{
    0%{ transform:translate(-50%,-50%) scale(3.2) rotate(-20deg); opacity:0; }
    22%{ transform:translate(-50%,-50%) scale(1) rotate(7deg); opacity:1; }
    45%{ transform:translate(-50%,-50%) scale(1.06) rotate(-4deg); }
    62%{ transform:translate(-50%,-50%) scale(1) rotate(2deg); }
    82%{ opacity:1; }
    100%{ transform:translate(-50%,-54%) scale(1.25) rotate(0); opacity:0; }
  }

  .pfx-word{ left:50%; top:50%; font-family:var(--font-display,inherit); font-weight:900; font-size:min(23vw,160px);
    color:var(--c); white-space:nowrap; letter-spacing:-.02em; text-shadow:0 4px 0 rgba(0,0,0,.18), 0 0 22px color-mix(in srgb,var(--c) 55%,transparent);
    animation:pfxWord 1.5s cubic-bezier(.2,1.35,.3,1) forwards; }
  @keyframes pfxWord{
    0%{ transform:translate(-50%,-50%) scale(0) rotate(-380deg); opacity:0; }
    30%{ transform:translate(-50%,-50%) scale(1) rotate(0); opacity:1; }
    70%{ transform:translate(-50%,-50%) scale(1.05) rotate(-3deg); opacity:1; }
    100%{ transform:translate(-50%,-50%) scale(1.7) rotate(16deg); opacity:0; }
  }

  .pfx-finger{ line-height:1; font-size:min(46vw,300px); filter:drop-shadow(0 10px 26px rgba(0,0,0,.4)); }
  .pfx-finger-r{ right:-46%; top:34%; animation:pfxFingerR 1.2s cubic-bezier(.3,1.25,.4,1) forwards; }
  .pfx-finger-l{ left:-46%; top:34%; animation:pfxFingerL 1.2s cubic-bezier(.3,1.25,.4,1) forwards; }
  .pfx-finger-t{ top:-46%; left:28%; animation:pfxFingerT 1.2s cubic-bezier(.3,1.25,.4,1) forwards; }
  .pfx-finger-b{ bottom:-46%; left:28%; animation:pfxFingerB 1.2s cubic-bezier(.3,1.25,.4,1) forwards; }
  @keyframes pfxFingerR{ 0%{ transform:translateX(60%); opacity:0; } 30%{ transform:translateX(-24%); opacity:1; } 55%{ transform:translateX(-10%); } 100%{ transform:translateX(70%); opacity:0; } }
  @keyframes pfxFingerL{ 0%{ transform:translateX(-60%); opacity:0; } 30%{ transform:translateX(24%); opacity:1; } 55%{ transform:translateX(10%); } 100%{ transform:translateX(-70%); opacity:0; } }
  @keyframes pfxFingerT{ 0%{ transform:translateY(-60%); opacity:0; } 30%{ transform:translateY(24%); opacity:1; } 55%{ transform:translateY(10%); } 100%{ transform:translateY(-70%); opacity:0; } }
  @keyframes pfxFingerB{ 0%{ transform:translateY(60%); opacity:0; } 30%{ transform:translateY(-24%); opacity:1; } 55%{ transform:translateY(-10%); } 100%{ transform:translateY(70%); opacity:0; } }

  .pfx-disco{ inset:0; mix-blend-mode:screen; animation:pfxDisco 1.4s steps(1,end) forwards; }
  @keyframes pfxDisco{
    0%{ background:hsla(0,90%,55%,.4); } 14%{ background:hsla(50,90%,55%,.4); } 28%{ background:hsla(120,90%,55%,.4); }
    42%{ background:hsla(180,90%,55%,.4); } 56%{ background:hsla(240,90%,55%,.4); } 70%{ background:hsla(300,90%,55%,.4); }
    84%{ background:hsla(340,90%,55%,.4); } 100%{ background:transparent; }
  }
  .pfx-mirror{ left:50%; top:44%; transform:translate(-50%,-50%); font-size:min(34vw,220px); animation:pfxMirror 1.4s ease-in-out forwards; }
  @keyframes pfxMirror{ 0%{ transform:translate(-50%,-50%) scale(0) rotate(0); opacity:0; } 25%{ transform:translate(-50%,-50%) scale(1) rotate(180deg); opacity:1; } 80%{ opacity:1; } 100%{ transform:translate(-50%,-50%) scale(1.1) rotate(720deg); opacity:0; } }

  .pfx-boom{ line-height:1; transform:translate(-50%,-50%); animation:pfxBoom .55s cubic-bezier(.2,1.4,.3,1) var(--dl) forwards; }
  @keyframes pfxBoom{ 0%{ transform:translate(-50%,-50%) scale(0) rotate(-20deg); opacity:0; } 40%{ transform:translate(-50%,-50%) scale(1.2) rotate(6deg); opacity:1; } 100%{ transform:translate(-50%,-50%) scale(1.5) rotate(0); opacity:0; } }

  .pfx-swirl{ left:50%; top:50%; font-size:min(40vw,260px); animation:pfxSwirl 1.15s ease-in-out forwards; }
  @keyframes pfxSwirl{ 0%{ transform:translate(-50%,-50%) scale(0) rotate(0); opacity:0; } 30%{ transform:translate(-50%,-50%) scale(1) rotate(240deg); opacity:1; } 100%{ transform:translate(-50%,-50%) scale(1.3) rotate(1080deg); opacity:0; } }

  /* Whole-page shakes (ride on <body>). Transient, so the fixed-descendant containing-block
     side-effect is harmless. */
  body.pfx-roll{ animation:pfxRoll 1.15s cubic-bezier(.5,.05,.2,1); }
  @keyframes pfxRoll{ from{ transform:rotate(0); } to{ transform:rotate(360deg); } }
  body.pfx-quake{ animation:pfxQuake .9s cubic-bezier(.36,.07,.19,.97); }
  @keyframes pfxQuake{
    10%,90%{ transform:translate(-2px,1px) rotate(-.5deg); }
    20%,80%{ transform:translate(5px,-2px) rotate(.7deg); }
    30%,50%,70%{ transform:translate(-9px,4px) rotate(-1.1deg); }
    40%,60%{ transform:translate(9px,-4px) rotate(1.1deg); }
  }

  @media (prefers-reduced-motion: reduce){
    body.pfx-roll, body.pfx-quake{ animation-duration:.3s; }
  }
`;
