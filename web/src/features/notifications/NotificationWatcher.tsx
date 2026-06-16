import { useEffect, useRef } from "react";
import { useData } from "../../state/dataset";
import { useNotif, fireNotification, syncKickoffTriggers, loadSeen, saveSeen } from "../../state/notifications";

// Watches the dataset across polls and fires notifications for goals, kickoffs and
// full-time. Real-time while the app is OPEN; the last-seen state is persisted so a
// goal scored while the app was backgrounded/closed still alerts the moment it's
// reopened. True closed-app/locked-phone push would need a server — not available
// for a static site.
export function NotificationWatcher() {
  const ds = useData();
  const subscribed = useNotif((s) => s.subscribed);
  const kickoffAll = useNotif((s) => s.kickoffAll);
  // Seed from persisted state so a match we already tracked fires a catch-up after
  // a tab reload. A match with NO prior record is only baselined (never alerted),
  // so a first-ever visit mid-match doesn't spam already-played goals.
  const prev = useRef<Map<string, { g: number; status: string }>>(
    new Map(Object.entries(loadSeen()))
  );

  useEffect(() => {
    const subs = new Set(subscribed);
    const name = (code: string | null, fb?: string | null) => (code ? ds.teams[code]?.name || code : fb || "TBD");
    let changed = false;
    for (const m of ds.allMatches) {
      const cur = { g: (m.ga ?? 0) + (m.gb ?? 0), status: m.status };
      const p = prev.current.get(m.id);
      if (p) {
        const h = name(m.home, m.fromA), a = name(m.away, m.fromB);
        const sub = subs.has(m.id);
        const wentLive = p.status !== "live" && m.status === "live";
        if (sub && m.status === "live" && cur.g > p.g) {
          // unique tag per goal so a 2nd/3rd goal alerts instead of replacing the first
          fireNotification(`⚽ Mål! ${h} ${m.ga}–${m.gb} ${a}`, m.group ? `Grupp ${m.group}` : m.round, `goal-${m.id}-${cur.g}`);
        } else if (wentLive && (sub || kickoffAll)) {
          fireNotification(`🟢 Avspark: ${h} – ${a}`, m.group ? `Grupp ${m.group}` : m.round, "ko-" + m.id);
        } else if (sub && p.status !== "played" && m.status === "played") {
          fireNotification(`Slut: ${h} ${m.ga}–${m.gb} ${a}`, m.group ? `Grupp ${m.group}` : m.round, "ft-" + m.id);
        }
      }
      if (!p || p.g !== cur.g || p.status !== cur.status) {
        prev.current.set(m.id, cur);
        changed = true;
      }
    }
    if (changed) {
      // Persist only live / recently-relevant / watched matches so the store stays
      // small (not all 104 fixtures) but survives a reload for anything in play.
      const out: Record<string, { g: number; status: string }> = {};
      for (const m of ds.allMatches) {
        const rec = prev.current.get(m.id);
        if (!rec) continue;
        const within12h = Math.abs(Date.now() - +m.kickoff) < 12 * 3600 * 1000;
        if (rec.status === "live" || within12h || subs.has(m.id)) out[m.id] = rec;
      }
      saveSeen(out);
    }
  }, [ds, subscribed, kickoffAll]);

  // Schedule closed-tab kickoff notifications (Chromium) for upcoming matches
  // that are watched or, with kickoffAll, all of them.
  useEffect(() => {
    const subs = new Set(subscribed);
    const name = (code: string | null, fb?: string | null) => (code ? ds.teams[code]?.name || code : fb || "TBD");
    const items = ds.allMatches
      .filter((m) => m.status === "upcoming" && (kickoffAll || subs.has(m.id)))
      .map((m) => ({
        tag: "kosched-" + m.id,
        ts: +m.kickoff,
        title: `🟢 Avspark: ${name(m.home, m.fromA)} – ${name(m.away, m.fromB)}`,
        body: m.group ? `Grupp ${m.group}` : m.round,
      }));
    syncKickoffTriggers(items);
  }, [ds, subscribed, kickoffAll]);

  return null;
}
