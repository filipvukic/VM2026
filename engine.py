#!/usr/bin/env python3
"""
VM 2026 tippningsmotor.

Hämtar matcher + skytteliga från football-data.org, räknar ut poäng enligt
gruppens regler och skriver data.json + fixtures.json som frontend läser.

Körs av GitHub Actions (se .github/workflows/update.yml). API-nyckeln läses
från miljövariabeln FOOTBALL_DATA_TOKEN (lagras som GitHub Secret).

Lokal testkörning utan API (matchningslogiken verifieras mot mockdata):
    python engine.py --mock mock_data.json
"""

import argparse
import json
import os
import re
import sys
import time
import unicodedata
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

API_BASE = "https://api.football-data.org/v4"
COMPETITION = "WC"  # FIFA World Cup
GROUP_STAGE = "GROUP_STAGE"
LIVE_STATUSES = {"IN_PLAY", "PAUSED", "LIVE", "SUSPENDED"}


# --------------------------------------------------------------------------- #
# Hjälpfunktioner: namnnormalisering (svenska tips -> API:ets engelska namn)
# --------------------------------------------------------------------------- #
def norm(s):
    """Gör en sträng jämförbar: gemener, utan accenter och skiljetecken."""
    if s is None:
        return ""
    s = unicodedata.normalize("NFKD", str(s))
    s = "".join(c for c in s if not unicodedata.combining(c))
    return "".join(c for c in s.lower() if c.isalnum())


def make_alias_norm(aliases):
    """Normaliserar OCH översätter via alias (t.ex. 'Frankrike' -> 'france').
    Används för att jämföra lag-bonus (vinnare/silver/brons) mot API-namn."""
    table = {norm(k): norm(v) for k, v in aliases.items()}

    def f(name):
        n = norm(name)
        return table.get(n, n)

    return f


def make_bonus_match(aliases):
    """Jämför bonustips mot facit. Översätter lag via alias och matchar
    spelare på efternamn (token-delmängd), så 'Mbappe' matchar 'Kylian Mbappé'
    och 'Raya' matchar 'David Raya'."""
    table = {norm(k): v for k, v in aliases.items()}

    def toks(name):
        eng = table.get(norm(name), str(name or ""))
        eng = unicodedata.normalize("NFKD", eng)
        eng = "".join(c for c in eng if not unicodedata.combining(c)).lower()
        return set(re.findall(r"[a-z0-9]+", eng))

    def match(pick, actual):
        if not pick or not actual:
            return False
        a, b = toks(pick), toks(actual)
        return bool(a and b and (a == b or a <= b or b <= a))

    return match


def build_team_resolver(aliases):
    """aliases: {"Sydafrika": "South Africa", ...}. Returnerar funktion
    som matchar ett (svenskt) tipsnamn mot ett API-lags namn/kortnamn/tla."""
    alias_norm = {norm(k): norm(v) for k, v in aliases.items()}

    def resolve(tip_name, match_team):
        t = norm(tip_name)
        t = alias_norm.get(t, t)
        candidates = {
            norm(match_team.get("name")),
            norm(match_team.get("shortName")),
            norm(match_team.get("tla")),
        }
        candidates.discard("")
        return t in candidates

    return resolve


# --------------------------------------------------------------------------- #
# API-anrop
# --------------------------------------------------------------------------- #
def api_get(path, token):
    req = Request(f"{API_BASE}{path}", headers={"X-Auth-Token": token})
    for attempt in range(3):
        try:
            with urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except HTTPError as e:
            if e.code == 429:  # rate limit -> vänta och försök igen
                time.sleep(int(e.headers.get("Retry-After", 6)) + 1)
                continue
            raise
        except URLError:
            time.sleep(3)
    raise RuntimeError(f"API-anrop misslyckades: {path}")


# --------------------------------------------------------------------------- #
# ESPN Integration (inofficiellt API, ingen autentisering krävs)
# --------------------------------------------------------------------------- #
ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world"
ESPN_WC_DATES = "20260611-20260719"

# ESPN live-statusar (state == "in")
ESPN_LIVE = {"STATUS_IN_PROGRESS", "STATUS_HALFTIME", "STATUS_EXTRA_TIME",
             "STATUS_PENALTY", "STATUS_SHOOTOUT"}
ESPN_FINISHED = {"STATUS_FULL_TIME", "STATUS_FT", "STATUS_AWARDED",
                 "STATUS_FULL_PEN", "STATUS_FINAL"}


def _jload(path, default=None):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return ({} if default is None else default)


def _jsave(path, data):
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception:
        pass


def espn_get(path):
    """Hämta från ESPNs inofficiella API."""
    req = Request(f"{ESPN_BASE}{path}", headers={
        "User-Agent": "Mozilla/5.0 (compatible; VM2026/1.0)",
        "Accept": "application/json",
    })
    for attempt in range(3):
        try:
            with urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except HTTPError as e:
            if e.code == 429:
                time.sleep(5)
                continue
            raise
        except URLError:
            time.sleep(3)
    raise RuntimeError(f"ESPN-anrop misslyckades: {path}")


def build_espn_id_map(fd_matches, cache_path="espn_id_map.json"):
    """Bygger str(fd_id) → espn_event_id via datum + normaliserat lagnamn."""
    id_map = _jload(cache_path)
    unmapped = [m for m in fd_matches if str(m.get("id")) not in id_map]
    if not unmapped:
        return id_map

    print(f"Bygger ESPN ID-map för {len(unmapped)} omappade matcher…")
    try:
        data = espn_get(f"/scoreboard?dates={ESPN_WC_DATES}&limit=200")
    except Exception as e:
        print(f"  Kunde inte hämta ESPN scoreboard: {e}")
        return id_map

    espn_lookup = {}
    for e in data.get("events", []):
        eid = e.get("id")
        date = e.get("date", "")[:10]
        comps = e.get("competitions", [{}])
        competitors = comps[0].get("competitors", []) if comps else []
        home = next((c for c in competitors if c.get("homeAway") == "home"), {})
        away = next((c for c in competitors if c.get("homeAway") == "away"), {})
        hn = norm(home.get("team", {}).get("displayName", ""))
        an = norm(away.get("team", {}).get("displayName", ""))
        if date and hn:
            espn_lookup[(date, hn, an)] = eid

    for m in unmapped:
        mid = str(m.get("id"))
        date = m.get("utcDate", "")[:10]
        hn = norm((m.get("homeTeam") or {}).get("name", ""))
        an = norm((m.get("awayTeam") or {}).get("name", ""))
        eid = espn_lookup.get((date, hn, an))
        if not eid:
            for (d, h, a), candidate in espn_lookup.items():
                if d == date and hn and an and (
                    (hn[:5] in h or h[:5] in hn) and (an[:5] in a or a[:5] in an)
                ):
                    eid = candidate
                    break
        if eid:
            id_map[mid] = eid

    _jsave(cache_path, id_map)
    mapped = sum(1 for m in fd_matches if str(m.get("id")) in id_map)
    print(f"  ESPN ID-map: {mapped}/{len(fd_matches)} matcher mappade")
    return id_map


