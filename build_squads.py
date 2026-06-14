#!/usr/bin/env python3
"""
Seed players.json with the FULL squads of all 48 World Cup teams from ESPN
(no auth). Gives every player who will play immediate coverage: position,
shirt number, nationality, age, height, weight + a best-effort headshot.

Entries already populated by TheSportsDB (build_players.py, which has richer
club/photo data) are preserved — this only ADDS missing players and backfills
espnId. Run build_players.py afterwards to enrich the ESPN-seeded players with
TheSportsDB cutouts/club.

Usage:  python3 build_squads.py
"""
import json, time
from pathlib import Path
from urllib import request as urlreq

BASE = Path(__file__).parent
DB_PATH = BASE / "players.json"
ESPN = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world"
UA = {"User-Agent": "Mozilla/5.0 (vm2026-bot)"}


def get(url):
    req = urlreq.Request(url, headers=UA)
    for attempt in range(4):
        try:
            with urlreq.urlopen(req, timeout=15) as r:
                return json.loads(r.read())
        except Exception as e:
            if attempt < 3:
                time.sleep(2 * (attempt + 1))
            else:
                print(f"  ! {e}")
                return None
    return None


def cm(inches):
    try:
        return f"{round(float(inches) * 2.54)} cm"
    except (TypeError, ValueError):
        return None


def kg(lbs):
    try:
        return f"{round(float(lbs) * 0.4536)} kg"
    except (TypeError, ValueError):
        return None


def headshot(pid):
    return f"https://a.espncdn.com/i/headshots/soccer/players/full/{pid}.png"


def entry_from_athlete(a):
    pid = a.get("id")
    pos = (a.get("position") or {}).get("displayName") or (a.get("position") or {}).get("name")
    dob = a.get("dateOfBirth") or ""
    hs = headshot(pid) if pid else None
    return {
        "thumb": hs,
        "cutout": hs,
        "render": None,
        "team": None,            # ESPN roster has no club; TheSportsDB fills this in
        "position": pos,
        "nationality": a.get("citizenship") or a.get("citizenshipCountry"),
        "born": dob[:10] if dob else None,
        "birthPlace": (a.get("birthPlace") or {}).get("city") if isinstance(a.get("birthPlace"), dict) else None,
        "height": cm(a.get("height")),
        "weight": kg(a.get("weight")),
        "foot": None,
        "natJersey": a.get("jersey"),
        "teamBadge": None,
        "teamLeague": None,
        "teamCountry": None,
        "espnId": str(pid) if pid else None,
        "_source": "espn",
    }


# ── load existing DB ──────────────────────────────────────────────────────────
try:
    with open(DB_PATH, encoding="utf-8") as f:
        db = json.load(f)
    print(f"Loaded {len(db)} existing entries.")
except FileNotFoundError:
    db = {}
    print("No existing players.json — starting fresh.")

# ── teams ─────────────────────────────────────────────────────────────────────
data = get(f"{ESPN}/teams?limit=60")
teams = []
if data:
    for lg in data.get("sports", [{}])[0].get("leagues", []):
        teams += lg.get("teams", [])
print(f"ESPN World Cup teams: {len(teams)}")

added = backfilled = 0
for i, t in enumerate(teams, 1):
    tt = t.get("team", {})
    tid, tname = tt.get("id"), tt.get("displayName")
    if not tid:
        continue
    roster = get(f"{ESPN}/teams/{tid}/roster")
    ath = (roster or {}).get("athletes") or []
    print(f"[{i:2}/{len(teams)}] {tname}: {len(ath)} spelare", flush=True)
    for a in ath:
        name = a.get("displayName") or a.get("fullName")
        if not name:
            continue
        existing = db.get(name)
        if isinstance(existing, dict) and not existing.get("_source") == "espn" and not existing.get("_notFound"):
            # richer TheSportsDB entry — keep it, just backfill espnId
            if not existing.get("espnId") and a.get("id"):
                existing["espnId"] = str(a["id"])
                backfilled += 1
            continue
        db[name] = entry_from_athlete(a)
        added += 1
    time.sleep(0.6)

with open(DB_PATH, "w", encoding="utf-8") as f:
    json.dump(db, f, ensure_ascii=False, indent=2)

print(f"\nDone. Added {added} new players, backfilled espnId on {backfilled}.")
print(f"players.json now has {len(db)} entries.")
