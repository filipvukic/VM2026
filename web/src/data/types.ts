// ============================================================
// VM 2026 — data contracts
// RAW = shape of the committed JSON files (data.json / fixtures.json /
// players.json / odds.json). DERIVED = the model the UI consumes, produced
// by build() (a faithful TS port of the legacy window.VM.build adapter).
// ============================================================

// ---------- RAW (engine output) ----------

export interface RawScoreDetail {
  halfTime?: [number, number] | null;
  fullTime?: [number, number] | null;
  extraTime?: [number, number] | null;
  penalties?: [number, number] | null;
  duration?: string;
  winnerSide?: string | null;
}

export interface RawGoal {
  minute?: string | number;
  injuryTime?: number | null;
  team?: string;
  scorer?: string;
  assist?: string | null;
  type?: string;
  description?: string;
  score?: [number, number] | null;
  period?: number;
}

export interface RawBooking {
  minute?: string | number;
  team?: string;
  player?: string;
  card?: string;
  period?: number;
}

export interface RawSub {
  minute?: string | number;
  team?: string;
  playerIn?: string;
  playerOut?: string;
  period?: number;
}

export interface RawLineupPlayer {
  name: string;
  position?: string;
  positionName?: string;
  jersey?: string;
  shirtNumber?: string | number;
  subbedIn?: boolean;
  subbedOut?: boolean;
  espnId?: string;
}

export interface RawLineup {
  formation?: string;
  lineup?: RawLineupPlayer[];
  bench?: RawLineupPlayer[];
  coach?: string;
  tla?: string;
  _espnEventId?: string;
}

export interface RawVenue {
  stadium?: string;
  city?: string;
  country?: string;
  cc?: string;
}

export interface RawEspnOdds {
  homeML?: number;
  awayML?: number;
  spread?: string;
  overUnder?: number;
  overOdds?: number;
  underOdds?: number;
  provider?: string;
}

export interface RawFormEntry {
  date?: string;
  result?: string;
  gf?: number;
  ga?: number;
  home?: boolean;
}

export interface RawFixture {
  id: number;
  utcDate: string;
  stage: string;
  group?: string | null;
  home?: string;
  homeTla?: string;
  away?: string;
  awayTla?: string;
  status: string;
  score?: [number | null, number | null];
  scoreDetail?: RawScoreDetail | null;
  minute?: number | string | null;
  goals?: RawGoal[];
  bookings?: RawBooking[];
  subs?: RawSub[];
  venue?: RawVenue | null;
  referees?: { name: string; role?: string }[];
  odds?: { H?: number; D?: number; A?: number } | null;
  attendance?: number | null;
  espnOdds?: RawEspnOdds | null;
  homeLineup?: RawLineup | null;
  awayLineup?: RawLineup | null;
  homeStats?: Record<string, number | null>;
  awayStats?: Record<string, number | null>;
  homeForm?: RawFormEntry[];
  awayForm?: RawFormEntry[];
  cardOdds?: { home: number; draw: number; away: number };
  xg?: { home: number; away: number } | null;
  /** set by the client ESPN overlay — minute is the live ESPN clock (fresh), so
      the UI should NOT tick it forward from the (stale) engine timestamp. */
  _liveOverlay?: boolean;
}

export interface RawTip {
  name: string;
  tip: [number, number];
  points?: number;
}

export interface RawDataMatch {
  id: number;
  tips?: RawTip[];
  goals?: RawGoal[];
  bookings?: RawBooking[];
}

export interface RawGroupRow {
  team: string;
  tla?: string;
  played?: number;
  won?: number;
  draw?: number;
  lost?: number;
  gf?: number;
  ga?: number;
  gd?: number;
  points?: number;
}

export interface RawGroup {
  code: string;
  table?: RawGroupRow[];
}

export interface RawBonusDetailEntry {
  pick?: string;
  correct?: boolean;
  points?: number;
}

export type RawBonusKey =
  | "winner"
  | "silver"
  | "bronze"
  | "top_scorer"
  | "best_player"
  | "best_young"
  | "best_keeper";

export interface RawLeaderboardEntry {
  name: string;
  match_points?: number;
  bonus_points?: number;
  total?: number;
  exact_count?: number;
  bonus_detail?: Record<RawBonusKey, RawBonusDetailEntry>;
  rank?: number;
  prize?: number;
}