def _espn_minute(clock_display):
    """'9\\'' → '9',  '90+2\\'' → '90+2'"""
    return str(clock_display or "").rstrip("'").strip()


def parse_espn_summary(data, home_tla, away_tla):
    """Parsar ESPNs summary-endpoint till vår fixture-struktur.
    Returnerar dict med goals, bookings, subs, lineups, stats m.m."""

    # Identifiera ESPN:s hemma/borta-lagnamn
    espn_home = espn_away = ""
    for r in data.get("rosters", []):
        n = norm(r.get("team", {}).get("displayName", ""))
        if r.get("homeAway") == "home":
            espn_home = n
        else:
            espn_away = n
    if not espn_home:
        for comp in (data.get("header", {}).get("competitions") or []):
            for c in comp.get("competitors", []):
                n = norm(c.get("team", {}).get("displayName", ""))
                if c.get("homeAway") == "home":
                    espn_home = n
                else:
                    espn_away = n

    def tla_of(espn_team_name):
        n = norm(espn_team_name)
        if espn_home and (n == espn_home or (len(n) >= 4 and n[:4] == espn_home[:4])):
            return home_tla
        return away_tla

    # --- Händelser (mål, kort, byten) ---
    goals, bookings, subs = [], [], []
    h_score = a_score = 0

    for e in data.get("keyEvents", []):
        etype = e.get("type", {}).get("type", "")
        team_name = e.get("team", {}).get("displayName", "")
        tla = tla_of(team_name)
        minute = _espn_minute(e.get("clock", {}).get("displayValue", ""))
        period = e.get("period", {}).get("number", 1)
        parts = e.get("participants", [])
        p0 = parts[0].get("athlete", {}).get("displayName") if parts else None
        p1 = parts[1].get("athlete", {}).get("displayName") if len(parts) > 1 else None
        text = e.get("text", "")

        if etype in ("goal", "goal---header", "own-goal", "penalty-goal"):
            is_own = "own goal" in text.lower()
            is_pen = "penalty" in text.lower() or etype == "penalty-goal"
            is_header = "header" in etype
            if tla == home_tla:
                h_score += 1
            else:
                a_score += 1
            goals.append({
                "minute": minute,
                "team": tla,
                "scorer": p0,
                "assist": p1,
                "type": "OWN" if is_own else ("PENALTY" if is_pen else
                                               ("HEADER" if is_header else "REGULAR")),
                "description": text,
                "score": [h_score, a_score],
                "period": period,
            })
        elif etype == "yellow-card":
            bookings.append({"minute": minute, "team": tla, "player": p0,
                              "card": "YELLOW", "period": period})
        elif etype == "red-card":
            is_2nd_y = any(w in text.lower() for w in ("second yellow", "second booking"))
            bookings.append({"minute": minute, "team": tla, "player": p0,
                              "card": "YELLOW_RED" if is_2nd_y else "RED", "period": period})
        elif etype == "substitution":
            subs.append({"minute": minute, "team": tla, "playerIn": p0,
                          "playerOut": p1, "period": period})

    # --- Uppställningar ---
    def parse_roster(r):
        tla_ = home_tla if r.get("homeAway") == "home" else away_tla
        lineup, bench = [], []
        for a in r.get("roster", []):
            ath = a.get("athlete", {})
            name = (ath.get("displayName") or
                    (ath.get("firstName", "") + " " + ath.get("lastName", "")).strip())
            entry = {
                "name": name,
                "position": a.get("position", {}).get("abbreviation"),
                "positionName": a.get("position", {}).get("displayName"),
                "jersey": a.get("jersey"),
                "espnId": ath.get("id"),
                "subbedIn": bool(a.get("subbedIn")),
                "subbedOut": bool(a.get("subbedOut")),
            }
            (lineup if a.get("starter") else bench).append(entry)
        if not lineup and not bench:
            return None
        return {"formation": r.get("formation"), "lineup": lineup,
                "bench": bench, "tla": tla_, "_espnEventId": None}

    lineups = {}
    for r in data.get("rosters", []):
        p = parse_roster(r)
        if p:
            lineups[p["tla"]] = p

    # --- Lagstatistik (28 fält från ESPN) ---
    def parse_stats(stats_list):
        out = {}
        for s in stats_list:
            name = s.get("name")
            if not name:
                continue
            # ESPN boxscore stats use "displayValue" (string), not "value"
            raw = s.get("displayValue")
            if raw is None:
                raw = s.get("value")
            if raw is None:
                continue
            try:
                out[name] = float(str(raw).strip("%").replace(",", "."))
            except (ValueError, TypeError):
                out[name] = raw
        return out

    home_stats, away_stats = {}, {}
    for t in data.get("boxscore", {}).get("teams", []):
        parsed_stats = parse_stats(t.get("statistics", []))
        if t.get("homeAway") == "home":
            home_stats = parsed_stats
        else:
            away_stats = parsed_stats

    # --- Spelplats, publik, domare ---
    gi = data.get("gameInfo", {})
    vd = gi.get("venue", {})
    venue = None
    if vd:
        addr = vd.get("address", {})
        venue = {"stadium": vd.get("fullName"), "city": addr.get("city"),
                 "country": addr.get("country")}
    referees = [{"name": o.get("displayName"),
                 "role": o.get("position", {}).get("name")}
                for o in gi.get("officials", [])]

    # --- Odds (DraftKings pre-match) ---
    espn_odds = None
    pc = data.get("pickcenter", [])
    if pc:
        p = pc[0]
        espn_odds = {
            "homeML": (p.get("homeTeamOdds") or {}).get("moneyLine"),
            "awayML": (p.get("awayTeamOdds") or {}).get("moneyLine"),
            "spread": p.get("details"),
            "overUnder": p.get("overUnder"),
            "overOdds": p.get("overOdds"),
            "underOdds": p.get("underOdds"),
            "provider": (p.get("provider") or {}).get("name"),
        }

    # --- Senaste form (sista 5 matcher per lag) ---
    def parse_form(form_entry):
        team_id = str((form_entry.get("team") or {}).get("id", ""))
        results = []
        for fe in (form_entry.get("events") or [])[:5]:
            score_str = str(fe.get("score", ""))
            at_vs = fe.get("atVs", "vs")
            home_team_id = str(fe.get("homeTeamId", ""))
            is_home = (at_vs == "vs") or (home_team_id == team_id)
            try:
                h_g, a_g = map(int, score_str.split("-"))
                gf = h_g if is_home else a_g
                ga = a_g if is_home else h_g
                results.append({
                    "date": fe.get("gameDate", "")[:10],
                    "result": "V" if gf > ga else ("F" if gf < ga else "O"),
                    "gf": gf, "ga": ga, "home": is_home,
                })
            except (ValueError, TypeError):
                pass
        return results

    home_form, away_form = [], []
    for f_entry in data.get("boxscore", {}).get("form", []):
        if f_entry.get("displayOrder") == 1:
            home_form = parse_form(f_entry)
        else:
            away_form = parse_form(f_entry)

    # --- ESPN-status ---
    espn_status = ""
    espn_clock = None
    for comp in (data.get("header", {}).get("competitions") or []):
        st = comp.get("status", {}).get("type", {})
        espn_status = st.get("name", "")
        espn_clock = comp.get("status", {}).get("clock")
        break

    return {
        "goals": goals,
        "bookings": bookings,
        "subs": subs,
        "homeLineup": lineups.get(home_tla),
        "awayLineup": lineups.get(away_tla),
        "homeStats": home_stats,
        "awayStats": away_stats,
        "venue": venue,
        "attendance": gi.get("attendance"),
        "referees": referees,
        "espnOdds": espn_odds,
        "homeForm": home_form,
        "awayForm": away_form,
        "espnStatus": espn_status,
        "espnClock": espn_clock,
    }


