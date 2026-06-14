import { Component, type ReactNode } from "react";

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.error("VM render error:", error);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ display: "grid", placeItems: "center", minHeight: "70dvh", padding: 24, textAlign: "center" }}>
          <div>
            <div className="display" style={{ fontSize: 28, marginBottom: 8 }}>Något gick fel</div>
            <p className="muted" style={{ maxWidth: 360, margin: "0 auto 16px" }}>
              Vyn kraschade. Ladda om sidan för att försöka igen.
            </p>
            <button className="btn btn-primary" onClick={() => location.reload()}>Ladda om</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
