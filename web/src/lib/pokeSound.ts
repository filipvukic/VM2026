// Self-contained Web Audio for the poke ("puffa") pranks — no audio files (CSP blocks external
// assets and we want zero payload), everything is synthesised live. Autoplay-safe: a received
// poke isn't a user gesture, so we resume the AudioContext on the recipient's own taps
// (armPokeSound) and only play when it's actually running. Each poke gets a fresh "bus" so a new
// poke cuts the previous sound instead of layering.
let ctx: AudioContext | null = null;
let bus: GainNode | null = null;

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

export function armPokeSound(): () => void {
  const resume = () => { getCtx(); };
  const evs: (keyof WindowEventMap)[] = ["pointerdown", "touchstart", "keydown"];
  evs.forEach((e) => window.addEventListener(e, resume, { passive: true }));
  return () => evs.forEach((e) => window.removeEventListener(e, resume));
}

// Fresh output bus; ramps the previous one down so a new poke interrupts cleanly.
function freshBus(c: AudioContext): GainNode {
  if (bus) {
    const old = bus;
    try {
      old.gain.cancelScheduledValues(c.currentTime);
      old.gain.setTargetAtTime(0.0001, c.currentTime, 0.05);
    } catch { /* ignore */ }
    window.setTimeout(() => { try { old.disconnect(); } catch { /* ignore */ } }, 500);
  }
  const g = c.createGain();
  g.gain.value = 0.85;
  g.connect(c.destination);
  bus = g;
  return g;
}

let noiseBuf: AudioBuffer | null = null;
function noise(c: AudioContext): AudioBufferSourceNode {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = c.createBufferSource();
  s.buffer = noiseBuf;
  return s;
}

// --- instruments ------------------------------------------------------------
function kick(c: AudioContext, out: AudioNode, t: number) {
  const o = c.createOscillator(), g = c.createGain();
  o.frequency.setValueAtTime(165, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.17);
  o.connect(g).connect(out); o.start(t); o.stop(t + 0.19);
}
function hat(c: AudioContext, out: AudioNode, t: number) {
  const s = noise(c), g = c.createGain(), f = c.createBiquadFilter();
  f.type = "highpass"; f.frequency.value = 7500;
  g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  s.connect(f).connect(g).connect(out); s.start(t); s.stop(t + 0.06);
}
function bassNote(c: AudioContext, out: AudioNode, t: number, freq: number, dur: number) {
  const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
  o.type = "sawtooth"; o.frequency.value = freq;
  f.type = "lowpass"; f.frequency.value = 650;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.45, t + 0.02);
  g.gain.setValueAtTime(0.45, t + dur - 0.05); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(f).connect(g).connect(out); o.start(t); o.stop(t + dur + 0.02);
}
function lead(c: AudioContext, out: AudioNode, t: number, freq: number, dur: number) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = "square"; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.02);
}

// --- tracks / sfx -----------------------------------------------------------
function discoTrack(c: AudioContext, out: AudioNode, t0: number) {
  const beat = 60 / 124;
  const roots = [110, 87.31, 130.81, 98]; // A2 F2 C2 G2
  const arp = [2, 3, 4, 3];
  const beats = 14; // ~6.8s
  for (let b = 0; b < beats; b++) {
    const t = t0 + b * beat;
    kick(c, out, t);
    hat(c, out, t + beat / 2);
    const root = roots[Math.floor(b / 2) % roots.length];
    if (b % 2 === 0) bassNote(c, out, t, root, beat * 2 * 0.92);
    lead(c, out, t + beat / 2, root * arp[b % 4], beat * 0.45);
  }
}

function siren(c: AudioContext, out: AudioNode, t0: number, dur: number) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = "sawtooth"; g.gain.value = 0.16;
  o.frequency.setValueAtTime(520, t0);
  for (let t = t0, i = 0; t < t0 + dur; t += 0.7, i++) {
    o.frequency.linearRampToValueAtTime(1000, t + 0.35);
    o.frequency.linearRampToValueAtTime(520, t + 0.7);
  }
  o.connect(g).connect(out); o.start(t0); o.stop(t0 + dur);
}

function airhorn(c: AudioContext, out: AudioNode, t0: number) {
  [116.5, 233, 349].forEach((f) => {
    const o = c.createOscillator(), g = c.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(f, t0); o.frequency.linearRampToValueAtTime(f * 1.03, t0 + 1);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.13, t0 + 0.03);
    g.gain.setValueAtTime(0.13, t0 + 1); g.gain.exponentialRampToValueAtTime(0.001, t0 + 1.25);
    o.connect(g).connect(out); o.start(t0); o.stop(t0 + 1.3);
  });
}

