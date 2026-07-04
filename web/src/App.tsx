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
import { KoBetSheet } from "./components/KoBetSheet";
import { Presence } from "./components/Presence";
import { useKoBets } from "./state/koBets";
import { useData } from "./state/dataset";
import { useSheets } from "./state/sheets";
import { useScheduleUI } from "./state/scheduleUi";
import { isLive } from "./lib/liveState";
import { asset } from "./lib/assets";
import { matchPairKey } from "./lib/espnLive";
import { EN_TO_SV } from "./data/static/names";
import type { Dataset } from "./data/types";

// Swedish display name → every English (football-data / ESPN) spelling that maps to
// it. The push worker builds its team-pair key from ESPN's ENGLISH names, but our
// teams carry SWEDISH names — so to match the key we must rebuild it from the English
// name(s). Some Swedish names have several English spellings (Tjeckien = Czech
// Republic / Czechia) — try them all; matchPairKey's CANON bridges the rest.
const SV_TO_EN: Record<string, string[]> = {};
for (const [en, sv] of Object.entries(EN_TO_SV)) (SV_TO_EN[sv] ||= []).push(en);

// Resolve which match a notification points at. Foreground alerts carry our own
// match id (?mid=); push alerts from the worker carry a team-pair key (?m=, the
// only stable id the worker shares with us). Returns the match id or null.
function matchFromParams(ds: Dataset, params: URLSearchParams): string | null {
  const mid = params.get("mid");
  if (mid && ds.allMatches.some((m) => m.id === mid)) return mid;
  const key = params.get("m");
  if (!key) return null;
  // Candidate names for a team: its Swedish display name + all English variants.
  const names = (sv: string) => [sv, ...(SV_TO_EN[sv] || [])];
  const found = ds.allMatches.find((m) => {
    if (!m.home || !m.away) return false;
    const hs = ds.teams[m.home]?.name || m.home;
    const as = ds.teams[m.away]?.name || m.away;
    for (const h of names(hs)) for (const a of names(as)) {
      if (matchPairKey(h, a) === key) return true;
    }
    return false;
  });
  return found?.id ?? null;
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
    // Opening Matcher from the nav shows everything (today-centred); the LIVE pill is
    // the only entry point that pre-selects the live filter.
    if (t === "schedule") useScheduleUI.getState().setFilter("all");
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

  // Notification → match. Three paths, all funnelling to openMatch:
  //  (1) deep-link in the URL (?mid=/?m=) when the launch query survived;
  //  (2) a target the SW stashed in the "vm-nav" cache — covers a COLD launch (iOS
  //      drops the openWindow() query) AND the tap racing the app's boot, so we read
  //      it on load, again on short timers, and whenever the app becomes visible;
  //  (3) a live postMessage from the SW when the app is already open (below).
  const handledParam = useRef(false);
  const drainedCache = useRef(false);
  useEffect(() => {
    if (!ds.allMatches.length) return;
    // (1) URL param — once.
    if (!handledParam.current) {
      handledParam.current = true;
      const params = new URLSearchParams(window.location.search);
      if (params.has("ko")) {
        // KO-tip reminder push → open the slutspelstips sheet.
        window.history.replaceState(null, "", window.location.pathname);
        useKoBets.getState().setSheet(true);
      } else if (params.has("mid") || params.has("m")) {
        const id = matchFromParams(ds, params);
        window.history.replaceState(null, "", window.location.pathname);
        if (id) openMatch(id);
      }
    }
    // (2) SW cache stash — read + clear. Retry because the SW may write it a moment
    // AFTER we boot (the notification tap and the app launch race on iOS).
    if (drainedCache.current || !("caches" in window)) return;
    let stop = false;
    const drain = async () => {
      if (drainedCache.current || stop) return;
      try {
        const cache = await caches.open("vm-nav");
        const res = await cache.match("/__pending_match");
        if (!res) return;
        drainedCache.current = true;
        await cache.delete("/__pending_match");
        const u = new URL(await res.text(), window.location.origin);
        if (u.searchParams.has("ko")) { if (!stop) useKoBets.getState().setSheet(true); return; }
        const id = matchFromParams(ds, u.searchParams);
        if (id && !stop) openMatch(id);
      } catch {
        /* cache unavailable — ignore */
      }
    };
    drain();
    const t1 = setTimeout(drain, 700);
    const t2 = setTimeout(drain, 1800);
    const onVis = () => document.visibilityState === "visible" && drain();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop = true;
      clearTimeout(t1);
      clearTimeout(t2);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [ds, openMatch]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type !== "open-match" || !e.data.url) return;
      // The SW also stashed this in the cache; clear it now we've handled the tap
      // live, so it can't reopen the match on a later cold boot.
      if ("caches" in window) caches.open("vm-nav").then((c) => c.delete("/__pending_match")).catch(() => {});
      try {
        const url = new URL(e.data.url, window.location.origin);
        if (url.searchParams.has("ko")) { useKoBets.getState().setSheet(true); return; }
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
              <button className="live-pill" onClick={() => { useScheduleUI.getState().goLive(); setTab("schedule"); window.scrollTo(0, 0); }} style={{ cursor: "pointer" }}>
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
      <KoBetSheet />
      <Presence />
    </div>
  );
}
