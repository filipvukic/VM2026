import { useEffect, useRef } from "react";
import { useData } from "../../state/dataset";
import { useNotif, fireNotification, syncKickoffTriggers } from "../../state/notifications";

// Watches the dataset across polls and fires foreground notifications for goals,
// kickoffs and full-time. Works on desktop + mobile WHILE the page is open.
// (Background/closed-tab push would need a server — not available for a static site.)
export function NotificationWatcher() {
  const ds = useData();
  const subscribed = useNotif((s) => s.subscribed);
  const kickoffAll = useNotif((s) => s.kickoffAll);
  const prev = useRef<Map<string, { g: number; status: string }>>(new Map());
  const primed = useRef(false);

  useEffect(() => {
    const subs = new Set(subscribed);
    const name = (code: string | null, fb?: string | null) => (code ? ds.teams[code]?.name || code : fb || "TBD");
    for (const m of ds.allMatches) {
      const cur = { g: (m.ga ?? 0) + (m.gb ?? 0), status: m.status };
      const p = prev.current.get(m.id);
      if (primed.current && p) {
        const h = name(m.home, m.fromA), a = name(m.away, m.fromB);
        const sub = subs.has(m.id);
        const wentLive = p.status !== "live" && m.status === "live";
        if (sub && m.status === "live" && cur.g > p.g) {
          fireNotification(`⚽ Mål! ${h} ${m.ga}–${m.gb} ${a}`, m.group ? `Grupp ${m.group}` : m.round, "goal-" + m.id);
        } else if (wentLive && (sub || kickoffAll)) {
          fireNotification(`🟢 Avspark: ${h} – ${a}`, m.group ? `Grupp ${m.group}` : m.round, "ko-" + m.id);
        } else if (sub && p.status !== "played" && m.status === "played") {
          fireNotification(`Slut: ${h} ${m.ga}–${m.gb} ${a}`, m.group ? `Grupp ${m.group}` : m.round, "ft-" + m.id);
        }
      }
      prev.current.set(m.id, cur);
    }
    primed.current = true;
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
