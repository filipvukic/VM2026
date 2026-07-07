// Name/code maps — ported verbatim from the legacy adapter (index.html ~144-319).
// Do not "tidy" these; missing aliases silently mis-code teams or drop tips.
import type { Team } from "../types";

// Prize tiers are no longer hardcoded — the engine computes them from the real
// pot (an exact-summing 50/30/20 split) and the UI reads ds.pot.split. See build.ts.
export const GROUP_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

export const TLA_TO_ISO: Record<string, string | null> = {
  USA: "us", MEX: "mx", CAN: "ca",
  BRA: "br", ARG: "ar", URU: "uy", COL: "co", ECU: "ec", PAR: "py", CHI: "cl", PER: "pe", VEN: "ve", BOL: "bo",
  ENG: "gb-eng", SCO: "gb-sct", WAL: "gb-wls", NIR: "gb-nir", IRL: "ie",
  FRA: "fr", GER: "de", ITA: "it", ESP: "es", POR: "pt", NED: "nl", BEL: "be",
  CRO: "hr", SUI: "ch", AUT: "at", POL: "pl", DEN: "dk", SWE: "se", NOR: "no",
  FIN: "fi", ISL: "is", HUN: "hu", CZE: "cz", SVK: "sk", SVN: "si", ROU: "ro",
  GRE: "gr", BUL: "bg", SRB: "rs", UKR: "ua", BIH: "ba", ALB: "al", KOS: "xk",
  MKD: "mk", MNE: "me", TUR: "tr", LUX: "lu",
  MAR: "ma", TUN: "tn", ALG: "dz", EGY: "eg", SEN: "sn", CIV: "ci", NGA: "ng",
  CMR: "cm", GHA: "gh", RSA: "za", COD: "cd", CGO: "cg", CPV: "cv", MLI: "ml", BFA: "bf",
  ANG: "ao", ZAM: "zm", GUI: "gn", GAB: "ga", LBY: "ly", BEN: "bj", TOG: "tg",
  JPN: "jp", KOR: "kr", KSA: "sa", IRN: "ir", IRQ: "iq", QAT: "qa", UAE: "ae",
  UZB: "uz", JOR: "jo", AUS: "au", CHN: "cn", THA: "th", VIE: "vn", IDN: "id",
  CRC: "cr", PAN: "pa", JAM: "jm", HAI: "ht", HON: "hn", SLV: "sv", GUA: "gt",
  TRI: "tt", CUW: "cw", CUR: "cw", SUR: "sr", NZL: "nz",
  PO1: null, PO2: null, PO3: null,
};

export const NAME_TO_ISO: Record<string, string> = {
  "united states": "us", mexico: "mx", canada: "ca",
  brazil: "br", argentina: "ar", uruguay: "uy", colombia: "co", ecuador: "ec",
  paraguay: "py", chile: "cl", peru: "pe", venezuela: "ve", bolivia: "bo",
  england: "gb-eng", scotland: "gb-sct", wales: "gb-wls", "northern ireland": "gb-nir",
  ireland: "ie", "republic of ireland": "ie",
  france: "fr", germany: "de", italy: "it", spain: "es", portugal: "pt",
  netherlands: "nl", belgium: "be", croatia: "hr", switzerland: "ch", austria: "at",
  poland: "pl", denmark: "dk", sweden: "se", norway: "no",
  hungary: "hu", "czech republic": "cz", czechia: "cz",
  romania: "ro", greece: "gr", serbia: "rs", ukraine: "ua",
  "bosnia and herzegovina": "ba", "bosnia-herzegovina": "ba", albania: "al",
  "north macedonia": "mk", montenegro: "me", turkey: "tr", "türkiye": "tr",
  morocco: "ma", tunisia: "tn", algeria: "dz", egypt: "eg", senegal: "sn",
  "ivory coast": "ci", "côte d'ivoire": "ci", nigeria: "ng",
  cameroon: "cm", ghana: "gh", "south africa": "za", "dr congo": "cd", "congo dr": "cd",
  "cape verde": "cv", mali: "ml",
  japan: "jp", "south korea": "kr", "korea republic": "kr", "saudi arabia": "sa",
  iran: "ir", iraq: "iq", qatar: "qa", "united arab emirates": "ae",
  uzbekistan: "uz", jordan: "jo", australia: "au",
  "costa rica": "cr", panama: "pa", jamaica: "jm", haiti: "ht", honduras: "hn",
  "el salvador": "sv", guatemala: "gt", "trinidad and tobago": "tt",
  "curaçao": "cw", curacao: "cw", "new zealand": "nz",
};

