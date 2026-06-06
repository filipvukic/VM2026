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


def fetch_data(token):
    matches = api_get(f"/competitions/{COMPETITION}/matches", token).get("matches", [])
    try:
        scorers = api_get(f"/competitions/{COMPETITION}/scorers?limit=20", token).get("scorers", [])
    except Exception:
        scorers = []  # scorers-endpoint kan saknas tidigt i turneringen
    try:
        standings = api_get(f"/competitions/{COMPETITION}/standings", token).get("standings", [])
    except Exception:
        standings = []  # gratisplanen kan sakna standings -> härleds ur matcher
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
def compute(tips, matches, scorers, standings=None):
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
                "goals": extract_goals(m),
                "bookings": extract_bookings(m),
                "subs": extract_substitutions(m),
                "venue": extract_venue(m),
                "referees": extract_referees(m),
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
        "goals": extract_goals(m),
        "bookings": extract_bookings(m),
        "subs": extract_substitutions(m),
        "venue": extract_venue(m),
        "referees": extract_referees(m),
    } for m in matches]


# --------------------------------------------------------------------------- #
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tips", default="tips.json")
    ap.add_argument("--mock", help="Lokal JSON med {'matches':[], 'scorers':[]} för test utan API")
    ap.add_argument("--out", default="data.json")
    ap.add_argument("--fixtures-out", default="fixtures.json")
    args = ap.parse_args()

    with open(args.tips, encoding="utf-8") as f:
        tips = json.load(f)

    if args.mock:
        with open(args.mock, encoding="utf-8") as f:
            mock = json.load(f)
        matches = mock.get("matches", [])
        scorers = mock.get("scorers", [])
        standings = mock.get("standings", [])
    else:
        token = os.environ.get("FOOTBALL_DATA_TOKEN")
        if not token:
            sys.exit("FOOTBALL_DATA_TOKEN saknas (sätt som GitHub Secret eller miljövariabel).")
        matches, scorers, standings = fetch_data(token)

    data = compute(tips, matches, scorers, standings)
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