def refresh_espn_data(fd_matches, cache_path="espn_cache.json", max_calls=12):
    """Hämtar matchdetaljer från ESPN:
      1. Pågående matcher – alltid (live-händelser ändras kontinuerligt)
      2. FINISHED utan cachad ESPN-data – en gång tills händelser dyker upp
      3. Kommande matcher inom 24 h – en gång per 6 h (odds, venue, form)
      4. Stale TIMED (avspark 2.5–12 h sedan) – kan ha blivit klara

    FINISHED-matcher cachelagras permanent i espn_cache.json.
    """
    cache = _jload(cache_path)
    id_map = build_espn_id_map(fd_matches)
    now = datetime.now(timezone.utc)

    to_fetch = []
    for m in fd_matches:
        mid = str(m.get("id"))
        espn_id = id_map.get(mid)
        if not espn_id:
            continue
        status = m.get("status", "")
        utc = m.get("utcDate", "")

        if status in LIVE_STATUSES:
            to_fetch.append((0, m, espn_id))
            continue

        if utc:
            try:
                kickoff = datetime.fromisoformat(utc.replace("Z", "+00:00"))
                age_h = (now - kickoff).total_seconds() / 3600
            except Exception:
                age_h = 0
        else:
            age_h = 0

        if status in ("TIMED", "SCHEDULED"):
            if 2.5 <= age_h <= 12:
                to_fetch.append((1, m, espn_id))  # Borde vara klar
            elif -24 <= age_h <= 0:
                # Kommande match: hämta om ej cachad eller cache > 6 h gammal
                cached = cache.get(espn_id, {})
                cached_at = cached.get("_fetched_at", "")
                stale = True
                if cached_at:
                    try:
                        dt = datetime.fromisoformat(cached_at)
                        if (now - dt).total_seconds() < 6 * 3600:
                            stale = False
                    except Exception:
                        pass
                if stale:
                    to_fetch.append((3, m, espn_id))
            continue

        if status == "FINISHED":
            cached = cache.get(espn_id, {})
            has_events = bool(cached.get("goals") or cached.get("bookings"))
            if not has_events and age_h < 48:
                to_fetch.append((2, m, espn_id))

    # Applicera befintlig cache direkt
    for m in fd_matches:
        mid = str(m.get("id"))
        espn_id = id_map.get(mid)
        if espn_id and espn_id in cache:
            _apply_espn(m, cache[espn_id])

    if not to_fetch:
        return

    to_fetch.sort(key=lambda x: x[0])
    labels = {0: "live", 1: "stale-timed", 2: "finished-no-events", 3: "pre-match"}

    for i, (prio, m, espn_id) in enumerate(to_fetch[:max_calls]):
        if i > 0:
            time.sleep(1)  # Respektera ESPN utan explicit rate-limit
        home_tla = (m.get("homeTeam") or {}).get("tla", "HOM")
        away_tla = (m.get("awayTeam") or {}).get("tla", "AWY")
        try:
            summary = espn_get(f"/summary?event={espn_id}")
            parsed = parse_espn_summary(summary, home_tla, away_tla)
            for side in ("homeLineup", "awayLineup"):
                if parsed.get(side):
                    parsed[side]["_espnEventId"] = espn_id
            parsed["_fetched_at"] = now.isoformat()

            espn_status = parsed.get("espnStatus", "")
            is_finished = espn_status in ESPN_FINISHED
            is_live = espn_status in ESPN_LIVE

            if is_finished:
                cache[espn_id] = parsed   # Permanent cache för FINISHED
            elif not is_live:
                cache[espn_id] = parsed   # Korttidscache för pre-match

            _apply_espn(m, parsed)
            # Uppdatera status från ESPN om fd.org är sen
            if is_finished and m.get("status") not in ("FINISHED", "AWARDED"):
                m["status"] = "FINISHED"

            hn = (m.get("homeTeam") or {}).get("name", "?")
            an = (m.get("awayTeam") or {}).get("name", "?")
            print(f"  [ESPN {labels.get(prio, str(prio))}] {hn}–{an}: "
                  f"mål={len(parsed['goals'])}, kort={len(parsed['bookings'])}, "
                  f"byten={len(parsed['subs'])}, status={espn_status}")
        except Exception as e:
            print(f"  ESPN misslyckades event={espn_id}: {e}")

    # Applicera cache igen (inkl. nyss hämtade)
    for m in fd_matches:
        mid = str(m.get("id"))
        espn_id = id_map.get(mid)
        if espn_id and espn_id in cache:
            _apply_espn(m, cache[espn_id])

    _jsave(cache_path, cache)


