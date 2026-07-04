import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles/globals.css";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { DatasetProvider } from "./state/dataset";
import { useStore } from "./state/store";
import { loadRealData } from "./data/load";
import { startPolling } from "./state/polling";
import { startEspnLive } from "./state/espnLive";
import { startKoTips } from "./state/koTips";
import { startPresence } from "./state/presence";

function Root() {
  const status = useStore((s) => s.status);
  const raw = useStore((s) => s.raw);
  // loading → reveal (splash fades out + app fades in) → done (splash unmounts)
  const [phase, setPhase] = useState<"loading" | "reveal" | "done">("loading");
  const [minDone, setMinDone] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    let alive = true;
    loadRealData()
      .then((d) => { if (alive) useStore.getState().setLoaded(d); })
      .catch(() => { if (alive) useStore.getState().setError(); })
      .finally(() => { if (alive) { startPolling(); startEspnLive(); startKoTips(); startPresence(); } });
    return () => { alive = false; };
  }, []);

  // Hold the splash until the display font is loaded too — otherwise the app reveals in the
  // fallback font and the menu/labels visibly reflow ("load in") a frame later on mobile.
  useEffect(() => {
    let alive = true;
    const done = () => { if (alive) setFontsReady(true); };
    const fonts = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts;
    if (fonts?.ready) fonts.ready.then(done, done); else done();
    const t = setTimeout(done, 2500); // never hang on a slow/blocked font
    return () => { alive = false; clearTimeout(t); };
  }, []);

  // show the splash long enough for its intro to actually be seen, even on a cache hit
  useEffect(() => { const t = setTimeout(() => setMinDone(true), 480); return () => clearTimeout(t); }, []);
  useEffect(() => { if (raw && minDone && fontsReady && phase === "loading") setPhase("reveal"); }, [raw, minDone, fontsReady, phase]);
  useEffect(() => { if (phase === "reveal") { const t = setTimeout(() => setPhase("done"), 760); return () => clearTimeout(t); } }, [phase]);

  if (status === "error" && !raw) return <Splash error />;

  return (
    <>
      {phase !== "loading" && (
        <ErrorBoundary>
          <DatasetProvider>
            <div className={phase === "done" ? "app-mounted" : "app-reveal"}><App /></div>
          </DatasetProvider>
        </ErrorBoundary>
      )}
      {phase !== "done" && <Splash out={phase === "reveal"} />}
    </>
  );
}

function Splash({ out, error }: { out?: boolean; error?: boolean }) {
  return (
    <div className={`splash${out ? " splash-out" : ""}`}>
      <div className="splash-glow" />
      <div className="splash-rings"><span /><span /><span /></div>
      <div className="splash-inner">
        <div className="splash-trophy">🏆</div>
        <div className="splash-logo">VM<b>26</b> <span>Tippning</span></div>
        {error ? (
          <>
            <p className="splash-err">Kunde inte ladda data.</p>
            <button className="splash-retry" onClick={() => location.reload()}>Försök igen</button>
          </>
        ) : (
          <div className="splash-bar"><span /></div>
        )}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);

// Service worker — enables scheduled (closed-tab) kickoff notifications on
// supporting browsers. Safe no-op elsewhere.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
