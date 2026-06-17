import { useNotif, fireNotification } from "../../state/notifications";

// Slim, one-line opt-in shown on the start page until notifications are enabled
// (then it disappears, keeping the page clean). Tasteful, not shouty.
export function NotifyPrompt() {
  const notif = useNotif();
  if (!notif.supported || notif.notifyAll || notif.permission === "denied") return null;
  const enable = async () => {
    await notif.setNotifyAll(true);
    if (useNotif.getState().notifyAll) {
      fireNotification("🔔 Notiser på", "Du får notis vid avspark, mål och slut för alla matcher.", "notify-on");
    }
  };
  return (
    <button className="notify-bar" onClick={enable}>
      <svg className="notify-bell" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13.7 21a2 2 0 0 1-3.4 0" strokeLinecap="round" />
      </svg>
      <span className="notify-text">Få <b>notis</b> vid mål, avspark &amp; slut — för alla matcher</span>
      <span className="notify-cta">Slå på</span>
      <style>{`
        .notify-bar{ display:flex; align-items:center; gap:10px; width:100%; text-align:left; margin-top:14px;
          padding:9px 10px 9px 14px; border-radius:var(--r-md); background:var(--surface); border:1px solid var(--line-2); }
        .notify-bell{ flex:0 0 auto; color:var(--ink-3); }
        .notify-text{ flex:1; min-width:0; font-size:12.5px; color:var(--ink-2); font-weight:600;
          white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .notify-text b{ color:var(--ink); }
        .notify-cta{ flex:0 0 auto; font-weight:800; font-size:12px; color:#fff; background:var(--grad-soft);
          padding:6px 14px; border-radius:var(--r-pill); }
      `}</style>
    </button>
  );
}