def _apply_espn(m, parsed):
    """Slår in ESPN-data i football-data.org match-dict via m['_espn']."""
    m["_espn"] = parsed
    # Uppdatera venue/referees/attendance direkt på m (scoring engine bryr sig ej)
    if parsed.get("venue"):
        m["venue"] = parsed["venue"]
    if parsed.get("referees"):
        m["referees"] = parsed["referees"]
    if parsed.get("attendance") is not None:
        m["attendance"] = parsed["attendance"]


# --------------------------------------------------------------------------- #
# Hjälpare: ESPN-prioriterade extraktorer för goals/bookings/subs
# --------------------------------------------------------------------------- #
def _goals(m):
    """Returnerar mål-lista i vår standard-format. ESPN-data prioriteras."""
    espn = m.get("_espn") or {}
    if espn.get("goals"):
        return espn["goals"]
    return extract_goals(m)


def _bookings(m):
    espn = m.get("_espn") or {}
    if espn.get("bookings"):
        return espn["bookings"]
    return extract_bookings(m)


def _subs(m):
    espn = m.get("_espn") or {}
    if espn.get("subs"):
        return espn["subs"]
    return extract_substitutions(m)


def patch_missing_scores_from_standings(matches, standings):
    """Fallback: om en FINISHED match saknar fullTime-score, försök rekonstruera
    resultatet ur standings. Fungerar säkert bara när varje lag spelat exakt 1 match
    i gruppen (dvs. matchdag 1 i ett mästerskap). Validerar GF/GA-konsistens."""
    standings_by_group = {}
    for s in standings or []:
        if (s.get("type") or "").upper() != "TOTAL":
            continue
        code = normalize_group_code(s.get("group") or "")
        if not code:
            continue
        for row in s.get("table", []) or []:
            t = row.get("team") or {}
            tid = t.get("id")
            if tid:
                standings_by_group.setdefault(code, {})[tid] = row

    for m in matches:
        if m.get("status") != "FINISHED":
            continue
        ft = ((m.get("score") or {}).get("fullTime") or {})
        if ft.get("home") is not None and ft.get("away") is not None:
            continue  # Redan känt

        group = normalize_group_code(m.get("group"))
        if not group or group not in standings_by_group:
            continue

        home_id = (m.get("homeTeam") or {}).get("id")
        away_id = (m.get("awayTeam") or {}).get("id")
        group_table = standings_by_group[group]
        home_row = group_table.get(home_id)
        away_row = group_table.get(away_id)

        if not home_row or not away_row:
            continue
        if home_row.get("playedGames", 0) != 1 or away_row.get("playedGames", 0) != 1:
            continue  # Mer än en match spelad - kan inte avgöra exakt

        h_gf = home_row.get("goalsFor")
        a_gf = away_row.get("goalsFor")
        if h_gf is None or a_gf is None:
            continue
        if home_row.get("goalsAgainst") != a_gf or away_row.get("goalsAgainst") != h_gf:
            continue  # Inkonsekvent data

        hn = (m.get("homeTeam") or {}).get("name", "?")
        an = (m.get("awayTeam") or {}).get("name", "?")
        print(f"  [standings-fallback] {hn} {h_gf}-{a_gf} {an}")

        if "score" not in m or m["score"] is None:
            m["score"] = {}
        m["score"]["fullTime"] = {"home": h_gf, "away": a_gf}
        if not m["score"].get("duration"):
            m["score"]["duration"] = "REGULAR"
        if h_gf > a_gf:
            m["score"]["winner"] = "HOME_TEAM"
        elif a_gf > h_gf:
            m["score"]["winner"] = "AWAY_TEAM"
        else:
            m["score"]["winner"] = "DRAW"


def fetch_data(token):
    matches = api_get(f"/competitions/{COMPETITION}/matches", token).get("matches", [])
    # ESPN: mål, kort, byten, uppställningar, statistik, odds (ingen token krävs)
    refresh_espn_data(matches)
    try:
        scorers = api_get(f"/competitions/{COMPETITION}/scorers?limit=20", token).get("scorers", [])
    except Exception:
        scorers = []
    try:
        standings = api_get(f"/competitions/{COMPETITION}/standings", token).get("standings", [])
    except Exception:
        standings = []
    patch_missing_scores_from_standings(matches, standings)
    return matches, scorers, standings


def normalize_group_code(s):
    """'GROUP_A' / 'Group A' / 'A' -> 'A'. Returnerar None för okänt."""
    if not s:
        return None
    s = str(s).upper().strip()
    if s.startswith("GROUP"):
        s = s.replace("GROUP_", "").replace("GROUP", "").strip()
    s = s.strip("_ ").strip()
    return s if s and len(s) <= 2 else None


def build_groups_from_standings(standings):
    groups = []
    for s in standings or []:
        if (s.get("type") or "").upper() != "TOTAL":
            continue
        code = normalize_group_code(s.get("group") or "")
        if not code:
            continue
        table = []
        for row in s.get("table", []) or []:
            t = row.get("team") or {}
            table.append({
                "team": t.get("name"),
                "tla": t.get("tla"),
                "played": row.get("playedGames", 0),
                "won": row.get("won", 0),
                "draw": row.get("draw", 0),
                "lost": row.get("lost", 0),
                "gf": row.get("goalsFor", 0),
                "ga": row.get("goalsAgainst", 0),
                "gd": row.get("goalDifference", 0),
                "points": row.get("points", 0),
            })
        groups.append({"code": code, "table": table})
    groups.sort(key=lambda g: g["code"])
    return groups


