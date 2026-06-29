// ============================================================
// build() — faithful TS port of the legacy window.VM.build adapter
// (index.html ~322-843). Control flow kept equivalent to avoid any
// scoring/standings/bracket drift. Inputs are the raw JSON files instead
// of window.__REAL_DATA__ / window.__PLAYERS_DB__.
// ============================================================
import type {
  BonusSlot,
  Dataset,
  FormEntry,
  GroupTableRow,
  Match,
  MatchCardEvent,
  MatchScorer,
  MatchStats,
  MatchSub,
  PlayerStanding,
  RawBonusDetailEntry,
  RawData,
  RawDataMatch,
  RawFixture,
  RawVenue,
  Team,
} from "./types";
import {
  EN_TO_SV,
  GROUP_LETTERS,
  brandFromName,
  codeFromName,
  fixName,
  isoFor,
  teamCodeFromPick,
} from "./static/names";
import { GROUP_HOST, STADIUM_COUNTRY } from "./static/venues";
import { PLAYER_COLORS, playerPhoto } from "./static/players";
import { buildKnockout, KO_ROUNDS } from "./bracket";
import { maxLiveMin } from "../lib/liveState";
import { classifyTip } from "./scoring";
import { reg90Score } from "../lib/reg90";

// Correct garbled feed names (e.g. "Bruno Fernanch") on a line-up so the pitch,
// photo lookup and profile all use the same right name.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fixLineupNames(lu: any): any {
  if (!lu) return null;
  const fix = (arr: any[] | undefined) => arr?.map((p: any) => (p?.name ? { ...p, name: fixName(p.name) } : p));
  return { ...lu, lineup: fix(lu.lineup) ?? lu.lineup, bench: fix(lu.bench) ?? lu.bench };
}

// football-data sometimes tags a goal/card/sub team with an ISO alpha-3 code that
// differs from the FIFA code used in the team list (e.g. Uruguay: URY vs URU),
// which would otherwise spawn a phantom, flag-less team. Normalise the known ones.
const TLA_ALIAS: Record<string, string> = { URY: "URU" };

const STAGE_MAP: Record<string, "group" | "ko"> = {
  GROUP_STAGE: "group",
  LAST_32: "ko",
  LAST_16: "ko",
  QUARTER_FINALS: "ko",
  SEMI_FINALS: "ko",
  THIRD_PLACE: "ko",
  FINAL: "ko",
};
const KO_PREFIX: Record<string, string> = {
  LAST_32: "r32_",
  LAST_16: "r16_",
  QUARTER_FINALS: "qf_",
  SEMI_FINALS: "sf_",
  THIRD_PLACE: "third_",
  FINAL: "final_",
};

const BONUS_KEY_MAP: Record<string, BonusSlot> = {
  winner: "winner",
  silver: "silver",
  bronze: "bronze",
  top_scorer: "topscorer",
  best_player: "bestplayer",
  best_young: "youngplayer",
  best_keeper: "keeper",
};
const TEAM_BONUS = new Set<BonusSlot>(["winner", "silver", "bronze"]);

