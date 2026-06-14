import type { PlayerRecord, PlayersDb } from "../data/types";

export const espnHeadshot = (espnId?: string | null) =>
  espnId ? `https://a.espncdn.com/i/headshots/soccer/players/full/${espnId}.png` : null;

// Best available photo URL for a player record, in quality order:
// TheSportsDB cutout/render → Wikipedia → TheSportsDB thumb → ESPN headshot.
export function bestPhoto(p?: PlayerRecord | null): string | null {
  if (!p) return null;
  return p.cutout || p.render || p.wiki || p.thumb || p.espnPhoto || espnHeadshot(p.espnId) || null;
}

// Photo for a lineup player by name (+ espnId fallback for players not in db).
export function lineupPhoto(name: string, espnId: string | null | undefined, db: PlayersDb | null): string | null {
  const p = db?.[name];
  return bestPhoto(p) || espnHeadshot(espnId);
}

// Resolve a player record from players.json with a light fuzzy fallback (last
// name match) so search hits like "mbappe" still find "Kylian Mbappé".
export function findPlayer(name: string, db: PlayersDb | null): (PlayerRecord & { name: string }) | null {
  if (!db) return null;
  if (db[name]) return { name, ...db[name] };
  const n = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  for (const key of Object.keys(db)) {
    const k = key.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (k === n || k.endsWith(" " + n) || n.endsWith(" " + k)) return { name: key, ...db[key] };
  }
  return null;
}
