import { useEffect, useRef, type ReactNode } from "react";

// Chrome props passed from SheetHost down through each sheet to <Sheet/>.
export interface SheetChrome {
  onClose: () => void;
  onBack?: () => void;
  zIndex?: number;
  blur?: boolean;
  interactive?: boolean;
  depth?: number;
}

interface SheetProps {
  onClose: () => void; // close the whole stack
  onBack?: () => void; // pop one (present when this sheet sits on top of another)
  children: ReactNode;
  zIndex?: number;
  accent?: string;
  maxWidth?: number;
  blur?: boolean; // only the bottom-most sheet blurs (avoids stacked-blur lag)
  interactive?: boolean; // only the top sheet is interactive
  depth?: number; // sheets below the top get pushed back slightly
}

/** Presentational dialog. Global behaviors (scroll lock, ESC) live in SheetHost
 *  so a stack of sheets behaves correctly. Sheets stack OVER each other. */
export function Sheet({
  onClose,
  onBack,
  children,
  zIndex = 100,
  accent,
  maxWidth = 720,
  blur = true,
  interactive = true,
  depth = 0,
}: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const dismiss = onClose; // X / backdrop / ESC all pop one level (handled by host)
  void onBack;

  useEffect(() => {
    if (interactive) {
      panelRef.current?.scrollTo(0, 0);
      panelRef.current?.focus();
    }
  }, [interactive]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="sheet-root"
      style={{ position: "fixed", inset: 0, zIndex, pointerEvents: interactive ? "auto" : "none", animation: "fadeIn .16s ease" }}
    >
      <div
        onClick={dismiss}
        className={blur ? "sheet-dim sheet-dim-blur" : "sheet-dim"}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="sheet-panel"
        style={{
          maxWidth,
          outline: "none",
          transform: depth ? `translateY(${-depth * 10}px) scale(${1 - depth * 0.03})` : undefined,
          filter: depth ? "brightness(.7)" : undefined,
        }}
      >
        {accent && <div style={{ height: 4, background: accent, position: "sticky", top: 0, zIndex: 3 }} />}

        <div className="sheet-controls" style={{ top: accent ? 14 : 12 }}>
          <span />
          <button className="sheet-btn" onClick={onClose} aria-label="Stäng">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="sheet-body">{children}</div>
      </div>

      <style>{`
        .sheet-dim{ position:absolute; inset:0; background:rgba(4,2,10,.6); animation:dimIn .28s ease both; }
        .sheet-dim-blur{ animation:dimBlurIn .32s ease both; }
        @keyframes dimIn{ from{ background:rgba(4,2,10,0); } to{ background:rgba(4,2,10,.6); } }
        @keyframes dimBlurIn{ from{ background:rgba(4,2,10,0); backdrop-filter:blur(0px); -webkit-backdrop-filter:blur(0px); }
          to{ background:rgba(4,2,10,.6); backdrop-filter:blur(7px); -webkit-backdrop-filter:blur(7px); } }
        .sheet-root{ display:flex; align-items:center; justify-content:center; padding:16px; }
        .sheet-panel{
          position:relative; width:100%; max-width:100vw; max-height:90dvh; overflow-y:auto; overflow-x:hidden;
          background:linear-gradient(180deg, var(--surface-2), var(--bg-2));
          border:1px solid var(--line-2); border-radius:var(--r-xl);
          box-shadow:var(--shadow-lift); animation:sheetIn .3s cubic-bezier(.2,.7,.2,1);
          transition:transform .3s cubic-bezier(.2,.7,.2,1), filter .3s;
        }
        .sheet-controls{ position:sticky; z-index:4; display:flex; justify-content:space-between;
          padding:0 12px; margin-bottom:-44px; pointer-events:none; }
        .sheet-controls > *{ pointer-events:auto; }
        .sheet-btn{ width:36px; height:36px; display:grid; place-items:center; border-radius:50%;
          background:color-mix(in srgb, var(--bg) 70%, transparent); backdrop-filter:blur(10px);
          border:1px solid var(--line-2); color:var(--ink); transition:background .15s, transform .12s; }
        .sheet-btn:hover{ background:var(--surface-3); }
        .sheet-btn:active{ transform:scale(.92); }
        .sheet-body{ padding:20px 16px 22px; }
        @media(min-width:560px){ .sheet-body{ padding:24px 22px 26px; } }
        @media(max-width:559px){
          .sheet-root{ padding:0; align-items:flex-end; }
          .sheet-panel{ max-height:94dvh; border-radius:var(--r-xl) var(--r-xl) 0 0; border-bottom:none; }
        }
      `}</style>
    </div>
  );
}