export interface RawTeamFormEntry {
  date?: string;
  competition?: string;
  opp?: string;
  oppTla?: string;
  gf?: number;
  ga?: number;
  r?: string;
}

export interface RawData {
  updated_at?: string;
  pot?: { per_player?: number; total?: number; currency?: string; split?: Record<string, number> };
  leaderboard?: RawLeaderboardEntry[];
  matches?: RawDataMatch[];
  groups?: RawGroup[];
  bonus_actual?: Record<RawBonusKey, string | null>;
  bonus_points?: Record<RawBonusKey, number>;
  awards_pending?: string[];
  unmatched_tips?: Record<string, number>;
  knockout_rule?: string;
  team_forms?: Record<string, RawTeamFormEntry[]>;
}

export interface PlayerRecord {
  photo?: string | null; // verified working URL (set by fix_players.py) — prefer this
  thumb?: string | null;
  cutout?: string | null;
  render?: string | null;
  wiki?: string | null;
  espnPhoto?: string | null;
  espnId?: string | null;
  team?: string | null;
  position?: string | null;
  nationality?: string | null;
  born?: string | null;
  birthPlace?: string | null;
  height?: string | null;
  weight?: string | null;
  foot?: string | null;
  natJersey?: string | null;
  teamBadge?: string | null;
  teamLeague?: string | null;
  teamCountry?: string | null;
}
export type PlayersDb = Record<string, PlayerRecord>;

export interface Coach {
  name: string;
  id?: number | null;
  age?: number | null;
  country?: string | null;
  countryCode?: string | null;
  photo?: string | null;
  /** Career record with THIS national team, straight from FotMob (not computed). */
  career?: {
    games: number;
    win: number;
    draw: number;
    loss: number;
    winPct: number | null;
  } | null;
}
export type CoachesDb = Record<string, Coach>; // keyed by team TLA

// ---- detailed match stats (FotMob, via matchstats/<fixtureId>.json) ----
export interface MatchTeamStat { key: string; label: string; home: number | string; away: number | string }
export interface MatchPlayerStat {
  optaId: string;
  name: string;
  tla: string | null;
  gk: boolean;
  pos?: string | null;
  shirt?: string | number | null;
  rating: number | null;
  stats: Record<string, number | string>;
}
export interface MatchShot {
  x: number; y: number; min: number | null; xg: number; tla: string | null;
  player: string; optaId: string; goal: boolean; onTarget: boolean; outcome: string;
}
export interface MatchHeatmap { viewBox: string; players: Record<string, [number, number][]> }
export interface MatchStatsDetail {
  fixtureId: number;
  fmMatchId?: number;
  homeTla: string;
  awayTla: string;
  finished: boolean;
  team: MatchTeamStat[];
  players: MatchPlayerStat[];
  shots: MatchShot[];
  heatmap: MatchHeatmap | null;
}
export interface MatchStatsIndex {
  fixtures: Record<string, { h: string; a: string; d: string }>;
  players: Record<string, { opta: string; name: string; fx: string[] }>;
}

export interface OddsFile {
  generated?: string;
  odds?: Record<string, { H?: number; D?: number; A?: number; home?: number; draw?: number; away?: number }>;
}

export interface RawInputs {
  data: RawData;
  fixtures: RawFixture[];
  players: PlayersDb | null;
}

// ---------- DERIVED (UI model) ----------

export interface Team {
  code: string;
  name: string;
  c1: string;
  c2: string;
  rating: number;
  group: string | null;
  pot: number;
  iso: string | null;
}

export interface MatchScorer {
  team: string | null;
  name: string;
  minute?: string | number;
  injuryTime?: number | null;
  pen: boolean;
  header: boolean;
  assist: string | null;
  score: [number, number] | null;
}

export interface MatchCardEvent {
  team: string | null;
  name: string;
  minute?: string | number;
  type: "red" | "yellow";
}

export interface MatchSub {
  team: string | null;
  minute?: string | number;
  playerIn?: string;
  playerOut?: string;
}