export const SV_TO_TLA: Record<string, string> = {
  argentina: "ARG", frankrike: "FRA", spanien: "ESP", england: "ENG",
  brasilien: "BRA", portugal: "POR", "nederländerna": "NED", usa: "USA",
  mexico: "MEX", mexiko: "MEX", kanada: "CAN", tyskland: "GER", belgien: "BEL",
  kroatien: "CRO", uruguay: "URU", colombia: "COL", japan: "JPN",
  marocko: "MAR", senegal: "SEN", schweiz: "SUI", danmark: "DEN",
  sydkorea: "KOR", ecuador: "ECU", "österrike": "AUT", australien: "AUS",
  norge: "NOR", sverige: "SWE", polen: "POL", serbien: "SRB",
  turkiet: "TUR", egypten: "EGY", nigeria: "NGA", elfenbenskusten: "CIV",
  iran: "IRN", panama: "PAN", paraguay: "PAR", ungern: "HUN",
  "nya zeeland": "NZL", saudiarabien: "KSA", ghana: "GHA", kamerun: "CMR",
  uzbekistan: "UZB", jordanien: "JOR", sydafrika: "RSA", algeriet: "ALG",
  honduras: "HON", peru: "PER", chile: "CHI",
  tjeckien: "CZE", bosnien: "BIH", qatar: "QAT", irak: "IRQ",
  haiti: "HAI", skottland: "SCO", "kap verde": "CPV", tunisien: "TUN",
  "dr kongo": "COD", curacao: "CUR",
};

export const EN_TO_SV: Record<string, string> = {
  "United States": "USA", Mexico: "Mexico", Canada: "Kanada", Brazil: "Brasilien",
  Argentina: "Argentina", Uruguay: "Uruguay", Colombia: "Colombia", Ecuador: "Ecuador",
  Paraguay: "Paraguay", Chile: "Chile", Peru: "Peru", Venezuela: "Venezuela",
  England: "England", Scotland: "Skottland", Wales: "Wales",
  France: "Frankrike", Germany: "Tyskland", Italy: "Italien", Spain: "Spanien",
  Portugal: "Portugal", Netherlands: "Nederländerna", Belgium: "Belgien",
  Croatia: "Kroatien", Switzerland: "Schweiz", Austria: "Österrike",
  Poland: "Polen", Denmark: "Danmark", Sweden: "Sverige", Norway: "Norge",
  "Czech Republic": "Tjeckien", Czechia: "Tjeckien",
  Serbia: "Serbien", Ukraine: "Ukraina",
  "Bosnia and Herzegovina": "Bosnien", "Bosnia-Herzegovina": "Bosnien",
  Turkey: "Turkiet", "Türkiye": "Turkiet",
  Morocco: "Marocko", Tunisia: "Tunisien", Algeria: "Algeriet", Egypt: "Egypten",
  Senegal: "Senegal", "Ivory Coast": "Elfenbenskusten", "Côte d'Ivoire": "Elfenbenskusten",
  Nigeria: "Nigeria", Cameroon: "Kamerun", Ghana: "Ghana", "South Africa": "Sydafrika",
  "DR Congo": "DR Kongo", "Congo DR": "DR Kongo", "Cape Verde": "Kap Verde",
  Japan: "Japan", "South Korea": "Sydkorea", "Korea Republic": "Sydkorea",
  "Saudi Arabia": "Saudiarabien", Iran: "Iran", Iraq: "Irak", Qatar: "Qatar",
  Uzbekistan: "Uzbekistan", Jordan: "Jordanien", Australia: "Australien",
  "Costa Rica": "Costa Rica", Panama: "Panama", Jamaica: "Jamaica", Haiti: "Haiti",
  Honduras: "Honduras", "Curaçao": "Curaçao", Curacao: "Curaçao",
  "New Zealand": "Nya Zeeland",
};

// Garbled/truncated player names from the live feed → correct spelling. Applied to
// line-ups in build.ts so the pitch, the photo lookup and the profile all agree.
const NAME_FIX: Record<string, string> = {
  "Bruno Fernanch": "Bruno Fernandes",
};
export const fixName = (n?: string | null): string => (n ? NAME_FIX[n] || n : n || "");

export function isoFor(name?: string | null, tla?: string | null): string | null {
  if (tla && TLA_TO_ISO[String(tla).toUpperCase()] !== undefined) {
    const v = TLA_TO_ISO[String(tla).toUpperCase()];
    if (v) return v;
  }
  if (name) {
    const key = String(name).toLowerCase().trim();
    if (NAME_TO_ISO[key]) return NAME_TO_ISO[key];
    const simple = key.normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (NAME_TO_ISO[simple]) return NAME_TO_ISO[simple];
  }
  return null;
}

export function brandFromName(name?: string | null): [string, string] {
  let h = 0;
  const s = name || "";
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  const hue1 = ((h % 360) + 360) % 360;
  const hue2 = (hue1 + 28) % 360;
  return [`hsl(${hue1} 55% 45%)`, `hsl(${hue2} 65% 38%)`];
}

export function codeFromName(name?: string | null): string {
  if (!name) return "TBD";
  const lc = String(name).toLowerCase();
  if (SV_TO_TLA[lc]) return SV_TO_TLA[lc];
  const cleaned = String(name).replace(/[^a-zA-ZåäöÅÄÖ ]/g, "").trim().toUpperCase();
  return cleaned.slice(0, 3) || "TBD";
}

export function teamCodeFromPick(pick: string | null | undefined, teams: Record<string, Team>): string | null {
  if (!pick) return null;
  const lc = String(pick).toLowerCase().trim();
  if (SV_TO_TLA[lc]) return SV_TO_TLA[lc];
  for (const code in teams) {
    if (teams[code].name && teams[code].name.toLowerCase() === lc) return code;
  }
  if (NAME_TO_ISO[lc]) {
    const iso = NAME_TO_ISO[lc];
    for (const code in teams) {
      if (teams[code].iso === iso) return code;
    }
  }
  return null;
}