def derive_groups_from_matches(matches):
    """Fallback om standings-endpoint inte är tillgänglig. Bygger tabeller
    från färdigspelade gruppmatcher där varje match har 'group' satt."""
    teams = {}  # code -> name -> stats
    for m in matches:
        if m.get("stage") != GROUP_STAGE:
            continue
        code = normalize_group_code(m.get("group"))
        if not code:
            continue
        ht = m.get("homeTeam") or {}
        at = m.get("awayTeam") or {}
        ht_name, at_name = ht.get("name"), at.get("name")
        if not ht_name or not at_name:
            continue
        bucket = teams.setdefault(code, {})
        for t in (ht, at):
            bucket.setdefault(t.get("name"), {
                "team": t.get("name"), "tla": t.get("tla"),
                "played": 0, "won": 0, "draw": 0, "lost": 0,
                "gf": 0, "ga": 0, "gd": 0, "points": 0,
            })
        if not is_finished(m):
            continue
        sc = final_score(m)
        if not sc:
            continue
        h, a = sc
        H, A = bucket[ht_name], bucket[at_name]
        H["played"] += 1; A["played"] += 1
        H["gf"] += h; H["ga"] += a
        A["gf"] += a; A["ga"] += h
        if h > a:
            H["won"] += 1; H["points"] += 3; A["lost"] += 1
        elif a > h:
            A["won"] += 1; A["points"] += 3; H["lost"] += 1
        else:
            H["draw"] += 1; A["draw"] += 1
            H["points"] += 1; A["points"] += 1
        H["gd"] = H["gf"] - H["ga"]
        A["gd"] = A["gf"] - A["ga"]

    out = []
    for code in sorted(teams.keys()):
        table = sorted(teams[code].values(),
                       key=lambda r: (-r["points"], -r["gd"], -r["gf"], (r["team"] or "")))
        out.append({"code": code, "table": table})
    return out


# --------------------------------------------------------------------------- #
# Match-tolkning
# --------------------------------------------------------------------------- #
def is_finished(m):
    return m.get("status") == "FINISHED"


def is_knockout(m):
    return m.get("stage", GROUP_STAGE) != GROUP_STAGE


def final_score(m):
    """Resultat som poängsätts. För slutspel = ställning efter ev. förlängning
    (straffmål räknas INTE som mål). football-data lägger ET-mål i fullTime;
    straffar ligger separat. VERIFIERA fältnamnen mot riktig matchdata."""
    ft = (m.get("score") or {}).get("fullTime") or {}
    h, a = ft.get("home"), ft.get("away")
    if h is None or a is None:
        return None
    return (h, a)


def advancing_side(m):
    """Vilket lag går vidare i slutspel (straffvinnare räknas som vinnare).
    Returnerar 'HOME', 'AWAY' eller None om okänt (-> manuell kontroll)."""
    score = m.get("score") or {}
    winner = score.get("winner")
    if winner == "HOME_TEAM":
        return "HOME"
    if winner == "AWAY_TEAM":
        return "AWAY"
    # Oavgjort efter förlängning -> avgjort på straffar.
    pens = score.get("penalties") or m.get("penalties") or {}
    ph, pa = pens.get("home"), pens.get("away")
    if ph is not None and pa is not None and ph != pa:
        return "HOME" if ph > pa else "AWAY"
    return None  # kunde inte avgöra automatiskt


# --------------------------------------------------------------------------- #
# Poängsättning av en enskild match
# --------------------------------------------------------------------------- #
def score_one_match(m, tip, cfg):
    """tip = [home, away]. Returnerar (poäng, exakt_bool) eller None om matchen
    inte är klar."""
    if not is_finished(m):
        return None
    actual = final_score(m)
    if actual is None:
        return None
    th, ta = tip
    ah, aa = actual

    # 1) Exakt resultat
    if (th, ta) == (ah, aa):
        return cfg["exact"], True

    # 2) Rätt utgång
    if is_knockout(m):
        # Slutspel: utgång = vem som går vidare (straffar räknas).
        adv = advancing_side(m)
        tipped = "HOME" if th > ta else "AWAY" if ta > th else "DRAW"
        if adv is not None and tipped == adv:
            return cfg["outcome"], False
    else:
        # Gruppspel: utgång = matchresultatets utgång (oavgjort giltigt).
        actual_out = "HOME" if ah > aa else "AWAY" if aa > ah else "DRAW"
        tipped_out = "HOME" if th > ta else "AWAY" if ta > th else "DRAW"
        if tipped_out == actual_out:
            return cfg["outcome"], False

    # 3) Golv
    return cfg["floor"], False


# --------------------------------------------------------------------------- #
# Koppla en deltagares tips till rätt match
# --------------------------------------------------------------------------- #
def find_match(tip_entry, matches, resolve):
    """tip_entry kan ange 'id' (API-match-id) ELLER 'home'+'away' (+ ev 'date').
    Returnerar matchande match-dict eller None."""
    if "id" in tip_entry:
        for m in matches:
            if m.get("id") == tip_entry["id"]:
                return m
        return None
    home, away = tip_entry.get("home"), tip_entry.get("away")
    date = tip_entry.get("date")  # 'YYYY-MM-DD', valfritt extra filter
    for m in matches:
        if date and not (m.get("utcDate", "").startswith(date)):
            continue
        if resolve(home, m.get("homeTeam", {})) and resolve(away, m.get("awayTeam", {})):
            return m
    return None


