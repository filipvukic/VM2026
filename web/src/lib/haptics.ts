// Cross-platform "buzz".
// - Android / most browsers: the Vibration API (navigator.vibrate).
// - iOS Safari: has NO Vibration API. The only web way to fire the Taptic engine is toggling a
//   hidden <label><input type="checkbox" switch> (iOS 17.4+). We rapid-toggle it to fake a buzz
//   pattern. Best-effort — silently no-ops on older iOS.
let sw: HTMLLabelElement | null = null;

function ensureSwitch(): HTMLLabelElement | null {
  if (typeof document === "undefined") return null;
  if (sw) return sw;
  const label = document.createElement("label");
  label.setAttribute("aria-hidden", "true");
  label.style.display = "none";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", ""); // iOS 17.4+ system switch → haptic tick on toggle
  label.appendChild(input);
  document.body.appendChild(label);
  sw = label;
  return sw;
}

const canVibrate = () => typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

// Fire `taps` haptic ticks ~`gap` ms apart via the iOS switch trick.
function iosTaps(taps: number, gap: number) {
  const el = ensureSwitch();
  if (!el) return;
  for (let i = 0; i < taps; i++) window.setTimeout(() => { try { el.click(); } catch { /* ignore */ } }, i * gap);
}

// A short "vibration". Pattern is the Vibration-API pattern; the iOS path approximates it with
// one tick per pulse.
export function buzz(pattern: number[] = [55, 45, 120, 45, 200]): void {
  if (canVibrate()) { try { navigator.vibrate(pattern); return; } catch { /* fall through */ } }
  const pulses = Math.max(3, Math.ceil(pattern.length / 2) + 1);
  iosTaps(pulses, 70);
}

// A longer, more insistent buzz (for the loudest pranks).
export function bigBuzz(): void {
  if (canVibrate()) { try { navigator.vibrate([0, 350, 90, 350, 90, 500]); return; } catch { /* fall through */ } }
  iosTaps(9, 60);
}
