import type { PlayerRecord, PlayersDb } from "../data/types";

export const espnHeadshot = (espnId?: string | null) =>
  espnId ? `https://a.espncdn.com/i/headshots/soccer/players/full/${espnId}.png` : null;

// Best available photo URL for a player record, in quality order:
// TheSportsDB cutout/render → Wikipedia → TheSportsDB thumb → ESPN headshot.
export function bestPhoto(p?: PlayerRecord | null): string | null {
  if (!p) return null;
  // p.photo is the verified-working URL (fix_players.py); prefer it, then fall back.
  return p.photo || p.cutout || p.render || p.wiki || p.thumb || p.espnPhoto || espnHeadshot(p.espnId) || null;
}

// Photo for a lineup player. Uses the same robust resolver as the player sheet
// (exact name → fuzzy last-name → espnId) so a pitch player whose FotMob name
// spelling differs from the db key — and has no espnId on the coords path — still
// gets the photo it clearly has when you open the player.
export function lineupPhoto(name: string, espnId: string | null | undefined, db: PlayersDb | null): string | null {
  return bestPhoto(findPlayer(name, db, espnId)) || espnHeadshot(espnId);
}

// Ordered list of photo candidates for a lineup player, tried in order until one
// loads (the pitch/bench img falls through on error). CONFIDENT matches only —
// exact name, ESPN id, or accent-insensitive exact name — never the loose surname
// fuzzy that findPlayer allows: on the pitch that would paint the wrong player's
// face (the "fel bild på spelare" bug). If we can't confidently identify the
// player we return [] and the pitch shows their number/initials instead. (ESPN's
// headshot CDN 404s for these players, so photos come from the curated db.)
export function lineupPhotoSources(name: string, espnId: string | null | undefined, db: PlayersDb | null): string[] {
  if (!db) return [];
  let rec: PlayerRecord | undefined = db[name];
  if (!rec && espnId != null && espnId !== "") {
    const eid = String(espnId);
    for (const key of Object.keys(db)) {
      if (String(db[key].espnId) === eid) { rec = db[key]; break; }
    }
  }
  if (!rec) {
    const n = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    for (const key of Object.keys(db)) {
      if (key.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") === n) { rec = db[key]; break; }
    }
  }
  if (!rec) return [];
  const out: string[] = [];
  for (const u of [rec.photo, rec.cutout, rec.render, rec.wiki, rec.thumb, rec.espnPhoto]) if (u) out.push(u);
  return [...new Set(out)];
}

// Resolve a player record from players.json by name (with a light last-name
// fuzzy fallback) or, failing that, by ESPN id — so a lineup player whose name
// doesn't exactly match a db key still resolves to the right record.
export function findPlayer(name: string, db: PlayersDb | null, espnId?: string | null): (PlayerRecord & { name: string }) | null {
  if (!db) return null;
  // 1. Exact key.
  if (db[name]) return { name, ...db[name] };
  // 2. ESPN id — the reliable identity for ESPN-sourced players (correct even when
  //    the name spelling differs). MUST come BEFORE the fuzzy name match: a light
  //    surname match maps a common last name (e.g. "Silva", "Hernández") to the
  //    wrong player and so the wrong photo — the bug behind "fel bild på spelare".
  if (espnId != null && espnId !== "") {
    const eid = String(espnId);
    for (const key of Object.keys(db)) {
      if (String(db[key].espnId) === eid) return { name: key, ...db[key] };
    }
  }
  // 3. Name match: accent-insensitive exact, then a light surname fuzzy (last resort).
  const n = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  for (const key of Object.keys(db)) {
    const k = key.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (k === n || k.endsWith(" " + n) || n.endsWith(" " + k)) return { name: key, ...db[key] };
  }
  return null;
}