function shatter(c: AudioContext, out: AudioNode, t0: number) {
  const s = noise(c), g = c.createGain(), f = c.createBiquadFilter();
  f.type = "highpass"; f.frequency.value = 3000;
  g.gain.setValueAtTime(0.55, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.4);
  s.connect(f).connect(g).connect(out); s.start(t0); s.stop(t0 + 0.45);
  [1800, 2500, 3300, 4200].forEach((fr, i) => {
    const o = c.createOscillator(), gg = c.createGain();
    o.type = "triangle"; o.frequency.value = fr;
    const t = t0 + 0.02 + i * 0.035;
    gg.gain.setValueAtTime(0.11, t); gg.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(gg).connect(out); o.start(t); o.stop(t + 0.25);
  });
}

function rumble(c: AudioContext, out: AudioNode, t0: number, dur: number) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = "sine"; o.frequency.value = 42; g.gain.value = 0.5;
  const lfo = c.createOscillator(), lg = c.createGain();
  lfo.frequency.value = 17; lg.gain.value = 0.3; lfo.connect(lg).connect(g.gain);
  o.connect(g).connect(out); o.start(t0); lfo.start(t0); o.stop(t0 + dur); lfo.stop(t0 + dur);
  const s = noise(c), ng = c.createGain(), nf = c.createBiquadFilter();
  nf.type = "lowpass"; nf.frequency.value = 200;
  ng.gain.setValueAtTime(0.3, t0); ng.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  s.connect(nf).connect(ng).connect(out); s.start(t0); s.stop(t0 + dur);
}

function glitchNoise(c: AudioContext, out: AudioNode, t0: number) {
  for (let i = 0; i < 9; i++) {
    const t = t0 + i * 0.13 + Math.random() * 0.04;
    const s = noise(c), g = c.createGain(), f = c.createBiquadFilter();
    f.type = "bandpass"; f.frequency.value = 400 + Math.random() * 3200; f.Q.value = 3;
    g.gain.setValueAtTime(0.3, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    s.connect(f).connect(g).connect(out); s.start(t); s.stop(t + 0.1);
    if (Math.random() < 0.6) {
      const o = c.createOscillator(), gg = c.createGain();
      o.type = "square"; o.frequency.value = 180 + Math.random() * 2200;
      gg.gain.setValueAtTime(0.12, t); gg.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      o.connect(gg).connect(out); o.start(t); o.stop(t + 0.08);
    }
  }
}

function whoosh(c: AudioContext, out: AudioNode, t0: number, up: boolean) {
  const s = noise(c), g = c.createGain(), f = c.createBiquadFilter();
  f.type = "bandpass"; f.Q.value = 1.2;
  f.frequency.setValueAtTime(up ? 300 : 1700, t0);
  f.frequency.exponentialRampToValueAtTime(up ? 1700 : 300, t0 + 0.55);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.1);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.6);
  s.connect(f).connect(g).connect(out); s.start(t0); s.stop(t0 + 0.65);
}

function errorBuzz(c: AudioContext, out: AudioNode, t0: number) {
  [0, 0.24].forEach((off) => {
    const o = c.createOscillator(), g = c.createGain();
    o.type = "square"; o.frequency.value = 110;
    const t = t0 + off;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.24, t + 0.01);
    g.gain.setValueAtTime(0.24, t + 0.16); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.22);
  });
}

export function playPokeSound(kind: string): void {
  const c = getCtx();
  if (!c || c.state !== "running") return; // no gesture yet → stay silent rather than error
  const out = freshBus(c);
  const t = c.currentTime + 0.02;
  switch (kind) {
    case "disco": discoTrack(c, out, t); break;
    case "police": siren(c, out, t, 3.4); break;
    case "glitch": glitchNoise(c, out, t); break;
    case "crack": shatter(c, out, t); break;
    case "quake": rumble(c, out, t, 1.4); break;
    case "flip": whoosh(c, out, t, false); break;
    case "spinout": whoosh(c, out, t, true); break;
    case "invert": errorBuzz(c, out, t); break;
    default: airhorn(c, out, t); break; // takeover, swarm, anything else
  }
}