export interface MatchStats {
  poss: [number, number];
  xg: [number | null, number | null];
  shots: [number, number];
  sot: [number, number];
  corners: [number, number];
  pass: [number, number];
  fouls: [number, number];
  yellow: [number, number];
  red: [number, number];
  tackles: [number | null, number | null];
  interceptions: [number | null, number | null];
  clearances: [number | null, number | null];
  blockedShots: [number | null, number | null];
  longBalls: [number | null, number | null];
  crossPct: [number | null, number | null];
  offsides: [number | null, number | null];
  saves: [number | null, number | null];
  shotPct: [number | null, number | null];
}

export type MatchStatus = "played" | "live" | "upcoming";

export interface Match {
  id: string;
  stage: "group" | "ko";
  group: string | null;
  round: string;
  matchday?: number | null;
  fifa?: number | null;
  home: string | null;
  away: string | null;
  projHome?: string | null;
  projAway?: string | null;
  fromA?: string | null;
  fromB?: string | null;
  kickoff: Date;
  ga: number | null;
  gb: number | null;
  status: MatchStatus;
  winner: string | null;
  pen: [number, number] | null;
  minute?: number | string | null;
  /** minute came live from the client ESPN overlay → show it as-is (don't tick). */
  liveOverlay?: boolean;
  /** status is still "live" in the feed but kickoff is far enough in the past
      that the match is certainly over — a safety net for the engine/CI lag in
      flipping it to FINISHED. Affects display only, never scoring. */
  likelyEnded?: boolean;
  venue?: RawVenue | null;
  officialOdds?: { H?: number; D?: number; A?: number } | null;
  cardOdds?: { home: number; draw: number; away: number } | null;
  referees?: { name: string; role?: string }[];
  tippas: boolean;
  tips: RawTip[];
  scorers: MatchScorer[];
  cards: MatchCardEvent[];
  subs: MatchSub[];
  scoreDetail?: RawScoreDetail | null;
  homeLineup?: RawLineup | null;
  awayLineup?: RawLineup | null;
  stats: MatchStats | null;
  xg?: [number, number] | null;
  attendance?: number | null;
  espnOdds?: RawEspnOdds | null;
  homeForm?: RawFormEntry[];
  awayForm?: RawFormEntry[];
  _realId?: number;
}

export interface GroupTableRow {
  code: string;
  sp: number;
  v: number;
  o: number;
  f: number;
  gm: number;
  im: number;
  ms: number;
  p: number;
  pos: number;
}

export interface FormEntry {
  vs: string;
  opp: string;
  gf: number;
  ga: number;
  r: string;
  date?: string;
  id?: string;
  comp?: string;
}

export type BonusSlot = "winner" | "silver" | "bronze" | "topscorer" | "bestplayer" | "youngplayer" | "keeper";

export interface PlayerStanding {
  id: string;
  name: string;
  color: string;
  photo: string | null;
  tips: Record<string, [number, number]>;
  points: number;
  exact: number;
  correct: number;
  other: number;
  bonus: Record<BonusSlot, string | [string, null] | null>;
  bonusPts: number;
  rank: number;
  total: number;
}

export interface KoRound {
  key: "r32" | "r16" | "qf" | "sf" | "final";
  label: string;
  count: number;
}

export interface Knockout {
  r32: Match[];
  r16: Match[];
  qf: Match[];
  sf: Match[];
  third: Match[];
  final: Match[];
}

export interface Dataset {
  state: "pre" | "mid";
  now: Date;
  teams: Record<string, Team>;
  groups: Record<string, string[]>;
  groupLetters: string[];
  matches: Match[];
  allMatches: Match[];
  groupTables: Record<string, GroupTableRow[]>;
  knockout: Knockout;
  koRounds: KoRound[];
  qualifiers: never[];
  players: PlayerStanding[];
  standings: PlayerStanding[];
  forms: Record<string, FormEntry[]>;
  pot: { perPlayer: number; total: number; currency: string };
  stars: never[];
  // pass-throughs the UI needs from raw
  updatedAt?: string;
  bonusActual?: Record<RawBonusKey, string | null>;
  bonusPoints?: Record<RawBonusKey, number>;
  awardsPending?: string[];
  unmatchedTips?: Record<string, number>;
  knockoutRuleText: string;
}
