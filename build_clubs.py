#!/usr/bin/env python3
"""
One-time club fetch: fill the `team` (club) + `teamBadge` for every player that
has an ESPN id but no club yet, using ESPN's athlete endpoint (fast, reliable,
not rate-limited like TheSportsDB). Clubs don't change during the tournament, so
this only needs to run once (safe to re-run; skips players that already have a club).

Usage:  python3 build_clubs.py
"""
import json, time
from pathlib import Path
from urllib import request as urlreq

BASE = Path(__file__).parent
DB_PATH = BASE / "players.json"
ATHLETE = "https://site.web.api.espn.com/apis/common/v3/sports/soccer/all/athletes/"
UA = {"User-Agent": "Mozilla/5.0 (vm2026-bot)"}


def get(url):
    req = urlreq.Request(url, headers=UA)
    for attempt in range(3):
        try:
            with urlreq.urlopen(req, timeout=12) as r:
                return json.loads(r.read())
        except Exception:
            if attempt < 2:
                time.sleep(1.5 * (attempt + 1))
            else:
                return None
    return None


with open(DB_PATH, encoding="utf-8") as f:
    db = json.load(f)
print(f"Loaded {len(db)} players.")

todo = [
    (name, e["espnId"])
    for name, e in db.items()
    if isinstance(e, dict) and not e.get("team") and e.get("espnId") and not e.get("_clubTried")
]
print(f"Fetching club for {len(todo)} players from ESPN.\n")

found = 0
for i, (name, eid) in enumerate(todo, 1):
    d = get(ATHLETE + str(eid))
    a = (d or {}).get("athlete", d or {})
    t = a.get("team") or {}
    club = t.get("displayName")
    if club and not t.get("isNational"):
        db[name]["team"] = club
        badge = (t.get("logos") or [{}])[0].get("href") if t.get("logos") else None
        if badge:
            db[name]["teamBadge"] = badge
        found += 1
    else:
        db[name]["_clubTried"] = True
    if i % 25 == 0 or i == len(todo):
        print(f"[{i:4}/{len(todo)}]  +{found} clubs", flush=True)
        with open(DB_PATH, "w", encoding="utf-8") as f:
            json.dump(db, f, ensure_ascii=False, indent=2)
    time.sleep(0.15)

with open(DB_PATH, "w", encoding="utf-8") as f:
    json.dump(db, f, ensure_ascii=False, indent=2)
total = sum(1 for v in db.values() if isinstance(v, dict) and v.get("team"))
print(f"\nDone. Added {found} clubs. Players with club now: {total}/{len(db)}")
