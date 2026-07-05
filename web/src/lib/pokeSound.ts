// Tiny self-contained Web Audio synth for the poke ("puffa") effects. No audio files (the CSP
// blocks external assets and we want zero payload), just oscillators. Autoplay-safe: a received
// poke is not a user gesture, so we resume the AudioContext on the recipient's own taps
// (armPokeSound) and only actually play when the context is running.
let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch { return null; }
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

// Resume the context on the user's own gestures so a later (non-gesture) poke can make sound.
// Returns a cleanup fn.
export function armPokeSound(): () => void {
  const resume = () => { getCtx(); };
  const evs: (keyof WindowEventMap)[] = ["pointerdown", "touchstart", "keydown"];
  evs.forEach((e) => window.addEventListener(e, resume, { passive: true }));
  return () => evs.forEach((e) => window.removeEventListener(e, resume));
}

function tone(c: AudioContext, t0: number, dur: number, type: OscillatorType, f0: number, f1: number | null, vol: number) {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t0);
  if (f1 && f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

// A handful of short, silly jingles — picked at random to match the surprise of the visuals.
const SYNTHS: ((c: AudioContext, t: number) => void)[] = [
  (c, t) => { tone(c, t, 0.18, "sine", 170, 540, 0.20); tone(c, t + 0.16, 0.26, "sine", 540, 190, 0.17); },            // boing
  (c, t) => { [523, 659, 784, 1047].forEach((f, i) => tone(c, t + i * 0.09, 0.16, "triangle", f, f, 0.15)); },          // ta-daa
  (c, t) => { tone(c, t, 0.17, "square", 380, 300, 0.13); tone(c, t + 0.21, 0.22, "square", 300, 235, 0.13); },         // clown honk
  (c, t) => { tone(c, t, 0.38, "sawtooth", 980, 110, 0.13); },                                                          // laser pew
  (c, t) => { tone(c, t, 0.08, "square", 988, 988, 0.15); tone(c, t + 0.08, 0.28, "square", 1319, 1319, 0.15); },       // coin
  (c, t) => { tone(c, t, 0.34, "triangle", 300, 900, 0.15); tone(c, t + 0.05, 0.34, "sine", 306, 906, 0.09); },         // wobble rise
  (c, t) => { [392, 392, 523, 659].forEach((f, i) => tone(c, t + i * 0.11, 0.13, "square", f, f, 0.12)); },             // fanfare
];

export function playPokeSound(): void {
  const c = getCtx();
  if (!c || c.state !== "running") return; // no gesture yet → stay silent rather than error
  const t = c.currentTime + 0.01;
  SYNTHS[Math.floor(Math.random() * SYNTHS.length)](c, t);
}