export function build(data: RawData, fixtures: RawFixture[]): Dataset {
  const D = data || {};
  const F = fixtures || [];

  // ============= TEAMS + GROUPS =============
  const TEAMS: Record<string, Team> = {};
  const GROUPS: Record<string, string[]> = {};
  GROUP_LETTERS.forEach((L) => {
    GROUPS[L] = [];
  });

  (D.groups || []).forEach((g) => {
    const L = g.code;
    (g.table || []).forEach((row) => {
      const code = (row.tla && String(row.tla).toUpperCase()) || codeFromName(row.team);
      if (TEAMS[code]) return;
      const display = EN_TO_SV[row.team] || row.team;
      const brand = brandFromName(row.team || code);
      TEAMS[code] = {
        code,
        name: display,
        c1: brand[0],
        c2: brand[1],
        rating: 75,
        group: L,
        pot: 0,
        iso: isoFor(row.team, row.tla),
      };
      if (GROUPS[L] && GROUPS[L].length < 4) GROUPS[L].push(code);
    });
  });
  F.forEach((f) => {
    ([
      [f.home, f.homeTla],
      [f.away, f.awayTla],
    ] as [string | undefined, string | undefined][]).forEach(([n, t]) => {
      if (!n) return;
      const code = (t && String(t).toUpperCase()) || codeFromName(n);
      if (!TEAMS[code]) {
        const display = EN_TO_SV[n] || n;
        const brand = brandFromName(n);
        TEAMS[code] = {
          code,
          name: display,
          c1: brand[0],
          c2: brand[1],
          rating: 75,
          group: f.group || null,
          pot: 0,
          iso: isoFor(n, t),
        };
      }
      if (
        f.group &&
        f.stage === "GROUP_STAGE" &&
        GROUPS[f.group] &&
        !GROUPS[f.group].includes(code) &&
        GROUPS[f.group].length < 4
      ) {
        GROUPS[f.group].push(code);
        if (!TEAMS[code].group) TEAMS[code].group = f.group;
      }
    });
  });

  function codeOf(name?: string | null, tla?: string | null): string | null {
    if (!name) return null;
    if (tla) {
      const t = String(tla).toUpperCase();
      if (TEAMS[t]) return t;
    }
    for (const c in TEAMS) {
      if (TEAMS[c].name === (EN_TO_SV[name] || name)) return c;
    }
    const fallback = codeFromName(name);
    if (TEAMS[fallback]) return fallback;
    const brand = brandFromName(name);
    TEAMS[fallback] = {
      code: fallback,
      name: EN_TO_SV[name] || name,
      c1: brand[0],
      c2: brand[1],
      rating: 75,
      group: null,
      pot: 0,
      iso: isoFor(name, tla),
    };
    return fallback;
  }

  // ============= MATCHES =============
  const tipsByMatchId: Record<number, RawDataMatch> = {};
  (D.matches || []).forEach((m) => {
    tipsByMatchId[m.id] = m;
  });

  const koCounters: Record<string, number> = {};
  let allMatches: Match[] = (F || []).map((f) => {
    const stage = STAGE_MAP[f.stage] || "ko";
    const isGroup = stage === "group";
    let id: string;
    if (isGroup) {
      id = "G" + f.id;
    } else {
      const pfx = KO_PREFIX[f.stage] || "ko_";
      koCounters[pfx] = koCounters[pfx] || 0;
      id = pfx + koCounters[pfx]++;
    }
    const homeCode = f.home ? codeOf(f.home, f.homeTla) : null;
    const awayCode = f.away ? codeOf(f.away, f.awayTla) : null;
    const kickoff = new Date(f.utcDate);
    const finished = f.status === "FINISHED" || f.status === "AWARDED";
    const live = f.status === "IN_PLAY" || f.status === "PAUSED" || f.status === "LIVE" || f.status === "SUSPENDED";
    let ga = f.score && f.score[0] != null ? (f.score[0] as number) : null;
    let gb = f.score && f.score[1] != null ? (f.score[1] as number) : null;
    let winner: string | null = null;
    if (finished && ga != null && gb != null) {
      if (ga > gb) winner = homeCode;
      else if (gb > ga) winner = awayCode;
    }
    const tipped = tipsByMatchId[f.id];
    const tippas = !!(tipped && tipped.tips && tipped.tips.length > 0);

    function refCode(ref?: string | null): string | null {
      if (!ref) return null;
      const upper = TLA_ALIAS[String(ref).toUpperCase()] || String(ref).toUpperCase();
      return TEAMS[upper] ? upper : codeOf(ref, null);
    }
    const goalsSrc = f.goals && f.goals.length ? f.goals : tipped && tipped.goals ? tipped.goals : [];
    const bookingsSrc = f.bookings && f.bookings.length ? f.bookings : tipped && tipped.bookings ? tipped.bookings : [];
    const subsSrc = f.subs && f.subs.length ? f.subs : [];
    const scorers: MatchScorer[] = goalsSrc
      .map((g: any) => ({
        team: refCode(g.team),
        // a just-logged goal sometimes arrives before the scorer is attributed —
        // still show it (as "Mål") so the timeline matches the score instead of
        // silently dropping it.
        name: g.scorer || "Mål",
        minute: g.minute,
        injuryTime: g.injuryTime,
        pen: String(g.type || "").toUpperCase() === "PENALTY",
        header: String(g.type || "").toUpperCase() === "HEADER",
        assist: g.assist || null,
        score: g.score || null,
      }))
      .filter((x: MatchScorer) => x.team);
    const cards: MatchCardEvent[] = bookingsSrc
      .map((b: any) => {
        const c = String(b.card || "").toUpperCase();
        return {
          team: refCode(b.team),
          name: b.player,
          minute: b.minute,
          type: (c === "RED" || c === "YELLOW_RED" ? "red" : "yellow") as "red" | "yellow",
        };
      })
      .filter((x: MatchCardEvent) => x.team && x.name);
    const subs: MatchSub[] = subsSrc
      .map((s: any) => ({
        team: refCode(s.team),
        minute: s.minute,
        playerIn: s.playerIn,
        playerOut: s.playerOut,
      }))
      .filter((x: MatchSub) => x.team);

    // LIVE score: the goal feed (ESPN, sometimes football-data) updates as soon
    // as a goal is logged, while the match-level `score` field can lag minutes
    // behind on the free feed — which showed "0–0" with a goal already listed.
    // For live matches derive the score from the goal events (never for finished
    // matches, whose official score is authoritative and drives scoring).
    if (live && scorers.length) {
      const cum = scorers.map((s) => s.score).filter((s): s is [number, number] => Array.isArray(s) && s.length === 2);
      let gh: number, gaw: number;
      if (cum.length) {
        // each goal carries the running [home, away] tally — max handles own
        // goals and any out-of-order events correctly.
        gh = Math.max(...cum.map((s) => s[0]));
        gaw = Math.max(...cum.map((s) => s[1]));
      } else {
        gh = scorers.filter((s) => s.team === homeCode).length;
        gaw = scorers.filter((s) => s.team === awayCode).length;
      }
      ga = Math.max(ga ?? 0, gh);
      gb = Math.max(gb ?? 0, gaw);
    }

    const hs = f.homeStats || {};
    const as_ = f.awayStats || {};
    function getStat(obj: Record<string, any>, ...keys: string[]): number | null {
      for (const k of keys) {
        if (obj[k] != null) return Number(obj[k]);
        if (obj[k.toUpperCase()] != null) return Number(obj[k.toUpperCase()]);
      }
      return null;
    }
    const _poss = [getStat(hs, "possessionPct", "ball_possession"), getStat(as_, "possessionPct", "ball_possession")];
    const _shots = [getStat(hs, "totalShots", "total_shots"), getStat(as_, "totalShots", "total_shots")];
    const _sot = [getStat(hs, "shotsOnTarget", "shots_on_goal"), getStat(as_, "shotsOnTarget", "shots_on_goal")];
    const _corn = [getStat(hs, "wonCorners", "corner_kicks"), getStat(as_, "wonCorners", "corner_kicks")];
    const _fouls = [getStat(hs, "foulsCommitted", "fouls"), getStat(as_, "foulsCommitted", "fouls")];
    const hPassPct = getStat(hs, "passPct");
    const aPassPct = getStat(as_, "passPct");
    const hP = getStat(hs, "totalPasses", "passes");
    const hA = getStat(hs, "accuratePasses", "accurate_passes");
    const aP = getStat(as_, "totalPasses", "passes");
    const aA = getStat(as_, "accuratePasses", "accurate_passes");
    const _pass = [
      hPassPct != null ? Math.round(hPassPct * 100) : hP && hA != null ? Math.round((hA / hP) * 100) : null,
      aPassPct != null ? Math.round(aPassPct * 100) : aP && aA != null ? Math.round((aA / aP) * 100) : null,
    ];
    const _tack = [getStat(hs, "effectiveTackles"), getStat(as_, "effectiveTackles")];
    const _inter = [getStat(hs, "interceptions"), getStat(as_, "interceptions")];
    const _clear = [getStat(hs, "effectiveClearance", "totalClearance"), getStat(as_, "effectiveClearance", "totalClearance")];
    const _blk = [getStat(hs, "blockedShots"), getStat(as_, "blockedShots")];
    const _long = [getStat(hs, "totalLongBalls"), getStat(as_, "totalLongBalls")];
    const hCrossAcc = getStat(hs, "accurateCrosses");
    const hCrossTot = getStat(hs, "totalCrosses");
    const aCrossAcc = getStat(as_, "accurateCrosses");
    const aCrossTot = getStat(as_, "totalCrosses");
    const _crossPct = [
      hCrossTot && hCrossAcc != null ? Math.round((hCrossAcc / hCrossTot) * 100) : null,
      aCrossTot && aCrossAcc != null ? Math.round((aCrossAcc / aCrossTot) * 100) : null,
    ];
    let hy = 0,
      hr = 0,
      ay = 0,
      ar = 0;
    cards.forEach((b) => {
      if (b.team === homeCode) {
        if (b.type === "red") hr++;
        else hy++;
      } else if (b.team === awayCode) {
        if (b.type === "red") ar++;
        else ay++;
      }
    });
    const _statsHasData = _poss[0] != null || _shots[0] != null || _sot[0] != null;
    const matchStats: MatchStats | null = _statsHasData
      ? {
          poss: [_poss[0] ?? 50, _poss[1] ?? 50],
          xg: [null, null],
          shots: [_shots[0] ?? 0, _shots[1] ?? 0],
          sot: [_sot[0] ?? 0, _sot[1] ?? 0],
          corners: [_corn[0] ?? 0, _corn[1] ?? 0],
          pass: [_pass[0] ?? 0, _pass[1] ?? 0],
          fouls: [_fouls[0] ?? 0, _fouls[1] ?? 0],
          yellow: [hy, ay],
          red: [hr, ar],
          tackles: _tack as [number | null, number | null],
          interceptions: _inter as [number | null, number | null],
          clearances: _clear as [number | null, number | null],
          blockedShots: _blk as [number | null, number | null],
          longBalls: _long as [number | null, number | null],
          crossPct: _crossPct as [number | null, number | null],
          offsides: [getStat(hs, "offsides"), getStat(as_, "offsides")],
          saves: [getStat(hs, "saves"), getStat(as_, "saves")],
          shotPct: [getStat(hs, "shotPct"), getStat(as_, "shotPct")],
        }
      : null;

    const sd = f.scoreDetail || null;
    const penScore = sd && sd.penalties && sd.penalties[0] != null ? (sd.penalties as [number, number]) : null;

    const venue: RawVenue | null = (() => {
      let v: RawVenue | null =
        f.venue && f.venue.stadium
          ? { ...f.venue }
          : f.group && GROUP_HOST[f.group]
            ? { ...GROUP_HOST[f.group] }
            : null;
      if (v && v.stadium && !v.country) {
        const ext = STADIUM_COUNTRY[v.stadium];
        if (ext) {
          v.country = ext.country;
          v.cc = ext.cc;
        }
      }
      return v;
    })();

    const m: Match = {
      id,
      stage,
      group: f.group || null,
      round: isGroup ? "Grupp " + (f.group || "") : "Slutspel",
      matchday: null,
      home: homeCode,
      away: awayCode,
      kickoff,
      ga,
      gb,
      status: finished ? "played" : live ? "live" : "upcoming",
      winner,
      pen: penScore,
      minute: live && f.minute != null ? f.minute : live ? null : undefined,
      likelyEnded: live && Date.now() - +kickoff > maxLiveMin(stage) * 60000,
      liveOverlay: !!f._liveOverlay,
      venue,
      officialOdds: f.odds || null,
      cardOdds: f.cardOdds || null,
      xg: f.xg ? [f.xg.home, f.xg.away] : null,
      referees: f.referees || [],
      tippas,
      tips: tipped ? tipped.tips || [] : [],
      scorers,
      cards,
      subs,
      scoreDetail: sd,
      homeLineup: fixLineupNames(f.homeLineup),
      awayLineup: fixLineupNames(f.awayLineup),
      stats: matchStats,
      attendance: f.attendance || null,
      espnOdds: f.espnOdds || null,
      homeForm: f.homeForm || [],
      awayForm: f.awayForm || [],
      _realId: f.id,
    };
    return m;
  });

  allMatches.sort((a, b) => +a.kickoff - +b.kickoff);

  // ============= groupTables =============
  const groupTables: Record<string, GroupTableRow[]> = {};
  GROUP_LETTERS.forEach((L) => {
    const g = (D.groups || []).find((x) => x.code === L);
    if (g && g.table && g.table.length) {
      const sorted = [...g.table].sort(
        (a, b) =>
          (b.points || 0) - (a.points || 0) ||
          (b.gd ?? (b.gf || 0) - (b.ga || 0)) - (a.gd ?? (a.gf || 0) - (a.ga || 0)) ||
          (b.gf || 0) - (a.gf || 0)
      );
      groupTables[L] = sorted.map((row, i) => {
        const code = (row.tla && String(row.tla).toUpperCase()) || codeFromName(row.team);
        return {
          code,
          sp: row.played || 0,
          v: row.won || 0,
          o: row.draw || 0,
          f: row.lost || 0,
          gm: row.gf || 0,
          im: row.ga || 0,
          ms: row.gd != null ? row.gd : (row.gf || 0) - (row.ga || 0),
          p: row.points || 0,
          pos: i + 1,
        };
      });
    } else {
      groupTables[L] = (GROUPS[L] || []).map((code, i) => ({
        code,
        sp: 0,
        v: 0,
        o: 0,
        f: 0,
        gm: 0,
        im: 0,
        ms: 0,
        p: 0,
        pos: i + 1,
      }));
      while (groupTables[L].length < 4) {
        const tag = "TBD" + L + (groupTables[L].length + 1);
        TEAMS[tag] = TEAMS[tag] || {
          code: tag,
          name: "Att lottas",
          c1: "#888",
          c2: "#666",
          rating: 70,
          group: L,
          pot: 0,
          iso: null,
        };
        groupTables[L].push({
          code: tag,
          sp: 0,
          v: 0,
          o: 0,
          f: 0,
          gm: 0,
          im: 0,
          ms: 0,
          p: 0,
          pos: groupTables[L].length + 1,
        });
      }
    }

    // Overlay LIVE group matches provisionally — the engine's committed table only
    // counts finished matches, so without this a 1–1 in progress wouldn't move the
    // standings. (A live match isn't in football-data's standings yet, so no double
    // count.) Re-sort by points → goal diff → goals scored, same as the engine.
    const liveMs = allMatches.filter(
      (m) => m.stage === "group" && m.group === L && m.status === "live" && m.home && m.away && m.ga != null && m.gb != null
    );
    if (liveMs.length && groupTables[L].length) {
      const byCode: Record<string, GroupTableRow> = {};
      groupTables[L].forEach((r) => (byCode[r.code] = { ...r }));
      liveMs.forEach((m) => {
        const h = byCode[m.home!], a = byCode[m.away!];
        if (!h || !a) return;
        h.sp++; a.sp++;
        h.gm += m.ga!; h.im += m.gb!; a.gm += m.gb!; a.im += m.ga!;
        h.ms = h.gm - h.im; a.ms = a.gm - a.im;
        if (m.ga! > m.gb!) { h.v++; h.p += 3; a.f++; }
        else if (m.ga! < m.gb!) { a.v++; a.p += 3; h.f++; }
        else { h.o++; h.p += 1; a.o++; a.p += 1; }
      });
      groupTables[L] = Object.values(byCode)
        .sort((x, y) => y.p - x.p || y.ms - x.ms || y.gm - x.gm)
        .map((r, i) => ({ ...r, pos: i + 1 }));
    }
  });

  // ============= knockout =============
  const knockout = buildKnockout(groupTables, allMatches);

  // Replace KO entries in allMatches with the structural versions.
  const groupMatches = allMatches.filter((m) => m.stage === "group");
  const allMatchesNew = groupMatches.concat(
    knockout.r32,
    knockout.r16,
    knockout.qf,
    knockout.sf,
    knockout.third,
    knockout.final
  );
  allMatchesNew.sort((a, b) => +a.kickoff - +b.kickoff);
  allMatches = allMatchesNew;

  const matches = allMatches.filter((m) => m.stage === "group");

  // ============= forms =============
  const forms: Record<string, FormEntry[]> = {};
  Object.keys(TEAMS).forEach((c) => {
    forms[c] = [];
  });
  const realForms = D.team_forms || {};
  Object.keys(realForms).forEach((tla) => {
    const code = TEAMS[tla] ? tla : null;
    if (!code) return;
    (realForms[tla] || []).forEach((e) => {
      forms[code].push({
        vs: e.oppTla || e.opp || "",
        opp: e.opp || "",
        gf: e.gf ?? 0,
        ga: e.ga ?? 0,
        r: e.r || "",
        date: e.date,
        comp: e.competition,
      });
    });
  });
  // Append WC matches — but DEDUPE: the engine's daily team_forms refresh already
  // includes recently-played WC matches, so without this guard a match gets
  // counted twice (e.g. one win shows as two). Key on opponent + scoreline.
  const seenForm: Record<string, Set<string>> = {};
  Object.keys(forms).forEach((c) => {
    seenForm[c] = new Set(forms[c].map((e) => `${e.vs}-${e.gf}-${e.ga}`));
  });
  allMatches.forEach((m) => {
    if (m.status !== "played" || !m.home || !m.away) return;
    const r = (g: number, o: number) => (g > o ? "V" : g < o ? "F" : "O");
    const hKey = `${m.away}-${m.ga}-${m.gb}`;
    const aKey = `${m.home}-${m.gb}-${m.ga}`;
    if (!seenForm[m.home].has(hKey)) {
      forms[m.home].push({ vs: m.away, opp: m.away, gf: m.ga!, ga: m.gb!, r: r(m.ga!, m.gb!), id: m.id, comp: "WC" });
      seenForm[m.home].add(hKey);
    }
    if (!seenForm[m.away].has(aKey)) {
      forms[m.away].push({ vs: m.home, opp: m.home, gf: m.gb!, ga: m.ga!, r: r(m.gb!, m.ga!), id: m.id, comp: "WC" });
      seenForm[m.away].add(aKey);
    }
  });
  Object.keys(forms).forEach((c) => {
    forms[c] = forms[c].slice(-5);
  });

  // ============= PLAYERS / STANDINGS / TIPS / BONUS =============
  const realIdToMatchId: Record<number, string> = {};
  allMatches.forEach((m) => {
    if (m._realId != null) realIdToMatchId[m._realId] = m.id;
  });

  function buildPlayerTips(playerName: string): Record<string, [number, number]> {
    const out: Record<string, [number, number]> = {};
    (D.matches || []).forEach((rm) => {
      const t = (rm.tips || []).find((x) => x.name === playerName);
      if (t) {
        const designId = realIdToMatchId[rm.id];
        if (designId) out[designId] = [t.tip[0], t.tip[1]];
      }
    });
    return out;
  }
  function buildBonus(detail?: Record<string, RawBonusDetailEntry>): PlayerStanding["bonus"] {
    const out: PlayerStanding["bonus"] = {} as PlayerStanding["bonus"];
    Object.keys(BONUS_KEY_MAP).forEach((srcKey) => {
      const dstKey = BONUS_KEY_MAP[srcKey];
      const v = detail && detail[srcKey];
      if (!v) {
        out[dstKey] = TEAM_BONUS.has(dstKey) ? null : ["-", null];
        return;
      }
      if (TEAM_BONUS.has(dstKey)) {
        out[dstKey] = teamCodeFromPick(v.pick, TEAMS);
      } else {
        out[dstKey] = [v.pick || "-", null];
      }
    });
    return out;
  }

  // Provisional points for a LIVE (or overlay-finished-but-engine-not-yet) match,
  // mirroring score_one_match in engine.py so the number doesn't jump when the
  // engine later finalises it. Knockout is scored on the 90-minute result
  // (reg90Score — draws valid); group on the final score.
  function provisionalPoints(m: Match, tip: [number, number]): number {
    const sc = reg90Score(m);
    if (!sc) return 0;
    return classifyTip(tip, sc[0], sc[1]).points;
  }

  const leaderboard = D.leaderboard || [];
  const players: PlayerStanding[] = leaderboard.map((p) => {
    const tips = buildPlayerTips(p.name);
    // Recompute match points across played AND live matches so the leaderboard
    // moves the instant a goal is scored — not only when the (throttled) engine
    // cron re-commits. Finished matches use the engine's authoritative per-match
    // points; live / not-yet-finalised matches use the provisional score above.
    let matchPoints = 0,
      exact = 0,
      correct = 0,
      other = 0;
    allMatches.forEach((m) => {
      if (!m.home || !m.away) return;
      const tip = tips[m.id];
      if (!tip) return;
      const rm = m._realId != null ? tipsByMatchId[m._realId] : undefined;
      const engineFinished = !!rm && (rm.status === "FINISHED" || rm.status === "AWARDED");
      let pts: number | null = null;
      if (engineFinished) {
        const et = (rm!.tips || []).find((x) => x.name === p.name);
        if (et && et.points != null) pts = et.points;
      }
      if (pts == null && (m.status === "live" || m.status === "played")) pts = provisionalPoints(m, tip);
      if (pts == null) return;
      matchPoints += pts;
      if (pts >= 5) exact++;
      else if (pts >= 2) correct++;
      else other++;
    });
    const pid = p.name
      .toLowerCase()
      .replace(/[åä]/g, "a")
      .replace(/ö/g, "o")
      .replace(/[^a-z0-9]/g, "");
    return {
      id: pid,
      name: p.name,
      color: PLAYER_COLORS[p.name] || "#7A3CF0",
      photo: playerPhoto(p.name),
      tips,
      points: matchPoints,
      exact,
      correct,
      other,
      bonus: buildBonus(p.bonus_detail),
      bonusPts: p.bonus_points || 0,
      rank: p.rank || 0,
      total: matchPoints + (p.bonus_points || 0),
    };
  });

  const standings = players.slice().sort((a, b) => b.total - a.total || b.exact - a.exact || a.name.localeCompare(b.name));
  let prevTot: number | null = null,
    rank = 0;
  standings.forEach((p, i) => {
    if (p.total !== prevTot) {
      rank = i + 1;
      prevTot = p.total;
    }
    p.rank = rank;
  });
  standings.forEach((s) => {
    const p = players.find((x) => x.id === s.id);
    if (p) p.rank = s.rank;
  });

  const TOURNAMENT_START_MS = Date.UTC(2026, 5, 11, 19, 0);
  const anyLive = allMatches.some((m) => m.status === "live");
  const anyPlayed = allMatches.some((m) => m.status === "played");
  const state: "pre" | "mid" = anyPlayed || anyLive || Date.now() >= TOURNAMENT_START_MS ? "mid" : "pre";

  return {
    state,
    now: new Date(),
    teams: TEAMS,
    groups: GROUPS,
    groupLetters: GROUP_LETTERS,
    matches,
    allMatches,
    groupTables,
    knockout,
    koRounds: KO_ROUNDS,
    qualifiers: [],
    players,
    standings,
    forms,
    pot: {
      perPlayer: (D.pot && D.pot.per_player) || 300,
      total: (D.pot && D.pot.total) || players.length * 300,
      currency: (D.pot && D.pot.currency) || "kr",
    },
    stars: [],
    updatedAt: D.updated_at,
    bonusActual: D.bonus_actual,
    bonusPoints: D.bonus_points,
    awardsPending: D.awards_pending,
    unmatchedTips: D.unmatched_tips,
    knockoutRuleText:
      "Exakt resultat = ställningen efter ev. förlängning (straffmål räknas inte). " +
      "Rätt utgång = laget som går vidare (straffvinnaren räknas).",
  };
}
