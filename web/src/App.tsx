import { useEffect, useRef, useState } from "react";
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
import { Lightbox } from "./components/Lightbox";
import { useData } from "./state/dataset";
import { useSheets } from "./state/sheets";
import { isLive } from "./lib/liveState";
import { asset } from "./lib/assets";
import { matchPairKey } from "./lib/espnLive";
import type { Dataset } from "./data/types";

// Resolve which match a notification points at. Foreground alerts carry our own
// match id (?mid=); push alerts from the worker carry a team-pair key (?m=, the
// only stable id the worker shares with us). Returns the match id or null.
function matchFromParams(ds: Dataset, params: URLSearchParams): string | null {
  const mid = params.get("mid");
  if (mid && ds.allMatches.some((m) => m.id === mid)) return mid;
  const key = params.get("m");
  if (key) {
    const found = ds.allMatches.find(
      (m) => m.home && m.away && matchPairKey(ds.teams[m.home]?.name || m.home, ds.teams[m.away]?.name || m.away) === key
    );
    return found?.id ?? null;
  }
  return null;
}

export default function App() {
  const ds = useData();
  const [tab, setTab] = useState<TabId>("standings");
  const [searchOpen, setSearchOpen] = useState(false);
  const openMatch = useSheets((s) => s.openMatch);
  const live = ds.allMatches.filter(isLive);

  // Switching tabs resets the scroll position. Without this, opening ranking /
  // bonus / info after scrolling down a long tab (schedule, standings) left you
  // landed near the bottom on mobile — the window scroll persisted across the swap.
  const goTab = (t: TabId) => {
    setTab(t);
    window.scrollTo(0, 0);
  };

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

  // Notification → match. Two paths: (1) the app was launched/reopened from a
  // notification, so the deep-link is in the URL (?mid=/?m=) — open it once data
  // is loaded, then strip the param; (2) the app is already open and the service
  // worker posts the clicked notification's URL — resolve and open it live.
  const handledUrl = useRef(false);
  useEffect(() => {
    if (handledUrl.current || !ds.allMatches.length) return;
    handledUrl.current = true;
    (async () => {
      const params = new URLSearchParams(window.location.search);
      let id: string | null = null;
      if (params.has("mid") || params.has("m")) {
        id = matchFromParams(ds, params);
        window.history.replaceState(null, "", window.location.pathname);
      }
      // Cold launch from a push on an installed iOS PWA: the query string we pass
      // to openWindow() is dropped (the app boots at start_url), so ?m= never
      // reaches us via the URL. The service worker stashes the target in a cache
      // instead — read and clear it. Always clear (even when a URL param WAS
      // present) so a stale stash can't reopen a match on a later cold start.
      if ("caches" in window) {
        try {
          const cache = await caches.open("vm-nav");
          const res = await cache.match("/__pending_match");
          if (res) {
            await cache.delete("/__pending_match");
            if (!id) id = matchFromParams(ds, new URL(await res.text(), window.location.origin).searchParams);
          }
        } catch {
          /* cache unavailable — ignore */
        }
      }
      if (id) openMatch(id);
    })();
  }, [ds, openMatch]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type !== "open-match" || !e.data.url) return;
      try {
        const url = new URL(e.data.url, window.location.origin);
        const id = matchFromParams(ds, url.searchParams);
        if (id) openMatch(id);
      } catch {
        /* ignore malformed url */
      }
    };
    navigator.serviceWorker.addEventListener("message", onMsg);
    return () => navigator.serviceWorker.removeEventListener("message", onMsg);
  }, [ds, openMatch]);

  return (
    <div className="app">
      <header className="header">
        <div className="container header-bar">
          <button className="brand" onClick={() => goTab("standings")}>
            <img className="brand-logo" src={asset("images/wc2026-logo.svg")} alt="" />
            <span>VM26 <span className="accent">Tippning</span></span>
          </button>

          <TopNav active={tab} onChange={goTab} />

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: "auto", flexShrink: 0 }}>
            {live.length > 0 && (
              <button className="live-pill" onClick={() => (live.length === 1 ? openMatch(live[0].id) : goTab("schedule"))} style={{ cursor: "pointer" }}>
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

      <Nav active={tab} onChange={goTab} />

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
      <Lightbox />
    </div>
  );
}
