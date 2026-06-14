#!/usr/bin/env python3
"""
Build / update players.json with data from TheSportsDB.
Reads all player names from fixtures.json and fetches missing ones.
Existing entries are NOT re-fetched (safe to re-run).

Usage:
    python3 build_players.py
"""
import json, re, sys, time
from pathlib import Path
from urllib import request as urlreq, parse

BASE = Path(__file__).parent
DB_PATH = BASE / "players.json"
TSDB = "https://www.thesportsdb.com/api/v1/json/3"


def tsdb_get(endpoint, **params):
    url = f"{TSDB}/{endpoint}?" + parse.urlencode(params)
    req = urlreq.Request(url, headers={"User-Agent": "vm2026-bot/1.0"})
    for attempt in range(4):
        try:
            with urlreq.urlopen(req, timeout=12) as r:
                return json.loads(r.read())
        except Exception as e:
            status = getattr(getattr(e, 'code', None), '__int__', lambda: None)()
            is_429 = "429" in str(e)
            if is_429 or (hasattr(e, 'code') and e.code == 429):
                wait = 30 * (2 ** attempt)
                print(f" [429 – waiting {wait}s]", end="", flush=True)
                time.sleep(wait)
            elif attempt < 3:
                time.sleep(3)
            else:
                raise
    raise RuntimeError("Max retries exceeded")


def parse_height(s):
    if not s:
        return None
    m = re.search(r"(\d{2,3})\s*cm", s, re.I)
    if m:
        return m.group(1) + " cm"
    m = re.search(r"(\d+)[.,](\d+)\s*m", s)
    if m:
        return str(round(float(m.group(1) + "." + m.group(2)) * 100)) + " cm"
    return None


def parse_weight(s):
    if not s:
        return None
    m = re.search(r"(\d+)\s*kg", s, re.I)
    if m:
        return m.group(1) + " kg"
    m = re.search(r"(\d+)\s*lb", s, re.I)
    if m:
        return str(round(int(m.group(1)) * 0.4536)) + " kg"
    return None


def fetch_player(name):
    """Returns a data dict, or None if genuinely not found in TheSportsDB.
    Transient errors (rate limit / network) propagate so the caller can retry
    later instead of marking the player as done."""
    # 1. Search
    data = tsdb_get("searchplayers.php", p=name)
    players = data.get("player") or []
    if not players:
        return None
    # Prefer exact name match + soccer sport; fall back to first soccer player
    soccer = [p for p in players if (p.get("strSport") or "").lower() == "soccer"]
    pool = soccer if soccer else players
    basic = next(
        (p for p in pool if (p.get("strPlayer") or "").lower() == name.lower()),
        pool[0],
    )

    time.sleep(1.5)

    # 2. Full player lookup
    full = tsdb_get("lookupplayer.php", id=basic["idPlayer"])
    fp = (full.get("players") or [{}])[0]

    time.sleep(1.5)

    # 3. Team lookup — use fp.idTeam (club) not basic.idTeam (may be national)
    team_id = fp.get("idTeam") or basic.get("idTeam")
    team = {}
    if team_id:
        td = tsdb_get("lookupteam.php", id=team_id)
        t = (td.get("teams") or [{}])[0]
        league = t.get("strLeague") or ""
        # Discard national teams and placeholder leagues
        if league and not league.startswith("_") and "International" not in league:
            team = t

    return {
        "thumb":        fp.get("strThumb")        or basic.get("strThumb"),
        "cutout":       fp.get("strCutout")       or basic.get("strCutout"),
        "render":       fp.get("strRender"),
        "team":         team.get("strTeam"),
        "position":     fp.get("strPosition")     or basic.get("strPosition"),
        "nationality":  fp.get("strNationality")  or basic.get("strNationality"),
        "born":         fp.get("dateBorn")        or basic.get("dateBorn"),
        "birthPlace":   fp.get("strBirthLocation"),
        "height":       parse_height(fp.get("strHeight")),
        "weight":       parse_weight(fp.get("strWeight")),
        "foot":         fp.get("strSide"),
        "natJersey":    fp.get("strNumber"),
        "teamBadge":    team.get("strBadge"),
        "teamLeague":   team.get("strLeague"),
        "teamCountry":  team.get("strCountry"),
        "teamStadium":  team.get("strStadium"),
        "teamCapacity": team.get("intStadiumCapacity"),
        "teamCity":     team.get("strLocation"),
    }


