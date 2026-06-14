import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import "./styles/globals.css";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { DatasetProvider } from "./state/dataset";
import { useStore } from "./state/store";
import { loadRealData } from "./data/load";
import { startPolling } from "./state/polling";

function Root() {
  const status = useStore((s) => s.status);
  const raw = useStore((s) => s.raw);

  useEffect(() => {
    let alive = true;
    loadRealData()
      .then((d) => {
        if (alive) useStore.getState().setLoaded(d);
      })
      .catch(() => {
        if (alive) useStore.getState().setError();
      })
      .finally(() => {
        if (alive) startPolling();
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!raw && status === "loading") return <Splash text="Hämtar data…" />;
  if (!raw && status === "error") return <Splash text="Kunde inte ladda data. Försök igen." retry />;

  return (
    <ErrorBoundary>
      <DatasetProvider>
        <App />
      </DatasetProvider>
    </ErrorBoundary>
  );
}

function Splash({ text, retry }: { text: string; retry?: boolean }) {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100dvh", textAlign: "center", padding: 24 }}>
      <div>
        <div className="display" style={{ fontSize: 30, marginBottom: 10 }}>
          VM26 <span style={{ background: "var(--grad)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>Tippning</span>
        </div>
        <p className="muted" style={{ marginBottom: 16 }}>{text}</p>
        {retry && <button className="btn btn-primary" onClick={() => location.reload()}>Försök igen</button>}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
