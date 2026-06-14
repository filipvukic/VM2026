import { useEffect, useMemo, useRef, useState } from "react";
import { useData, usePlayersDb } from "../../state/dataset";
import { useSheets } from "../../state/sheets";
import { Avatar } from "../../components/Avatar";
import { PlayerImg } from "../../components/PlayerImg";
import { Flag } from "../../lib/flags";
import { isoFor } from "../../data/static/names";
import { bestPhoto } from "../../lib/playerPhoto";
import { ALL_STARS } from "../../data/stars";
import { svDayMonth } from "../../lib/format";
import type { Dataset, PlayersDb } from "../../data/types";

type Result =
  | { kind: "player"; id: string; label: string; sub: string; color: string; photo: string | null }
  | { kind: "fbplayer"; name: string; label: string; sub: string; photo: string | null; iso: string | null; espnId?: string | null }
  | { kind: "team"; code: string; label: string; sub: string; iso: string | null }
  | { kind: "match"; id: string; label: string; sub: string; iso1: string | null; iso2: string | null };

function norm(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function search(ds: Dataset, db: PlayersDb | null, q: string): Result[] {
  const nq = norm(q.trim());
  if (!nq) return [];
  const out: Result[] = [];

  ds.players.forEach((p) => {
    if (norm(p.name).includes(nq)) out.push({ kind: "player", id: p.id, label: p.name, sub: `#${p.rank} · ${p.total}p`, color: p.color, photo: p.photo });
  });

  // football players (players.json)
  const seen = new Set<string>();
  if (db) {
    let n = 0;
    for (const key of Object.keys(db)) {
      if (n >= 12) break;
      if (norm(key).includes(nq)) {
        const p = db[key];
        seen.add(norm(key));
        out.push({ kind: "fbplayer", name: key, label: key, sub: [p.team, p.position].filter(Boolean).join(" · ") || "Spelare", photo: bestPhoto(p), iso: isoFor(p.nationality, null), espnId: p.espnId });
        n++;
      }
    }
  }
  // famous stars not yet in players.json (e.g. Mbappé before France plays)
  for (const s of ALL_STARS) {
    if (seen.has(norm(s.name))) continue;
    if (norm(s.name).includes(nq)) {
      const t = ds.teams[s.code];
      out.push({ kind: "fbplayer", name: s.name, label: s.name, sub: t ? `Stjärna · ${t.name}` : "Spelare", photo: null, iso: t?.iso || null });
    }
  }

  Object.values(ds.teams).forEach((t) => {
    if (t.code.indexOf("TBD") === 0) return;
    if (norm(t.name).includes(nq) || norm(t.code).includes(nq)) {
      out.push({ kind: "team", code: t.code, label: t.name, sub: t.group ? `Grupp ${t.group}` : "Lag", iso: t.iso });
    }
  });

  ds.allMatches.forEach((m) => {
    const h = m.home ? ds.teams[m.home] : null;
    const a = m.away ? ds.teams[m.away] : null;
    const hn = h?.name || m.fromA || "";
    const an = a?.name || m.fromB || "";
    if (norm(hn).includes(nq) || norm(an).includes(nq)) {
      const score = m.status === "played" ? `${m.ga}–${m.gb}` : svDayMonth(m.kickoff);
      out.push({ kind: "match", id: m.id, label: `${hn} – ${an}`, sub: `${m.stage === "group" ? "Grupp " + m.group : "Slutspel"} · ${score}`, iso1: h?.iso || null, iso2: a?.iso || null });
    }
  });

  const order = { player: 0, fbplayer: 1, team: 2, match: 3 } as const;
  return out.sort((x, y) => order[x.kind] - order[y.kind]).slice(0, 30);
}

export function SearchCommand({ onClose }: { onClose: () => void }) {
  const ds = useData();
  const db = usePlayersDb();
  const { openPlayer, openTeam, openMatch, openFbPlayer } = useSheets();
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => search(ds, db, q), [ds, db, q]);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const pick = (r: Result) => {
    if (r.kind === "player") openPlayer(r.id);
    else if (r.kind === "fbplayer") openFbPlayer(r.name, r.espnId);
    else if (r.kind === "team") openTeam(r.code);
    else if (r.kind === "match") openMatch(r.id);
    onClose();
  };

  return (
    <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, zIndex: 200, animation: "fadeIn .15s" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(4,2,10,.7)", backdropFilter: "blur(8px)" }} />
      <div className="container" style={{ position: "relative", paddingTop: "8vh", maxWidth: 640 }}>
        <div className="card" style={{ overflow: "hidden", animation: "sheetIn .3s cubic-bezier(.2,.7,.2,1)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: "1px solid var(--line)" }}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="var(--ink-3)" strokeWidth="2.2">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.2-3.2" strokeLinecap="round" />
            </svg>
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Sök spelare, lag eller match…"
              style={{ flex: 1, background: "none", border: "none", outline: "none", color: "var(--ink)", fontSize: 16, fontWeight: 600 }}
            />
            <button className="chip" onClick={onClose}>Esc</button>
          </div>
          <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
            {q && results.length === 0 && <div className="dim" style={{ padding: 24, textAlign: "center" }}>Inga träffar.</div>}
            {!q && <div className="dim" style={{ padding: 24, textAlign: "center", fontSize: 13 }}>Skriv för att söka i hela turneringen.</div>}
            {results.map((r, i) => (
              <button key={i} onClick={() => pick(r)} className="search-row">
                {r.kind === "player" && <Avatar name={r.label} photo={r.photo} color={r.color} size={30} />}
                {r.kind === "fbplayer" && <PlayerImg src={r.photo} name={r.label} size={30} radius={15} fontSize={11} />}
                {r.kind === "team" && <Flag iso={r.iso} code={r.code} size={22} />}
                {r.kind === "match" && (
                  <span style={{ display: "inline-flex", gap: 2 }}>
                    <Flag iso={r.iso1} size={18} /><Flag iso={r.iso2} size={18} />
                  </span>
                )}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.label}</span>
                  <span className="dim" style={{ fontSize: 11.5 }}>{r.sub}</span>
                </span>
                <span className="kicker" style={{ fontSize: 9 }}>{r.kind === "player" ? "Tippare" : r.kind === "fbplayer" ? "Spelare" : r.kind === "team" ? "Lag" : "Match"}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <style>{`
        .search-row{ width:100%; display:flex; align-items:center; gap:11px; padding:10px 16px; text-align:left; border-bottom:1px solid var(--line); transition:background .12s; }
        .search-row:hover{ background:var(--surface-2); }
      `}</style>
    </div>
  );
}