# ── Load existing DB ─────────────────────────────────────────────────────────
try:
    with open(DB_PATH, encoding="utf-8") as f:
        db = json.load(f)
    print(f"Loaded {len(db)} existing entries from players.json")
except FileNotFoundError:
    db = {}
    print("No existing players.json — starting fresh.")

# ── Collect names from fixtures ──────────────────────────────────────────────
with open(BASE / "fixtures.json", encoding="utf-8") as f:
    fixtures = json.load(f)

names: set[str] = set()
for m in fixtures:
    for side in ("homeLineup", "awayLineup"):
        lu = m.get(side) or {}
        for p in (lu.get("lineup") or []) + (lu.get("bench") or []):
            if p.get("name"):
                names.add(p["name"])
# Also enrich everyone seeded from ESPN squads (build_squads.py) so the whole
# tournament's player pool gets TheSportsDB cutouts/club, not just lineups.
names |= set(db.keys())

print(f"Found {len(names)} unique players (lineups + seeded squads).")
# Fetch if: never fetched (None), or ESPN-seeded but still lacking club data and
# not yet tried via TheSportsDB. Skip confirmed-absent and already-rich entries.
def needs_fetch(v):
    if v is None: return True                                      # not yet fetched
    if isinstance(v, dict) and v.get('_notFound'): return False    # confirmed absent
    if isinstance(v, dict) and v.get('_source') == 'espn' and not v.get('team') and not v.get('_tsdbTried'):
        return True                                                # ESPN seed → enrich
    return False                                                   # has rich data
missing = sorted(n for n in names if n not in db or needs_fetch(db[n]))
# Prioritise players from the biggest footballing nations so famous names
# (Mbappé, Messi, Yamal…) get their club/photo first instead of waiting for the
# rate-limited alphabetical crawl.
PRIORITY_NATIONS = {
    "France", "Argentina", "Spain", "England", "Brazil", "Portugal",
    "Germany", "Netherlands", "Belgium", "Croatia", "Italy", "Uruguay",
}
missing.sort(key=lambda n: (0 if ((db.get(n) or {}).get("nationality") in PRIORITY_NATIONS) else 1, n))
print(f"Need to fetch {len(missing)} new players.\n")

if not missing:
    print("Nothing to do — players.json is up to date.")
    sys.exit(0)

# ── Fetch ────────────────────────────────────────────────────────────────────
errors = []
for i, name in enumerate(missing, 1):
    print(f"[{i:3}/{len(missing)}] {name} ...", end=" ", flush=True)
    try:
        info = fetch_player(name)
    except Exception as e:
        print(f"· transient ({str(e)[:40]}) — retry later")
        time.sleep(3.0)
        continue  # leave entry untouched so a later run retries
    prev = db.get(name)
    espn_seed = isinstance(prev, dict) and prev.get("_source") == "espn"
    if info:
        if espn_seed:
            # Merge: TheSportsDB values win where present, ESPN fills the gaps
            # (keeps espnId, jersey, dob, height when TSDB lacks them).
            merged = dict(prev)
            for k, v in info.items():
                if v:
                    merged[k] = v
            merged.pop("_source", None)
            merged.pop("_tsdbTried", None)
            db[name] = merged
        else:
            db[name] = info
        club = info.get("team") or "?"
        league = info.get("teamLeague") or "no league"
        print(f"✓  {club} · {league}")
    else:
        if espn_seed:
            prev["_tsdbTried"] = True   # keep ESPN bio, don't retry endlessly
            db[name] = prev
            print("· kept ESPN data")
        else:
            db[name] = info
            errors.append(name)
            print("✗  not found")
    # Save after every player so progress is never lost on crash
    with open(DB_PATH, "w", encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False, indent=2)
    time.sleep(2.0)

found = sum(1 for v in db.values() if v)
print(f"\nSaved {len(db)} entries ({found} with data) to players.json")
if errors:
    print(f"Not found in TSDB ({len(errors)}): {', '.join(errors)}")