# --------------------------------------------------------------------------- #
# Bonus: medaljer + skytteliga + manuella priser
# --------------------------------------------------------------------------- #
def derive_medals(matches, resolve):
    """Returnerar {'winner': namn|None, 'silver': ..., 'bronze': ...}."""
    out = {"winner": None, "silver": None, "bronze": None}
    for m in matches:
        if not is_finished(m):
            continue
        stage = m.get("stage")
        adv = advancing_side(m) or (
            "HOME" if (m.get("score") or {}).get("winner") == "HOME_TEAM"
            else "AWAY" if (m.get("score") or {}).get("winner") == "AWAY_TEAM" else None
        )
        home = (m.get("homeTeam") or {}).get("name")
        away = (m.get("awayTeam") or {}).get("name")
        if stage == "FINAL" and adv:
            out["winner"] = home if adv == "HOME" else away
            out["silver"] = away if adv == "HOME" else home
        elif stage == "THIRD_PLACE" and adv:
            out["bronze"] = home if adv == "HOME" else away
    return out


def top_scorer(scorers, manual):
    if manual:  # admin har bekräftat officiell Golden Boot (vid delad skytteliga)
        return manual
    if scorers:
        return (scorers[0].get("player") or {}).get("name")
    return None


# --------------------------------------------------------------------------- #
# Huvudberäkning
# --------------------------------------------------------------------------- #
def compute(tips, matches, scorers, standings=None, team_forms=None):
    cfg = tips["scoring"]
    resolve = build_team_resolver(tips.get("team_aliases", {}))
    anorm = make_alias_norm(tips.get("team_aliases", {}))
    bmatch = make_bonus_match(tips.get("team_aliases", {}))
    manual = tips.get("manual_results", {})

    medals = derive_medals(matches, resolve)
    actual_bonus = {
        "winner": medals["winner"],
        "silver": medals["silver"],
        "bronze": medals["bronze"],
        "top_scorer": top_scorer(scorers, manual.get("top_scorer")),
        "best_player": manual.get("best_player"),
        "best_young": manual.get("best_young"),
        "best_keeper": manual.get("best_keeper"),
    }
    bonus_pts = {
        "winner": cfg["winner"], "silver": cfg["silver"], "bronze": cfg["bronze"],
        "top_scorer": cfg["top_scorer"], "best_player": cfg["best_player"],
        "best_young": cfg["best_young"], "best_keeper": cfg["best_keeper"],
    }

    match_index = {m.get("id"): m for m in matches}
    match_rows = {}  # id -> rad med allas tips
    leaderboard = []
    unmatched = {}   # "Home vs Away" -> antal deltagare som tippat den men ingen API-match hittades

    for p in tips["participants"]:
        name = p["name"]
        match_points = 0
        exact_count = 0
        for entry in p.get("matches", []):
            m = find_match(entry, matches, resolve)
            tip = entry["tip"]
            if m is None:
                key = f"{entry.get('home')} vs {entry.get('away')}"
                unmatched[key] = unmatched.get(key, 0) + 1
                continue
            res = score_one_match(m, tip, cfg)
            pts = exact = None
            if res is not None:
                pts, exact = res
                match_points += pts
                if exact:
                    exact_count += 1
            row = match_rows.setdefault(m["id"], {
                "id": m["id"],
                "utcDate": m.get("utcDate"),
                "stage": m.get("stage"),
                "group": normalize_group_code(m.get("group")),
                "knockout": is_knockout(m),
                "home": (m.get("homeTeam") or {}).get("name"),
                "homeTla": (m.get("homeTeam") or {}).get("tla"),
                "away": (m.get("awayTeam") or {}).get("name"),
                "awayTla": (m.get("awayTeam") or {}).get("tla"),
                "status": m.get("status"),
                "score": final_score(m),
                "scoreDetail": detailed_score(m),
                "minute": m.get("minute"),
                "goals": _goals(m),
                "bookings": _bookings(m),
                "subs": _subs(m),
                "venue": (m.get("_espn") or {}).get("venue") or extract_venue(m),
                "referees": (m.get("_espn") or {}).get("referees") or extract_referees(m),
                "odds": extract_odds(m),
                "attendance": m.get("attendance"),
                "tips": [],
            })
            row["tips"].append({"name": name, "tip": tip, "points": pts})

        # Bonuspoäng (räknas bara när resultatet är känt)
        bonus_points = 0
        bonus_detail = {}
        for key, picked in (p.get("bonus") or {}).items():
            actual = actual_bonus.get(key)
            correct = bmatch(picked, actual)
            got = bonus_pts.get(key, 0) if correct else 0
            bonus_points += got
            bonus_detail[key] = {"pick": picked, "correct": correct, "points": got}

        leaderboard.append({
            "name": name,
            "match_points": match_points,
            "bonus_points": bonus_points,
            "total": match_points + bonus_points,
            "exact_count": exact_count,
            "bonus_detail": bonus_detail,
        })

    # Sortering: total, sedan tie-break = flest exakta resultat
    leaderboard.sort(key=lambda x: (-x["total"], -x["exact_count"], x["name"]))
    for i, row in enumerate(leaderboard, 1):
        row["rank"] = i

    # Prispott 50/30/20
    n = len(tips["participants"])
    total_pot = tips["pot_per_player"] * n
    splits = tips.get("prize_split", [0.5, 0.3, 0.2])
    prize = {str(i + 1): round(total_pot * s) for i, s in enumerate(splits)}
    for row in leaderboard:
        row["prize"] = prize.get(str(row["rank"]), 0)

    awards_pending = [k for k in ("top_scorer", "best_player", "best_young", "best_keeper")
                      if actual_bonus.get(k) is None]

    groups = build_groups_from_standings(standings or [])
    if not groups:
        groups = derive_groups_from_matches(matches)

    return {
        "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "pot": {"per_player": tips["pot_per_player"], "total": total_pot,
                "currency": tips.get("currency", "kr"), "split": prize},
        "leaderboard": leaderboard,
        "matches": sorted(match_rows.values(), key=lambda r: (r.get("utcDate") or "")),
        "groups": groups,
        "bonus_actual": actual_bonus,
        "bonus_points": bonus_pts,
        "awards_pending": awards_pending,
        "unmatched_tips": dict(sorted(unmatched.items(), key=lambda x: -x[1])),
        "knockout_rule": "ET-score for exact; penalties decide outcome",
        "team_forms": team_forms or {},
    }


