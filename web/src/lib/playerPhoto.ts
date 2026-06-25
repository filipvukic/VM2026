import type { MatchStatsIndex, PlayerRecord, PlayersDb } from "../data/types";

type Rec = PlayerRecord & { name: string };
const pnorm = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Index the player DB ONCE per db object (it's loaded once and stable) so each
// lookup is O(1) instead of scanning all ~1250 keys. Lineups call this per player,
// so the old per-call scans were ~27k iterations per pitch render.
const DB_INDEX = new WeakMap<object, { byEspn: Map<string, Rec>; byNorm: Map<string, Rec> }>();
function dbIndex(db: PlayersDb) {
  let idx = DB_INDEX.get(db);
  if (idx) return idx;
  const byEspn = new Map<string, Rec>();
  const byNorm = new Map<string, Rec>();
  for (const key of Object.keys(db)) {
    const rec = { name: key, ...db[key] } as Rec;
    const e = db[key].espnId;
    if (e != null && String(e) !== "" && !byEspn.has(String(e))) byEspn.set(String(e), rec);
    const n = pnorm(key);
    if (!byNorm.has(n)) byNorm.set(n, rec);
  }
  idx = { byEspn, byNorm };
  DB_INDEX.set(db, idx);
  return idx;
}

export const espnHeadshot = (espnId?: string | null) =>
  espnId ? `https://a.espncdn.com/i/headshots/soccer/players/full/${espnId}.png` : null;

// FotMob's player image, keyed by the FotMob player id (our matchstats `optaId`).
// This is the most reliable source for lineup photos: the id comes from the SAME
// FotMob feed as the line-up, so it can't show the wrong player — unlike some
// stored db photos (e.g. Pedri's db photo was a different, older player).
export const fotmobImage = (id?: string | number | null) =>
  id != null && id !== "" ? `https://images.fotmob.com/image_resources/playerimages/${id}.png` : null;

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
export function lineupPhotoSources(name: string, espnId: string | null | undefined, db: PlayersDb | null, fotmobId?: string | number | null): string[] {
  const out: string[] = [];
  // FotMob photo first — keyed by the FotMob id, it's guaranteed the right player
  // and overrides any wrong stored db photo. If it 404/403s, the img falls through.
  const fm = fotmobImage(fotmobId);
  if (fm) out.push(fm);
  if (!db) return out;
  const idx = dbIndex(db);
  // Confident match only (exact key → espnId → accent-insensitive exact), all O(1).
  let rec: PlayerRecord | undefined = db[name];
  if (!rec && espnId != null && espnId !== "") rec = idx.byEspn.get(String(espnId));
  if (!rec) rec = idx.byNorm.get(pnorm(name));
  if (!rec) return [...new Set(out)];
  for (const u of [rec.photo, rec.cutout, rec.render, rec.wiki, rec.thumb, rec.espnPhoto]) if (u) out.push(u);
  return [...new Set(out)];
}

// Normalisation matching the matchstats index keys (build_matchstats `norm`), so a
// player's FotMob id can be looked up by name.
export const idxNorm = (s: string) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/&/g, "and").replace(/[^a-z0-9]/g, "");

// THE canonical photo source list for a football player — use this EVERYWHERE a
// player is shown (bonus page, scorer lists, profile sheet…) so the picture never
// changes between a list and the player's own sheet. Priority: FotMob image (keyed
// by the FotMob id from the stats index — the right player, fixes wrong db photos) →
// curated db photo → ESPN headshot. `fmId` overrides the lookup (e.g. from a line-up).
export function playerPhotoSources(
  name: string,
  db: PlayersDb | null,
  statsIndex?: MatchStatsIndex | null,
  espnId?: string | null,
  fmId?: string | null,
): string[] {
  const p = findPlayer(name, db, espnId);
  const id = fmId ?? statsIndex?.players[idxNorm(p?.name || name)]?.fmId;
  return [fotmobImage(id), bestPhoto(p), espnHeadshot(espnId)].filter(Boolean) as string[];
}

// Resolve a player record from players.json by name (with a light last-name
// fuzzy fallback) or, failing that, by ESPN id — so a lineup player whose name
// doesn't exactly match a db key still resolves to the right record.
export function findPlayer(name: string, db: PlayersDb | null, espnId?: string | null): (PlayerRecord & { name: string }) | null {
  if (!db) return null;
  // 1. Exact key.
  if (db[name]) return { name, ...db[name] };
  const idx = dbIndex(db);
  // 2. ESPN id — the reliable identity for ESPN-sourced players (O(1)). MUST come
  //    BEFORE the fuzzy name match: a light surname match maps a common last name
  //    (e.g. "Silva", "Hernández") to the wrong player → wrong photo.
  if (espnId != null && espnId !== "") {
    const r = idx.byEspn.get(String(espnId));
    if (r) return r;
  }
  // 3. Accent-insensitive exact (O(1)).
  const n = pnorm(name);
  const exact = idx.byNorm.get(n);
  if (exact) return exact;
  // 4. Light surname fuzzy — last resort, only for the rare unmatched player.
  for (const key of Object.keys(db)) {
    const k = pnorm(key);
    if (k.endsWith(" " + n) || n.endsWith(" " + k)) return { name: key, ...db[key] };
  }
  return null;
}
