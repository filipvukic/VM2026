// WC history, FIFA ranking, and team details — ported verbatim from
// index.html ~1774-1869. Used by odds model + Team/Player sheets.

export interface WcHistoryEntry {
  titles: number;
  lastTitle?: number;
  runnerUp?: number;
  third?: number;
  semis?: number;
  apps?: number;
  best?: string;
}

export const WC_HISTORY: Record<string, WcHistoryEntry> = {
  BRA: { titles: 5, lastTitle: 2002, runnerUp: 2, third: 2, semis: 11, apps: 22, best: "Vinnare (1958, 1962, 1970, 1994, 2002)" },
  GER: { titles: 4, lastTitle: 2014, runnerUp: 4, third: 4, semis: 13, apps: 20, best: "Vinnare (1954, 1974, 1990, 2014)" },
  ITA: { titles: 4, lastTitle: 2006, runnerUp: 2, third: 1, semis: 6, apps: 18, best: "Vinnare (1934, 1938, 1982, 2006)" },
  ARG: { titles: 3, lastTitle: 2022, runnerUp: 3, third: 0, semis: 6, apps: 18, best: "Vinnare (1978, 1986, 2022)" },
  FRA: { titles: 2, lastTitle: 2018, runnerUp: 2, third: 2, semis: 7, apps: 16, best: "Vinnare (1998, 2018)" },
  URU: { titles: 2, lastTitle: 1950, runnerUp: 0, third: 0, semis: 5, apps: 14, best: "Vinnare (1930, 1950)" },
  ENG: { titles: 1, lastTitle: 1966, runnerUp: 0, third: 0, semis: 3, apps: 16, best: "Vinnare (1966)" },
  ESP: { titles: 1, lastTitle: 2010, runnerUp: 0, third: 0, semis: 1, apps: 16, best: "Vinnare (2010)" },
  NED: { titles: 0, runnerUp: 3, third: 1, semis: 5, apps: 11, best: "Final 1974, 1978, 2010" },
  HUN: { titles: 0, runnerUp: 2, semis: 2, apps: 9, best: "Final 1938, 1954" },
  CZE: { titles: 0, runnerUp: 2, semis: 3, apps: 9, best: "Final 1934, 1962 (som Tjeckoslovakien)" },
  SWE: { titles: 0, runnerUp: 1, third: 2, semis: 4, apps: 12, best: "Final 1958, brons 1950, 1994" },
  CRO: { titles: 0, runnerUp: 1, third: 2, semis: 2, apps: 6, best: "Final 2018, brons 1998, 2022" },
  POR: { titles: 0, third: 1, semis: 2, apps: 8, best: "Brons 1966, fyra 2006" },
  POL: { titles: 0, third: 2, semis: 2, apps: 9, best: "Brons 1974, 1982" },
  BEL: { titles: 0, third: 1, semis: 2, apps: 14, best: "Brons 2018, fyra 1986" },
  AUT: { titles: 0, third: 1, semis: 1, apps: 7, best: "Brons 1954" },
  CHI: { titles: 0, third: 1, semis: 1, apps: 9, best: "Brons 1962 (hemmaplan)" },
  TUR: { titles: 0, third: 1, semis: 1, apps: 2, best: "Brons 2002" },
  USA: { titles: 0, third: 1, semis: 1, apps: 11, best: "Brons 1930 (medvärd 1994, 2026)" },
  KOR: { titles: 0, semis: 1, apps: 11, best: "Fyra 2002 (medvärd)" },
  MEX: { titles: 0, apps: 17, best: "Kvart 1970, 1986 (båda hemma)" },
  GHA: { titles: 0, apps: 4, best: "Kvart 2010" },
  SEN: { titles: 0, apps: 3, best: "Kvart 2002" },
  CMR: { titles: 0, apps: 8, best: "Kvart 1990" },
  CRC: { titles: 0, apps: 6, best: "Kvart 2014" },
  COL: { titles: 0, apps: 6, best: "Kvart 2014" },
  PAR: { titles: 0, apps: 8, best: "Kvart 2010" },
  JPN: { titles: 0, apps: 7, best: "Åttondel (2002, 2010, 2018, 2022)" },
  DEN: { titles: 0, apps: 5, best: "Kvart 1998" },
  MAR: { titles: 0, semis: 1, apps: 6, best: "Fyra 2022 (första AFC-/CAF-laget)" },
  AUS: { titles: 0, apps: 6, best: "Åttondel 2006, 2022" },
  IRN: { titles: 0, apps: 6 },
  TUN: { titles: 0, apps: 6 },
  NGA: { titles: 0, apps: 6, best: "Åttondel 1994, 1998, 2014" },
  SUI: { titles: 0, apps: 12, best: "Kvart 1934, 1938, 1954" },
  ALG: { titles: 0, apps: 4, best: "Åttondel 2014" },
  CIV: { titles: 0, apps: 3 },
  EGY: { titles: 0, apps: 3 },
  PAN: { titles: 0, apps: 1 },
  JOR: { titles: 0, apps: 0, best: "Debutant 2026" },
  UZB: { titles: 0, apps: 0, best: "Debutant 2026" },
  CAN: { titles: 0, apps: 2, best: "Gruppspel 1986, 2022 (medvärd 2026)" },
  KSA: { titles: 0, apps: 6, best: "Åttondel 1994" },
  ECU: { titles: 0, apps: 4, best: "Åttondel 2006" },
  RSA: { titles: 0, apps: 3 },
  HON: { titles: 0, apps: 3 },
  NZL: { titles: 0, apps: 2 },
  SRB: { titles: 0, apps: 4, best: "Som FR Jugoslavien: kvart 1990" },
};

