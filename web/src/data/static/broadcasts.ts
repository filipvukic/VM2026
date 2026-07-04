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

// Knockout broadcasters are assigned by SLOT (kickoff date+time), NOT by the teams —
// so this is keyed by the match's UTC kickoff as "YYYY-MM-DDTHH:MM". This is more
// robust than the derived FIFA match number (which reaches a match through a fragile
// team→bracket-slot lookup). Verified 2026-07-04 against SVT's own WC schedule
// (svt.se), cross-confirmed by vm-fotboll.se for the later rounds. SVT is free.
// NOTE: SVT/TV4 have said the split can shift if SWEDEN reaches the knockouts (a
// potential Sweden match is pre-allocated to a specific channel); update then.
const KO_BROADCAST_BY_SLOT: Record<string, Broadcaster> = {
  // Round of 16
  "2026-07-04T17:00": "tv4", // Canada–Marocko
  "2026-07-04T21:00": "svt", // Paraguay–Frankrike
  "2026-07-05T20:00": "tv4", // Brasilien–Norge
  "2026-07-06T00:00": "svt", // Mexiko–England
  "2026-07-06T19:00": "tv4", // Portugal–Spanien
  "2026-07-07T00:00": "tv4", // USA–Belgien
  "2026-07-07T16:00": "tv4", // Argentina–Egypten
  "2026-07-07T20:00": "svt", // Schweiz–Colombia
  // Quarter-finals
  "2026-07-09T20:00": "tv4",
  "2026-07-10T19:00": "svt",
  "2026-07-11T21:00": "tv4",
  "2026-07-12T01:00": "svt",
  // Semi-finals
  "2026-07-14T19:00": "svt",
  "2026-07-15T19:00": "tv4",
  // Bronze + Final
  "2026-07-18T21:00": "svt", // bronsmatch
  "2026-07-19T19:00": "tv4", // final
};

// "YYYY-MM-DDTHH:MM" in UTC — the KO_BROADCAST_BY_SLOT key for a kickoff.
function koSlotKey(kickoff?: Date | null): string {
  if (!kickoff || isNaN(kickoff.getTime())) return "";
  return kickoff.toISOString().slice(0, 16);
}

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
  kickoff?: Date | null
): BroadcastInfo {
  void homeName; void awayName; // names no longer needed (we link to the WC hub, not a search)
  const svtInfo: BroadcastInfo = { broadcaster: "svt", label: "SVT", channels: ["SVT1/SVT2", "SVT Play"], url: SVT_HUB, free: true };
  const tv4Info: BroadcastInfo = { broadcaster: "tv4", label: "TV4", channels: ["TV4", "TV4 Play"], url: TV4_HUB, free: false };
  // Knockout: look up by match slot (kickoff date+time).
  const slot = KO_BROADCAST_BY_SLOT[koSlotKey(kickoff)];
  if (slot) return slot === "svt" ? svtInfo : tv4Info;
  // Group stage: the hand-kept team-pair table.
  const key = homeTla && awayTla ? [homeTla.toUpperCase(), awayTla.toUpperCase()].sort().join("|") : "";
  const b = key ? BY_TLA_PAIR[key] : undefined;
  if (b === "svt") return svtInfo;
  if (b === "tv4") return tv4Info;
  // Truly unknown (e.g. a knockout slot we don't have yet) → offer both.
  return { broadcaster: null, label: "SVT eller TV4", channels: ["SVT Play", "TV4 Play"], url: SVT_HUB, free: true, tv4Url: TV4_HUB };
}
