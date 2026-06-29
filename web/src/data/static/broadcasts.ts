// Where each WC 2026 match airs on Swedish TV. SVT and TV4 split the rights:
// TV4 has the bulk of the group stage (TV4 / TV4 Play), SVT the rest (SVT1 / SVT2 /
// SVT Play — free). There's no broadcaster field in the data feed, so this is a
// hand-kept table, seeded from fotbolldirekt.se's group-stage TV listing (2026).
//
// Keyed by the two teams' TLAs (uppercase, sorted, "|"-joined) — a group pairing is
// unique, so this is stable across the data feed's id churn. Knockout matches (teams
// still TBD) aren't listed; they fall back to the generic "SVT / TV4" links. To fix
// or add a match, just edit/add its "TLA|TLA": "svt"|"tv4" entry below.

export type Broadcaster = "svt" | "tv4";

// WC pages on each platform (every match is listed here as a video).
const SVT_HUB = "https://www.svtplay.se/fifa-fotbolls-vm-2026";
const TV4_HUB = "https://www.tv4play.se/kategorier/fifa-fotbolls-vm-2026";
// SVT Play's search reliably surfaces THIS match by the two teams' Swedish names
// (e.g. ?q=Sverige+Tunisien) → lands right on the match. TV4 Play's search does NOT
// index the matches (returns 0 hits), so for TV4 we link to the WC page that lists
// them rather than a dead search.
const svtSearch = (home: string, away: string) =>
  `https://www.svtplay.se/sok?q=${encodeURIComponent(home)}+${encodeURIComponent(away)}`;

const BY_TLA_PAIR: Record<string, Broadcaster> = {
  "ALG|ARG": "tv4",
  "ALG|AUT": "tv4",
  "ALG|JOR": "tv4",
  "ARG|AUT": "svt",
  "ARG|JOR": "tv4",
  "AUS|PAR": "tv4",
  "AUS|TUR": "tv4",
  "AUS|USA": "svt",
  "AUT|JOR": "tv4",
  "BEL|EGY": "svt",
  "BEL|IRN": "tv4",
  "BEL|NZL": "tv4",
  "BIH|CAN": "svt",
  "BIH|QAT": "tv4",
  "BIH|SUI": "tv4",
  "BRA|HAI": "tv4",
  "BRA|MAR": "tv4",
  "BRA|SCO": "tv4",
  "CAN|QAT": "tv4",
  "CAN|SUI": "tv4",
  "CIV|CUW": "svt",
  "CIV|ECU": "tv4",
  "CIV|GER": "tv4",
  "COD|COL": "svt",
  "COD|POR": "tv4",
  "COD|UZB": "tv4",
  "COL|POR": "tv4",
  "COL|UZB": "tv4",
  "CPV|ESP": "svt",
  "CPV|KSA": "tv4",
  "CPV|URU": "tv4",
  "CRO|ENG": "tv4",
  "CRO|GHA": "svt",
  "CRO|PAN": "tv4",
  "CUW|ECU": "tv4",
  "CUW|GER": "tv4",
  "CZE|KOR": "tv4",
  "CZE|MEX": "svt",
  "CZE|RSA": "tv4",
  "ECU|GER": "svt",
  "EGY|IRN": "tv4",
  "EGY|NZL": "tv4",
  "ENG|GHA": "svt",
  "ENG|PAN": "svt",
  "ESP|KSA": "tv4",
  "ESP|URU": "tv4",
  "FRA|IRQ": "svt",
  "FRA|NOR": "tv4",
  "FRA|SEN": "svt",
  "GHA|PAN": "tv4",
  "HAI|MAR": "tv4",
  "HAI|SCO": "svt",
  "IRN|NZL": "tv4",
  "IRQ|NOR": "tv4",
  "IRQ|SEN": "tv4",
  "JPN|NED": "tv4",
  "JPN|SWE": "svt",
  "JPN|TUN": "svt",
  "KOR|MEX": "tv4",
  "KOR|RSA": "svt",
  "KSA|URU": "tv4",
  "MAR|SCO": "svt",
  "MEX|RSA": "tv4",
  "NED|SWE": "tv4",
  "NED|TUN": "svt",
  "NOR|SEN": "svt",
  "PAR|TUR": "tv4",
  "PAR|USA": "tv4",
  "POR|UZB": "svt",
  "QAT|SUI": "tv4",
  "SWE|TUN": "svt",
  "TUR|USA": "tv4",
};

export interface BroadcastInfo {
  /** Known channel group, or null when we don't have a specific listing. */
  broadcaster: Broadcaster | null;
  /** Display label: "SVT", "TV4", or "SVT / TV4" when unknown. */
  label: string;
  /** Channels to show as chips. */
  channels: string[];
  /** Where to watch (the broadcaster's WC hub on its Play service). */
  url: string;
  /** SVT broadcasts are free. */
  free: boolean;
  /** For matches not in the hand-kept table (knockouts): the TV4 link, so the view can
   *  offer BOTH platforms (rights are split and we have no per-match KO listing). */
  tv4Url?: string;
}

// Look up where a match airs from its two team codes (the frontend's m.home /
// m.away are the uppercase TLAs). Pass the teams' Swedish names so an SVT match
// links straight to it via SVT Play search; a TV4 match links to TV4's WC page
// (its search doesn't surface matches). Unknown pairings (knockouts) → generic.
export function broadcastForPair(
  homeTla?: string | null,
  awayTla?: string | null,
  homeName?: string | null,
  awayName?: string | null
): BroadcastInfo {
  const key = homeTla && awayTla ? [homeTla.toUpperCase(), awayTla.toUpperCase()].sort().join("|") : "";
  const b = key ? BY_TLA_PAIR[key] : undefined;
  const svt = homeName && awayName ? svtSearch(homeName, awayName) : SVT_HUB;
  if (b === "svt") return { broadcaster: "svt", label: "SVT", channels: ["SVT1/SVT2", "SVT Play"], url: svt, free: true };
  if (b === "tv4") return { broadcaster: "tv4", label: "TV4", channels: ["TV4", "TV4 Play"], url: TV4_HUB, free: false };
  return { broadcaster: null, label: "SVT eller TV4", channels: ["SVT Play", "TV4 Play"], url: svt, free: true, tv4Url: TV4_HUB };
}