def extract_goals(m):
    """Hämtar målskytte ur en match dict (football-data v4 shape).
    Returnerar [{minute, team, scorer, type, score:[h,a]}]. Tom om datat saknas."""
    out = []
    for g in (m.get("goals") or []):
        team = (g.get("team") or {})
        scorer = (g.get("scorer") or {})
        score = (g.get("score") or {})
        out.append({
            "minute": g.get("minute"),
            "injuryTime": g.get("injuryTime"),
            "team": team.get("tla") or team.get("shortName") or team.get("name"),
            "scorer": scorer.get("name"),
            "type": g.get("type"),
            "score": [score.get("home"), score.get("away")] if score else None,
        })
    return out


def extract_bookings(m):
    """Hämtar kort (yellow/red) ur match dict."""
    out = []
    for b in (m.get("bookings") or []):
        team = (b.get("team") or {})
        player = (b.get("player") or {})
        out.append({
            "minute": b.get("minute"),
            "team": team.get("tla") or team.get("shortName") or team.get("name"),
            "player": player.get("name"),
            "card": b.get("card"),
        })
    return out


def extract_substitutions(m):
    """Hämtar byten ur match dict."""
    out = []
    for s in (m.get("substitutions") or []):
        team = (s.get("team") or {})
        pin = (s.get("playerIn") or {})
        pout = (s.get("playerOut") or {})
        out.append({
            "minute": s.get("minute"),
            "team": team.get("tla") or team.get("shortName") or team.get("name"),
            "playerIn": pin.get("name"),
            "playerOut": pout.get("name"),
        })
    return out


def extract_odds(m):
    """football-data v4 har 'odds' med {homeWin, draw, awayWin} i vissa svar.
    Returnerar {H, D, A} som flyttal, eller None om saknas."""
    o = m.get("odds")
    if not isinstance(o, dict):
        return None
    h = o.get("homeWin") or o.get("home_win") or o.get("home")
    d = o.get("draw")
    a = o.get("awayWin") or o.get("away_win") or o.get("away")
    if h is None or d is None or a is None:
        return None
    try:
        return {"H": float(h), "D": float(d), "A": float(a)}
    except (TypeError, ValueError):
        return None


def extract_lineup(team_data):
    """Hämtar startuppställning, bänk, formering och tränare ur team-dict (football-data v4)."""
    if not isinstance(team_data, dict):
        return None
    lineup = [
        {"id": p.get("id"), "name": p.get("name"),
         "position": p.get("position"), "shirtNumber": p.get("shirtNumber")}
        for p in (team_data.get("lineup") or [])
    ]
    bench = [
        {"id": p.get("id"), "name": p.get("name"),
         "position": p.get("position"), "shirtNumber": p.get("shirtNumber")}
        for p in (team_data.get("bench") or [])
    ]
    if not lineup and not bench:
        return None
    coach = team_data.get("coach") or {}
    return {
        "formation": team_data.get("formation"),
        "lineup": lineup,
        "bench": bench,
        "coach": {"name": coach.get("name"), "nationality": coach.get("nationality")} if coach.get("name") else None,
    }


def extract_match_stats(team_data):
    """Hämtar matchstatistik (bollinnehav, skott etc.) ur team-dict (football-data v4).
    Returnerar dict med snake_case-nycklar, eller {} om ingen data."""
    if not isinstance(team_data, dict):
        return {}
    out = {}
    for s in (team_data.get("statistics") or []):
        t = s.get("type")
        v = s.get("value")
        if t is not None and v is not None:
            out[str(t).lower()] = v
    return out


def collect_wc_teams(matches):
    """Plocka unika lag (tla, id, name) ur match-listan."""
    out = {}
    for m in matches:
        for key in ("homeTeam", "awayTeam"):
            t = m.get(key) or {}
            tla = t.get("tla")
            tid = t.get("id")
            if tla and tid and tla not in out:
                out[tla] = {"id": tid, "tla": tla, "name": t.get("name")}
    return out


def fetch_team_forms(token, teams_by_tla, cache_path="team_forms.json",
                     max_age_hours=22):
    """För varje VM-lag, hämta senaste 5 färdigspelade matcherna via
    /teams/{id}/matches?status=FINISHED&limit=5.

    Cachar resultatet i team_forms.json. Om filen är fräsch (< max_age_hours)
    returneras cachen oförändrad - vi spar då all rate-limit-budget.

    free-tier på football-data: 10 req/min. 48 lag = ~5 min, kör därför
    bara en gång per dygn (separat workflow).
    """
    now = datetime.now(timezone.utc)
    cached = None
    try:
        with open(cache_path, "r", encoding="utf-8") as f:
            cached = json.load(f)
        ts = cached.get("updated_at")
        if ts:
            try:
                fetched_at = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                age_h = (now - fetched_at).total_seconds() / 3600
                if age_h < max_age_hours:
                    return cached.get("forms", {})
            except Exception:
                pass
    except FileNotFoundError:
        pass
    except Exception:
        pass

    forms = (cached or {}).get("forms", {}) if cached else {}
    updated = dict(forms)

    for tla, info in teams_by_tla.items():
        try:
            res = api_get(
                f"/teams/{info['id']}/matches?status=FINISHED&limit=5",
                token
            )
        except Exception:
            continue
        own_id = info["id"]
        own_tla = tla
        items = []
        # API ger matcher i datum-ordning; ta de 5 senaste.
        ms = (res.get("matches") or [])[-5:]
        for m in ms:
            ht = m.get("homeTeam") or {}
            at = m.get("awayTeam") or {}
            is_home = ht.get("id") == own_id
            opp = at if is_home else ht
            sc = (m.get("score") or {}).get("fullTime") or {}
            gh, ga = sc.get("home"), sc.get("away")
            if gh is None or ga is None:
                continue
            own_goals = gh if is_home else ga
            opp_goals = ga if is_home else gh
            if own_goals > opp_goals:
                r = "V"
            elif own_goals < opp_goals:
                r = "F"
            else:
                r = "O"
            items.append({
                "date": (m.get("utcDate") or "")[:10],
                "competition": ((m.get("competition") or {}).get("code")
                                or (m.get("competition") or {}).get("name")),
                "opp": opp.get("name"),
                "oppTla": opp.get("tla"),
                "gf": own_goals,
                "ga": opp_goals,
                "r": r,
            })
        updated[own_tla] = items

    payload = {"updated_at": now.isoformat(timespec="seconds"), "forms": updated}
    try:
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
    except Exception:
        pass
    return updated


