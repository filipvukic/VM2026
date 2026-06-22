import { useEffect } from "react";
import { useLightbox } from "../state/lightbox";

// Full-screen image viewer. Rendered once at the app root; opens when any photo
// calls useLightbox().open(src). Sits above the sheet stack (very high z-index).
export function Lightbox() {
  const src = useLightbox((s) => s.src);
  const alt = useLightbox((s) => s.alt);
  const close = useLightbox((s) => s.close);

  useEffect(() => {
    if (!src) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [src, close]);

  if (!src) return null;

  return (
    <div
      onClick={close}
      style={{
        position: "fixed", inset: 0, zIndex: 9999, display: "grid", placeItems: "center",
        padding: "24px", background: "rgba(3,2,8,.86)", backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)", animation: "lbIn .18s ease",
      }}
    >
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        onError={close}
        style={{
          maxWidth: "92vw", maxHeight: "86dvh", width: "auto", height: "auto", objectFit: "contain",
          borderRadius: 18, boxShadow: "0 30px 80px -20px rgba(0,0,0,.9)", border: "1px solid var(--line-2)",
          background: "var(--surface-2)", animation: "lbZoom .22s cubic-bezier(.2,.7,.2,1)",
        }}
      />
      <button
        onClick={close}
        aria-label="Stäng"
        style={{
          position: "fixed", top: "calc(env(safe-area-inset-top) + 14px)", right: 16, width: 40, height: 40,
          display: "grid", placeItems: "center", borderRadius: "50%", color: "#fff",
          background: "rgba(20,16,31,.7)", border: "1px solid var(--line-2)", backdropFilter: "blur(10px)",
        }}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4">
          <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
        </svg>
      </button>
      <style>{`
        @keyframes lbIn{ from{ opacity:0 } to{ opacity:1 } }
        @keyframes lbZoom{ from{ opacity:0; transform:scale(.94) } to{ opacity:1; transform:none } }
      `}</style>
    </div>
  );
}
