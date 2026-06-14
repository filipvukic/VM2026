import { useEffect, useState } from "react";
import { Nav, TopNav, type TabId } from "./components/Nav";
import { SheetHost } from "./sheets/SheetHost";
import { StandingsView } from "./views/StandingsView";
import { GroupsView } from "./views/GroupsView";
import { ScheduleView } from "./views/ScheduleView";
import { RankingView } from "./views/RankingView";
import { BonusView } from "./views/BonusView";
import { InfoView } from "./views/InfoView";
import { InsightsView } from "./features/insights/InsightsView";
import { SearchCommand } from "./features/search/SearchCommand";
import { NotificationWatcher } from "./features/notifications/NotificationWatcher";
import { useData } from "./state/dataset";
import { useSheets } from "./state/sheets";
import { isLive } from "./lib/liveState";
import { asset } from "./lib/assets";

export default function App() {
  const ds = useData();
  const [tab, setTab] = useState<TabId>("standings");
  const [searchOpen, setSearchOpen] = useState(false);
  const openMatch = useSheets((s) => s.openMatch);
  const live = ds.allMatches.filter(isLive);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="app">
      <header className="header">
        <div className="container header-bar">
          <button className="brand" onClick={() => setTab("standings")}>
            <img className="brand-logo" src={asset("images/wc2026-logo.svg")} alt="" />
            <span>VM26 <span className="accent">Tippning</span></span>
          </button>

          <TopNav active={tab} onChange={setTab} />

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: "auto", flexShrink: 0 }}>
            {live.length > 0 && (
              <button className="live-pill" onClick={() => (live.length === 1 ? openMatch(live[0].id) : setTab("schedule"))} style={{ cursor: "pointer" }}>
                <span className="live-dot" />{live.length} LIVE
              </button>
            )}
            <button className="search-bar" onClick={() => setSearchOpen(true)} aria-label="Sök">
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.2-3.2" strokeLinecap="round" />
              </svg>
              Sök spelare, lag, match…
              <span className="kbd">⌘K</span>
            </button>
            <button className="icon-btn search-icon-only" aria-label="Sök" onClick={() => setSearchOpen(true)}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.2-3.2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <Nav active={tab} onChange={setTab} />

      <main>
        {tab === "standings" && <StandingsView />}
        {tab === "schedule" && <ScheduleView />}
        {tab === "groups" && <GroupsView />}
        {tab === "ranking" && <RankingView />}
        {tab === "bonus" && <BonusView />}
        {tab === "insights" && <InsightsView />}
        {tab === "info" && <InfoView />}
      </main>

      {searchOpen && <SearchCommand onClose={() => setSearchOpen(false)} />}
      <NotificationWatcher />
      <SheetHost />
    </div>
  );
}