def extract_venue(m):
    """Vissa football-data v4-svar har 'venue' (sträng eller dict)."""
    v = m.get("venue")
    if not v:
        return None
    if isinstance(v, str):
        return {"stadium": v, "city": None}
    if isinstance(v, dict):
        return {"stadium": v.get("name") or v.get("stadium"),
                "city": v.get("city") or v.get("location")}
    return None


def extract_referees(m):
    """Lista av domare {name, role, nationality}."""
    out = []
    for r in (m.get("referees") or []):
        out.append({
            "name": r.get("name"),
            "role": r.get("role") or r.get("type"),
            "nationality": r.get("nationality") or r.get("country"),
        })
    return out


def detailed_score(m):
    """Halvtid / förlängning / straffar / duration. None om saknas."""
    sc = m.get("score") or {}
    def pair(d):
        if not d:
            return None
        h, a = d.get("home"), d.get("away")
        return [h, a] if (h is not None and a is not None) else None
    return {
        "halfTime": pair(sc.get("halfTime")),
        "fullTime": pair(sc.get("fullTime")),
        "extraTime": pair(sc.get("extraTime")),
        "penalties": pair(sc.get("penalties")),
        "duration": sc.get("duration"),
        "winnerSide": sc.get("winner"),
    }


def build_fixtures(matches):
    return [{
        "id": m.get("id"),
        "utcDate": m.get("utcDate"),
        "stage": m.get("stage"),
        "group": normalize_group_code(m.get("group")),
        "home": (m.get("homeTeam") or {}).get("name"),
        "homeTla": (m.get("homeTeam") or {}).get("tla"),
        "away": (m.get("awayTeam") or {}).get("name"),
        "awayTla": (m.get("awayTeam") or {}).get("tla"),
        "status": m.get("status"),
        "score": final_score(m),
        "scoreDetail": detailed_score(m),
        "minute": m.get("minute"),
        "goals": _goals(m),
        "bookings": _bookings(m),
        "subs": _subs(m),
        "venue": (m.get("_espn") or {}).get("venue") or extract_venue(m),
        "referees": (m.get("_espn") or {}).get("referees") or extract_referees(m),
        "odds": extract_odds(m),
        "attendance": m.get("attendance"),
        "espnOdds": (m.get("_espn") or {}).get("espnOdds"),
        "homeLineup": (m.get("_espn") or {}).get("homeLineup") or extract_lineup(m.get("homeTeam") or {}),
        "awayLineup": (m.get("_espn") or {}).get("awayLineup") or extract_lineup(m.get("awayTeam") or {}),
        "homeStats": (m.get("_espn") or {}).get("homeStats") or extract_match_stats(m.get("homeTeam") or {}),
        "awayStats": (m.get("_espn") or {}).get("awayStats") or extract_match_stats(m.get("awayTeam") or {}),
        "homeForm": (m.get("_espn") or {}).get("homeForm", []),
        "awayForm": (m.get("_espn") or {}).get("awayForm", []),
    } for m in matches]


# --------------------------------------------------------------------------- #
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tips", default="tips.json")
    ap.add_argument("--mock", help="Lokal JSON med {'matches':[], 'scorers':[]} för test utan API")
    ap.add_argument("--out", default="data.json")
    ap.add_argument("--fixtures-out", default="fixtures.json")
    ap.add_argument("--forms-cache", default="team_forms.json",
                    help="Cache-fil för senaste-5-matcher per landslag.")
    ap.add_argument("--refresh-forms", action="store_true",
                    help="Tvinga ny hämtning av team-forms oavsett cache-ålder.")
    args = ap.parse_args()

    with open(args.tips, encoding="utf-8") as f:
        tips = json.load(f)

    team_forms = {}
    if args.mock:
        with open(args.mock, encoding="utf-8") as f:
            mock = json.load(f)
        matches = mock.get("matches", [])
        scorers = mock.get("scorers", [])
        standings = mock.get("standings", [])
        team_forms = mock.get("team_forms", {})
        # ESPN körs även i mock-läge (ingen token krävs)
        refresh_espn_data(matches)
        patch_missing_scores_from_standings(matches, standings)
    else:
        token = os.environ.get("FOOTBALL_DATA_TOKEN")
        if not token:
            sys.exit("FOOTBALL_DATA_TOKEN saknas (sätt som GitHub Secret eller miljövariabel).")
        matches, scorers, standings = fetch_data(token)
        if args.refresh_forms:
            # Daglig workflow: hämta nya senaste-5-matcher för alla 48 lag
            # (~5 min p.g.a. 10 req/min på free-tier).
            teams_by_tla = collect_wc_teams(matches)
            try:
                team_forms = fetch_team_forms(token, teams_by_tla,
                                              cache_path=args.forms_cache,
                                              max_age_hours=0)
            except Exception as e:
                print(f"VARNING: kunde inte uppdatera team_forms: {e}")
        # Snabbcron: läs ALDRIG från APIet, bara från cachen.
        if not team_forms:
            try:
                with open(args.forms_cache, "r", encoding="utf-8") as f:
                    team_forms = json.load(f).get("forms", {})
            except Exception:
                team_forms = {}

    data = compute(tips, matches, scorers, standings, team_forms=team_forms)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    with open(args.fixtures_out, "w", encoding="utf-8") as f:
        json.dump(build_fixtures(matches), f, ensure_ascii=False, indent=2)
    print(f"Skrev {args.out} ({len(data['leaderboard'])} deltagare, "
          f"{len(data['matches'])} matcher) och {args.fixtures_out}.")
    um = data.get("unmatched_tips") or {}
    if um:
        print(f"VARNING: {len(um)} fixtures matchade ingen API-match "
              f"(kolla lagnamn mot {args.fixtures_out} och justera team_aliases):")
        for k, n in um.items():
            print(f"    omatchad: {k}  ({n} tips)")
    else:
        print("Alla tippade fixtures matchade en API-match.")


if __name__ == "__main__":
    main()
