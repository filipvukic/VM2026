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

// Each platform's WC page (every match is listed here as a video). These are the
// canonical pages each app registers as universal/app links — so on mobile the "Öppna"
// button opens the SVT Play / TV4 Play APP straight to the WC section (rather than the
// browser, which a /sok search page tends to open). We can't deep-link the exact match
// stream — neither feed exposes a per-match video id in our data.
const SVT_HUB = "https://www.svtplay.se/fifa-fotbolls-vm-2026";
const TV4_HUB = "https://www.tv4play.se/kategorier/fifa-fotbolls-vm-2026";

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

// Knockout matches are assigned to SVT/TV4 by their SLOT (FIFA match number), not by
// the teams — so this is keyed by m.fifa. From SVT's own WC schedule (svt.se) cross-
// checked against the FIFA "W"-notation (e.g. R16 89 = W73–W75, QF 97 = W89–W90), which
// lines up exactly with the bracket. R32 = 73–88, R16 = 89–96, QF = 97–100, SF = 101–102,
// bronze = 103, final = 104.
const KO_BROADCAST: Record<number, Broadcaster> = {
  // Round of 32
  74: "tv4", 75: "svt", 76: "svt", 77: "tv4", 78: "tv4", 79: "tv4", 80: "svt", 81: "tv4",
  82: "tv4", 83: "svt", 84: "tv4", 85: "tv4", 86: "tv4", 87: "svt", 88: "svt",
  // Round of 16
  89: "tv4", 90: "svt", 91: "tv4", 92: "svt", 93: "tv4", 94: "tv4", 95: "tv4", 96: "svt",
  // Quarter-finals · Semi-finals · Bronze · Final
  97: "tv4", 98: "svt", 99: "tv4", 100: "svt", 101: "svt", 102: "tv4", 103: "svt", 104: "tv4",
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
  awayName?: string | null,
  fifa?: number | null
): BroadcastInfo {
  void homeName; void awayName; // names no longer needed (we link to the WC hub, not a search)
  const svtInfo: BroadcastInfo = { broadcaster: "svt", label: "SVT", channels: ["SVT1/SVT2", "SVT Play"], url: SVT_HUB, free: true };
  const tv4Info: BroadcastInfo = { broadcaster: "tv4", label: "TV4", channels: ["TV4", "TV4 Play"], url: TV4_HUB, free: false };
  // Knockout: look up by match slot (FIFA number).
  if (fifa != null && KO_BROADCAST[fifa]) return KO_BROADCAST[fifa] === "svt" ? svtInfo : tv4Info;
  // Group stage: the hand-kept team-pair table.
  const key = homeTla && awayTla ? [homeTla.toUpperCase(), awayTla.toUpperCase()].sort().join("|") : "";
  const b = key ? BY_TLA_PAIR[key] : undefined;
  if (b === "svt") return svtInfo;
  if (b === "tv4") return tv4Info;
  // Truly unknown (e.g. a knockout slot we don't have yet) → offer both.
  return { broadcaster: null, label: "SVT eller TV4", channels: ["SVT Play", "TV4 Play"], url: SVT_HUB, free: true, tv4Url: TV4_HUB };
}
