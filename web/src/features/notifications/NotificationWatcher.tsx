import { useEffect, useRef } from "react";
import { useData } from "../../state/dataset";
import { useNotif, fireNotification, clearKickoffTriggers, loadSeen, saveSeen } from "../../state/notifications";
import { syncPush, pushConfigured } from "../../state/push";

// One global switch (notifyAll): alerts for goals / kickoff / full-time across ALL
// matches. Real-time while the app is OPEN (foreground), persisted so a goal scored
// while backgrounded still alerts on reopen, and — when the Web Push worker is
// active — delivered even with the app CLOSED (then the foreground alerts below
// stand down to avoid dupes).
export function NotificationWatcher() {
  const ds = useData();
  const notifyAll = useNotif((s) => s.notifyAll);
  const pushActive = useNotif((s) => s.pushActive);
  const setPushActive = useNotif((s) => s.setPushActive);
  const prev = useRef<Map<string, { g: number; status: string }>>(new Map(Object.entries(loadSeen())));

  // Register on/off with the push worker (subscribes on first enable). pushActive
  // gates the foreground alerts so a covered browser doesn't double-notify.
  useEffect(() => {
    if (!pushConfigured()) return;
    syncPush(notifyAll).then(setPushActive);
  }, [notifyAll, setPushActive]);

  // Foreground watcher (+ persisted catch-up on reopen).
  useEffect(() => {
    const name = (code: string | null, fb?: string | null) => (code ? ds.teams[code]?.name || code : fb || "TBD");
    let changed = false;
    for (const m of ds.allMatches) {
      const cur = { g: (m.ga ?? 0) + (m.gb ?? 0), status: m.status };
      const p = prev.current.get(m.id);
      // Only alert for matches that are actually current — within ~4 h of kickoff —
      // so reopening the app never fires a stale alert for a long-finished match.
      const sinceKo = Date.now() - +m.kickoff;
      const recent = sinceKo < 4 * 3600 * 1000;
      if (p && notifyAll && !pushActive && recent) {
        const h = name(m.home, m.fromA), a = name(m.away, m.fromB);
        const wentLive = p.status !== "live" && m.status === "live";
        if (m.status === "live" && cur.g > p.g) {
          fireNotification(`⚽ Mål! ${h} ${m.ga}–${m.gb} ${a}`, m.group ? `Grupp ${m.group}` : m.round, `goal-${m.id}-${cur.g}`, m.id);
        } else if (wentLive && sinceKo < 12 * 60000) {
          // kickoff alert only right when it kicks off (not late on reopen)
          fireNotification(`🟢 Avspark: ${h} – ${a}`, m.group ? `Grupp ${m.group}` : m.round, "ko-" + m.id, m.id);
        } else if (p.status !== "played" && m.status === "played") {
          fireNotification(`Slut: ${h} ${m.ga}–${m.gb} ${a}`, m.group ? `Grupp ${m.group}` : m.round, "ft-" + m.id, m.id);
        }
      }
      if (!p || p.g !== cur.g || p.status !== cur.status) {
        prev.current.set(m.id, cur);
        changed = true;
      }
    }
    if (changed) {
      // persist only live / recently-relevant matches so the store stays small but
      // survives a reload for anything in play
      const out: Record<string, { g: number; status: string }> = {};
      for (const m of ds.allMatches) {
        const rec = prev.current.get(m.id);
        if (!rec) continue;
        const within12h = Math.abs(Date.now() - +m.kickoff) < 12 * 3600 * 1000;
        if (rec.status === "live" || within12h) out[m.id] = rec;
      }
      saveSeen(out);
    }
  }, [ds, notifyAll, pushActive]);

  // Remove any leftover pre-scheduled kickoff triggers from older versions so they
  // can't fire late on app open — the push worker delivers kickoff alerts at the
  // exact moment now.
  useEffect(() => {
    clearKickoffTriggers();
  }, []);

  return null;
}
