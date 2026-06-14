export type TabId =
  | "standings"
  | "schedule"
  | "groups"
  | "ranking"
  | "bonus"
  | "insights"
  | "info";

interface TabDef {
  id: TabId;
  label: string;
  icon: JSX.Element;
}

const I = (d: string, extra?: JSX.Element) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
    {extra}
  </svg>
);

export const TABS: TabDef[] = [
  { id: "standings", label: "Liga", icon: I("M8 21V8M16 21V4M4 21h16M4 21v-6", <path d="M12 21v-9" />) },
  { id: "schedule", label: "Matcher", icon: I("M3 9h18M7 3v3M17 3v3M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z") },
  { id: "groups", label: "Grupper", icon: I("M4 5h7v7H4zM13 5h7v7h-7zM4 14h7v5H4zM13 14h7v5h-7z") },
  { id: "ranking", label: "Ranking", icon: I("M5 21V9M12 21V4M19 21v-8", <path d="M3 21h18" />) },
  { id: "bonus", label: "Bonus", icon: I("M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.2l1-5.8L3.5 9.2l5.9-.9z") },
  { id: "insights", label: "Insikter", icon: I("M4 19V5M4 19h16M8 16l3-4 3 2 4-6") },
  { id: "info", label: "Info", icon: I("M12 16v-5M12 8h.01", <circle cx="12" cy="12" r="9" />) },
];

// Bottom tab bar — mobile only.
export function Nav({ active, onChange }: { active: TabId; onChange: (t: TabId) => void }) {
  return (
    <nav className="nav" aria-label="Huvudnavigering">
      <div className="nav-inner">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`nav-item ${active === t.id ? "active" : ""}`}
            aria-current={active === t.id ? "page" : undefined}
            onClick={() => onChange(t.id)}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

// In-header tabs — desktop only (merged into the single header row).
export function TopNav({ active, onChange }: { active: TabId; onChange: (t: TabId) => void }) {
  return (
    <nav className="top-nav" aria-label="Huvudnavigering">
      {TABS.map((t) => (
        <button
          key={t.id}
          className={`top-nav-item ${active === t.id ? "active" : ""}`}
          aria-current={active === t.id ? "page" : undefined}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}
