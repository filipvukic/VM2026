import { useState } from "react";
import { useNotif, fireNotification } from "../../state/notifications";
import { sendTestPush, pushConfigured } from "../../state/push";
import { iosNeedsInstall } from "../../lib/platform";

// Slim, one-line opt-in shown on the start page until notifications are enabled
// (then it disappears, keeping the page clean). On an iPhone Safari tab — where
// notifications can't work until the site is on the home screen — it instead shows
// how to install. Tasteful, not shouty.
export function NotifyPrompt() {
  const notif = useNotif();
  const [showHelp, setShowHelp] = useState(false);
  const needInstall = iosNeedsInstall();

  // Already on, or blocked, or (non-iOS) unsupported → nothing to prompt.
  if (!needInstall && (!notif.supported || notif.notifyAll || notif.permission === "denied")) return null;

  const onClick = async () => {
    if (needInstall) {
      setShowHelp((v) => !v);
      return;
    }
    await notif.setNotifyAll(true);
    if (!useNotif.getState().notifyAll) return; // permission not granted
    // Confirm with a REAL push (proves the closed-app path); fall back to a local
    // notification if the worker isn't reachable.
    const real = pushConfigured() ? await sendTestPush() : false;
    if (!real) {
      fireNotification("🔔 Notiser på", "Du får notis vid avspark, mål och slut för alla matcher.", "notify-on");
    }
  };

  return (
    <div>
      <button className="notify-bar" onClick={onClick}>
        <svg className="notify-bell" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" strokeLinecap="round" />
        </svg>
        <span className="notify-text">
          {needInstall ? (
            <>Lägg till på <b>hemskärmen</b> för notiser</>
          ) : (
            <>Få <b>notis</b> vid mål, avspark &amp; slut — för alla matcher</>
          )}
        </span>
        <span className="notify-cta">{needInstall ? "Visa hur" : "Slå på"}</span>
      </button>

      {needInstall && showHelp && (
        <div className="notify-help">
          <ol>
            <li>Tryck på <b>Dela</b>-ikonen <span className="notify-share">⬆️</span> i Safaris menyrad (längst ner).</li>
            <li>Välj <b>”Lägg till på hemskärmen”</b>.</li>
            <li>Öppna <b>VM26</b> från hemskärmen och slå på notiser där.</li>
          </ol>
        </div>
      )}

      <style>{`
        .notify-bar{ display:flex; align-items:center; gap:10px; width:100%; text-align:left; margin-top:14px;
          padding:9px 10px 9px 14px; border-radius:var(--r-md); background:var(--surface); border:1px solid var(--line-2); }
        .notify-bell{ flex:0 0 auto; color:var(--ink-3); }
        .notify-text{ flex:1; min-width:0; font-size:12.5px; color:var(--ink-2); font-weight:600;
          white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .notify-text b{ color:var(--ink); }
        .notify-cta{ flex:0 0 auto; font-weight:800; font-size:12px; color:#fff; background:var(--grad-soft);
          padding:6px 14px; border-radius:var(--r-pill); }
        .notify-help{ margin-top:8px; padding:12px 16px; border-radius:var(--r-md); background:var(--surface);
          border:1px solid var(--line-2); }
        .notify-help ol{ margin:0; padding-left:18px; font-size:12.5px; line-height:1.7; color:var(--ink-2); }
        .notify-help b{ color:var(--ink); }
        .notify-share{ font-size:13px; }
      `}</style>
    </div>
  );
}
