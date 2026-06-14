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

// Photo for a lineup player by name (+ espnId fallback for players not in db).
export function lineupPhoto(name: string, espnId: string | null | undefined, db: PlayersDb | null): string | null {
  const p = db?.[name];
  return bestPhoto(p) || espnHeadshot(espnId);
}

// Resolve a player record from players.json by name (with a light last-name
// fuzzy fallback) or, failing that, by ESPN id — so a lineup player whose name
// doesn't exactly match a db key still resolves to the right record.
export function findPlayer(name: string, db: PlayersDb | null, espnId?: string | null): (PlayerRecord & { name: string }) | null {
  if (!db) return null;
  if (db[name]) return { name, ...db[name] };
  const n = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  for (const key of Object.keys(db)) {
    const k = key.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (k === n || k.endsWith(" " + n) || n.endsWith(" " + k)) return { name: key, ...db[key] };
  }
  if (espnId) {
    const eid = String(espnId);
    for (const key of Object.keys(db)) {
      if (String(db[key].espnId) === eid) return { name: key, ...db[key] };
    }
  }
  return null;
}
