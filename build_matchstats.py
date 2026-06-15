#!/usr/bin/env python3
"""
Fetch DETAILED match statistics from FotMob's server-rendered match pages
(__NEXT_DATA__, no auth) + the heatmap endpoint, and write one file per match:

  matchstats/<ourFixtureId>.json = {
    team:   [{key,label,home,away}, ...],          # team comparison (possession, shots…)
    players:[{optaId,name,tla,gk,pos,shirt,rating, stats:{label:value,…}}, …],
    shots:  [{x,y,min,xg,tla,player,optaId,outcome,onTarget,goal}, …],
    heatmap:{viewBox, players:{optaId:[[x,y],…]}}
  }

NOT computed by us — all numbers come straight from FotMob. Matches are mapped to
our fixtures by team-TLA pair + date (same as build_xg.py). Incremental: a finished
match whose file already exists is skipped (pass --force to refetch).
Usage: python3 build_matchstats.py
"""
import json, re, sys, time, datetime, unicodedata, difflib
from pathlib import Path
from urllib import request as urlreq

BASE = Path(__file__).parent
OUT_DIR = BASE / "matchstats"
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36"}
LEAGUE = "https://www.fotmob.com/leagues/77/matches/world-cup"
NEXT = re.compile(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', re.S)
FORCE = "--force" in sys.argv

# team-stat key -> Swedish label (others are dropped)
TEAM_LABELS = {
    "BallPossesion": "Bollinnehav (%)", "expected_goals": "xG", "total_shots": "Skott",
    "ShotsOnTarget": "Skott på mål", "big_chance": "Stora målchanser",
    "touches_opp_box": "Kontakter i straffområdet", "accurate_passes": "Lyckade passningar",
    "fk_foul_won": "Frisparkar", "corners": "Hörnor", "Saves": "Räddningar",
    "yellow_card": "Gula kort", "red_card": "Röda kort", "tackles_succeeded": "Tacklingar",
    "interceptions": "Brytningar", "duel_won": "Närkamper vunna",
}
# player-stat key -> Swedish label (curated; order preserved in output). Keys
# verified against FotMob's __NEXT_DATA__ playerStats.
PLAYER_LABELS = [
    ("goals", "Mål"), ("assists", "Assist"), ("expected_goals", "xG"),
    ("expected_assists", "xA"), ("total_shots", "Skott"), ("ShotsOnTarget", "Skott på mål"),
    ("chances_created", "Målchanser skapade"), ("touches", "Bollkontakter"),
    ("touches_opp_box", "Kontakter i straffområdet"), ("dribbles_succeeded", "Lyckade dribblingar"),
    ("accurate_passes", "Lyckade passningar"), ("passes_into_final_third", "Passningar sista tredjedelen"),
    ("accurate_crosses", "Inlägg"), ("long_balls_accurate", "Långa bollar"),
    ("dispossessed", "Tappade bollen"), ("matchstats.headers.tackles", "Tacklingar"),
    ("shot_blocks", "Blockeringar"), ("clearances", "Rensningar"),
    ("interceptions", "Brytningar"), ("recoveries", "Återerövringar"),
    ("dribbled_past", "Dribblad förbi"), ("ground_duels_won", "Markdueller vunna"),
    ("aerials_won", "Luftdueller vunna"), ("duel_won", "Närkamper vunna"),
    ("duel_lost", "Närkamper förlorade"), ("was_fouled", "Blev fälld"),
    ("fouls", "Frisparkar emot"), ("saves", "Räddningar"),
    ("goals_conceded", "Insläppta mål"), ("goals_prevented", "Mål förhindrade"),
]


def norm(s):
    s = unicodedata.normalize("NFD", (s or "").lower().replace("&", "and"))
    return "".join(c for c in s if c.isalnum())


def get_next(url):
    with urlreq.urlopen(urlreq.Request(url, headers=UA), timeout=25) as r:
        html = r.read().decode("utf-8", "ignore")
    m = NEXT.search(html)
    return json.loads(m.group(1)) if m else None


def get_json(url):
    with urlreq.urlopen(urlreq.Request(url, headers={**UA, "Referer": "https://www.fotmob.com/"}), timeout=25) as r:
        return json.loads(r.read().decode("utf-8", "ignore"))


def num(v):
    if isinstance(v, str):
        m = re.match(r"^-?\d+(\.\d+)?", v.strip())
        if not m:
            return v
        f = float(m.group(0))
        return int(f) if f.is_integer() else round(f, 2)
    return v


def extract_team(content):
    out, seen = [], set()
    groups = ((content.get("stats") or {}).get("Periods") or {}).get("All") or {}
    for g in groups.get("stats", []):
        for s in g.get("stats", []):
            key = s.get("key")
            vals = s.get("stats")
            if key in TEAM_LABELS and key not in seen and isinstance(vals, list) and len(vals) == 2:
                seen.add(key)
                out.append({"key": key, "label": TEAM_LABELS[key], "home": num(vals[0]), "away": num(vals[1])})
    return out


def extract_players(content, tla_of):
    label_map = dict(PLAYER_LABELS)
    order = [lbl for _, lbl in PLAYER_LABELS]
    out = []
    for pid, p in (content.get("playerStats") or {}).items():
        flat = {}
        rating = None
        for grp in p.get("stats", []):
            for label, v in (grp.get("stats") or {}).items():
                key = v.get("key")
                val = (v.get("stat") or {}).get("value")
                if key == "rating_title":
                    rating = val
                    continue
                if key in label_map and val is not None:
                    flat[label_map[key]] = num(val)
        ordered = {lbl: flat[lbl] for lbl in order if lbl in flat}
        out.append({
            "optaId": str(p.get("optaId") or ""),
            "name": p.get("name"),
            "tla": tla_of(p.get("teamId")),
            "gk": bool(p.get("isGoalkeeper")),
            "pos": p.get("usualPosition"),
            "shirt": p.get("shirtNumber"),
            "rating": rating,
            "stats": ordered,
        })
    out.sort(key=lambda x: (x["rating"] or 0), reverse=True)
    return out


def extract_shots(content, tla_of):
    out = []
    for s in (content.get("shotmap") or {}).get("shots", []):
        et = (s.get("eventType") or "").lower()
        out.append({
            "x": round(s.get("x", 0), 2), "y": round(s.get("y", 0), 2),
            "min": s.get("min"), "xg": round(s.get("expectedGoals") or 0, 3),
            "tla": tla_of(s.get("teamId")), "player": s.get("playerName"),
            "optaId": str(s.get("playerId") or ""),
            "goal": et == "goal", "onTarget": bool(s.get("isOnTarget")),
            "outcome": s.get("eventType"),
        })
    return out


def extract_heatmap(fm_match_id):
    url = (f"https://www.fotmob.com/api/data/heatmap/match/{fm_match_id}/heatmaps"
           f"?heatmapUrl=https://pub.fotmob.com/prod/db/api/heatmap/match/{fm_match_id}")
    try:
        d = get_json(url)
    except Exception:
        return None
    tmpl = d.get("template") or ""
    vb = re.search(r'viewBox="([^"]+)"', tmpl)
    players = {}
    for pkey, svg in (d.get("players") or {}).items():
        opta = pkey[1:] if pkey.startswith("p") else pkey
        pts = [[round(float(x), 1), round(float(y), 1)]
               for x, y in re.findall(r'<circle cx="([\d.]+)" cy="([\d.]+)"', svg)]
        if pts:
            players[opta] = pts
    return {"viewBox": vb.group(1) if vb else "0 0 105 68", "players": players}


def main():
    OUT_DIR.mkdir(exist_ok=True)
    fixtures = json.loads((BASE / "fixtures.json").read_text(encoding="utf-8"))
    our_norm2tla = {}
    for m in fixtures:
        if m.get("homeTla"):
            our_norm2tla[norm(m.get("home"))] = m["homeTla"]
        if m.get("awayTla"):
            our_norm2tla[norm(m.get("away"))] = m["awayTla"]
    our_norm2tla.setdefault("usa", "USA")

    fx_by_pair = {}
    for m in fixtures:
        if m.get("homeTla") and m.get("awayTla"):
            fx_by_pair.setdefault(frozenset([m["homeTla"], m["awayTla"]]), []).append(m)

    def fm_tla(name):
        n = norm(name)
        if n in our_norm2tla:
            return our_norm2tla[n]
        best = max(our_norm2tla, key=lambda x: difflib.SequenceMatcher(None, n, x).ratio(), default=None)
        if best and difflib.SequenceMatcher(None, n, best).ratio() >= 0.7:
            return our_norm2tla[best]
        return None

    data = get_next(LEAGUE)
    matches = data["props"]["pageProps"]["overview"]["matches"]["allMatches"]
    now = datetime.datetime.now(datetime.timezone.utc)
    done = 0
    for fm in matches:
        st = fm.get("status") or {}
        ut = st.get("utcTime") or ""
        try:
            ko = datetime.datetime.fromisoformat(ut.replace("Z", "+00:00"))
        except ValueError:
            continue
        if ko > now:
            continue
        finished = bool(st.get("finished"))
        htla, atla = fm_tla(fm["home"]["name"]), fm_tla(fm["away"]["name"])
        if not htla or not atla:
            continue
        cands = fx_by_pair.get(frozenset([htla, atla])) or []
        d = ut[:10]
        fx = next((c for c in cands if (c.get("utcDate") or "")[:10] == d), cands[0] if len(cands) == 1 else None)
        if not fx:
            continue
        out_path = OUT_DIR / f"{fx['id']}.json"
        # Skip a finished match ONLY if its file was already written as finished.
        # A file written while the match was still live holds mid-match stats —
        # re-fetch once it's done so the FINAL ratings/xG/goals are captured.
        if finished and out_path.exists() and not FORCE:
            try:
                if json.loads(out_path.read_text(encoding="utf-8")).get("finished"):
                    continue
            except Exception:
                pass

        try:
            pp = get_next("https://www.fotmob.com" + fm["pageUrl"].split("#")[0])["props"]["pageProps"]
        except Exception as e:
            print(f"  ! {fm['home']['name']}-{fm['away']['name']}: {e}")
            continue
        content = pp.get("content") or {}
        lineup = content.get("lineup") or {}
        fm_match_id = lineup.get("matchId") or fm.get("id")

        # FotMob teamId -> our TLA
        fm_home_id = (lineup.get("homeTeam") or {}).get("id") or fm["home"].get("id")
        fm_away_id = (lineup.get("awayTeam") or {}).get("id") or fm["away"].get("id")
        fm_home_is_our_home = fm_tla(fm["home"]["name"]) == fx.get("homeTla")
        id2tla = {}
        if fm_home_id is not None:
            id2tla[fm_home_id] = fx["homeTla"] if fm_home_is_our_home else fx["awayTla"]
        if fm_away_id is not None:
            id2tla[fm_away_id] = fx["awayTla"] if fm_home_is_our_home else fx["homeTla"]

        def tla_of(team_id):
            return id2tla.get(team_id)

        team = extract_team(content)
        players = extract_players(content, tla_of)
        shots = extract_shots(content, tla_of)
        heatmap = extract_heatmap(fm_match_id) if fm_match_id else None
        # orient team stats so [home, away] matches OUR fixture
        if not fm_home_is_our_home:
            for t in team:
                t["home"], t["away"] = t["away"], t["home"]

        out = {
            "fixtureId": fx["id"], "fmMatchId": fm_match_id,
            "homeTla": fx["homeTla"], "awayTla": fx["awayTla"],
            "finished": finished, "updated": now.isoformat(),
            "team": team, "players": players, "shots": shots, "heatmap": heatmap,
        }
        out_path.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        done += 1
        hm = len((heatmap or {}).get("players") or {})
        print(f"  {fx['homeTla']}-{fx['awayTla']}: {len(players)} spelare, {len(shots)} skott, {hm} heatmaps, {len(team)} lagstatistik")
        time.sleep(1.0)

    rebuild_index(fixtures)
    print(f"\nWrote {done} match-stats file(s) + index.json to matchstats/.")


def rebuild_index(fixtures):
    """Index every match-stats file so player profiles can find a player's
    matches by name: {fixtures:{id:{h,a,d}}, players:{normName:{opta,name,fx:[id…]}}}."""
    fx_date = {str(m["id"]): (m.get("utcDate") or "")[:10] for m in fixtures}
    idx = {"fixtures": {}, "players": {}}
    files = sorted(OUT_DIR.glob("*.json"), key=lambda p: fx_date.get(p.stem, ""))
    for f in files:
        if f.name == "index.json":
            continue
        try:
            d = json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            continue
        fid = str(d.get("fixtureId"))
        idx["fixtures"][fid] = {"h": d.get("homeTla"), "a": d.get("awayTla"), "d": fx_date.get(fid, "")}
        for p in d.get("players", []):
            if not p.get("name") or p.get("rating") is None:
                continue
            key = norm(p["name"])
            entry = idx["players"].setdefault(key, {"opta": p.get("optaId"), "name": p["name"], "fx": []})
            entry["fx"].append(fid)
    # most-recent match first
    for e in idx["players"].values():
        e["fx"].sort(key=lambda fid: idx["fixtures"].get(fid, {}).get("d", ""), reverse=True)
    (OUT_DIR / "index.json").write_text(json.dumps(idx, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    main()