// Official FIFA/Coca-Cola Men's World Ranking (keyed by OUR team TLAs). Updated each
// FIFA release (≈4×/year; next after this one is 20 Jul 2026).
export const FIFA_RANKING_DATE = "Juni 2026";
export const FIFA_RANKING: Record<string, number> = {
  ARG: 1, ESP: 2, FRA: 3, ENG: 4, POR: 5, BRA: 6, MAR: 7, NED: 8,
  BEL: 9, GER: 10, CRO: 11, COL: 13, MEX: 14, SEN: 15, URU: 16, USA: 17,
  JPN: 18, SUI: 19, IRN: 20, TUR: 22, ECU: 23, AUT: 24, KOR: 25, AUS: 27,
  ALG: 28, EGY: 29, CAN: 30, NOR: 31, CIV: 33, PAN: 34, SWE: 38, CZE: 40,
  PAR: 41, SCO: 42, TUN: 45, COD: 46, UZB: 50, QAT: 56, IRQ: 57, RSA: 60,
  KSA: 61, JOR: 63, BIH: 64, CPV: 67, GHA: 73, CUW: 82, HAI: 83, NZL: 85,
};

export interface TeamDetail {
  coach: string;
  stars: string[];
  form: string;
  fifaPts: number;
}

export const TEAM_DETAILS: Record<string, TeamDetail> = {
  ARG: { coach: "Lionel Scaloni", stars: ["Lionel Messi", "Lautaro Martínez", "Julián Álvarez"], form: "WWWDW", fifaPts: 1879 },
  FRA: { coach: "Didier Deschamps", stars: ["Kylian Mbappé", "Désiré Doué", "Aurélien Tchouaméni"], form: "WWWWL", fifaPts: 1859 },
  ESP: { coach: "Luis de la Fuente", stars: ["Lamine Yamal", "Rodri", "Pedri"], form: "WWWWW", fifaPts: 1855 },
  ENG: { coach: "Thomas Tuchel", stars: ["Jude Bellingham", "Harry Kane", "Cole Palmer"], form: "WWDWW", fifaPts: 1820 },
  BRA: { coach: "Carlo Ancelotti", stars: ["Vinícius Júnior", "Rodrygo", "Endrick"], form: "WDLWW", fifaPts: 1789 },
  POR: { coach: "Roberto Martínez", stars: ["Cristiano Ronaldo", "Bruno Fernandes", "Vitinha"], form: "WWWLW", fifaPts: 1772 },
  NED: { coach: "Ronald Koeman", stars: ["Virgil van Dijk", "Frenkie de Jong", "Cody Gakpo"], form: "WDWWW", fifaPts: 1754 },
  BEL: { coach: "Rudi Garcia", stars: ["Kevin De Bruyne", "Romelu Lukaku", "Jérémy Doku"], form: "WWLWD", fifaPts: 1735 },
  CRO: { coach: "Zlatko Dalić", stars: ["Luka Modrić", "Joško Gvardiol", "Mateo Kovačić"], form: "DWLDW", fifaPts: 1707 },
  ITA: { coach: "Gennaro Gattuso", stars: ["Federico Chiesa", "Nicolò Barella", "Gianluigi Donnarumma"], form: "WDWWL", fifaPts: 1718 },
  GER: { coach: "Julian Nagelsmann", stars: ["Florian Wirtz", "Jamal Musiala", "Kai Havertz"], form: "WWDWW", fifaPts: 1726 },
  COL: { coach: "Néstor Lorenzo", stars: ["James Rodríguez", "Luis Díaz", "Davinson Sánchez"], form: "WDWWL", fifaPts: 1721 },
  URU: { coach: "Marcelo Bielsa", stars: ["Federico Valverde", "Darwin Núñez", "Ronald Araújo"], form: "WLWDW", fifaPts: 1719 },
  MAR: { coach: "Walid Regragui", stars: ["Achraf Hakimi", "Hakim Ziyech", "Yassine Bounou"], form: "WWDWW", fifaPts: 1694 },
  MEX: { coach: "Javier Aguirre", stars: ["Hirving Lozano", "Edson Álvarez", "Raúl Jiménez"], form: "WDLWW", fifaPts: 1671 },
  JPN: { coach: "Hajime Moriyasu", stars: ["Takefusa Kubo", "Wataru Endo", "Kaoru Mitoma"], form: "WWWLW", fifaPts: 1666 },
  USA: { coach: "Mauricio Pochettino", stars: ["Christian Pulisic", "Weston McKennie", "Tyler Adams"], form: "WDLDW", fifaPts: 1660 },
  SUI: { coach: "Murat Yakin", stars: ["Granit Xhaka", "Manuel Akanji", "Breel Embolo"], form: "DWDLW", fifaPts: 1670 },
  IRN: { coach: "Amir Ghalenoei", stars: ["Mehdi Taremi", "Sardar Azmoun", "Alireza Jahanbakhsh"], form: "WWLWW", fifaPts: 1653 },
  KOR: { coach: "Hong Myung-bo", stars: ["Son Heung-min", "Kim Min-jae", "Lee Kang-in"], form: "WLWDW", fifaPts: 1639 },
  SEN: { coach: "Pape Thiaw", stars: ["Sadio Mané", "Kalidou Koulibaly", "Édouard Mendy"], form: "WWDWL", fifaPts: 1651 },
  AUS: { coach: "Tony Popovic", stars: ["Mat Ryan", "Ajdin Hrustic", "Mathew Leckie"], form: "WLDWW", fifaPts: 1551 },
  CAN: { coach: "Jesse Marsch", stars: ["Alphonso Davies", "Jonathan David", "Stephen Eustáquio"], form: "WLWDW", fifaPts: 1573 },
  SWE: { coach: "Graham Potter", stars: ["Alexander Isak", "Viktor Gyökeres", "Dejan Kulusevski"], form: "LWWDW", fifaPts: 1517 },
  NOR: { coach: "Ståle Solbakken", stars: ["Erling Haaland", "Martin Ødegaard", "Alexander Sørloth"], form: "WWWDW", fifaPts: 1531 },
};
