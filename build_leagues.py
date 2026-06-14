#!/usr/bin/env python3
"""
Fill teamLeague for players that have a club but no league, using ESPN's athlete
statsSummary ("2025-26 LALIGA Stats" -> "LALIGA"). One-time, incremental.
Usage: python3 build_leagues.py
"""
import json, re, time
from pathlib import Path
from urllib import request as urlreq

BASE = Path(__file__).parent
DB = BASE / "players.json"
ATHLETE = "https://site.web.api.espn.com/apis/common/v3/sports/soccer/all/athletes/"
UA = {"User-Agent": "Mozilla/5.0 (vm2026-bot)"}


def league_for(espn_id):
    try:
        with urlreq.urlopen(urlreq.Request(ATHLETE + str(espn_id), headers=UA), timeout=12) as r:
            d = json.loads(r.read())
        dn = ((d.get("athlete", d) or {}).get("statsSummary") or {}).get("displayName") or ""
        lg = re.sub(r"^\d{4}-\d{2}\s+", "", dn)
        lg = re.sub(r"\s+Stats$", "", lg).strip()
        return lg or None
    except Exception:
        return None


db = json.loads(DB.read_text(encoding="utf-8"))
todo = [n for n, e in db.items() if isinstance(e, dict) and e.get("team") and not e.get("teamLeague") and e.get("espnId") and not e.get("_leagueTried")]
print(f"Filling league for {len(todo)} players…\n")

found = 0
for i, name in enumerate(todo, 1):
    lg = league_for(db[name]["espnId"])
    if lg:
        db[name]["teamLeague"] = lg
        found += 1
    else:
        db[name]["_leagueTried"] = True
    if i % 30 == 0 or i == len(todo):
        print(f"[{i:4}/{len(todo)}] +{found} leagues", flush=True)
        DB.write_text(json.dumps(db, ensure_ascii=False, indent=2), encoding="utf-8")
    time.sleep(0.12)

DB.write_text(json.dumps(db, ensure_ascii=False, indent=2), encoding="utf-8")
tot = sum(1 for v in db.values() if isinstance(v, dict) and v.get("teamLeague"))
print(f"\nDone. +{found}. Players with league: {tot}/{len(db)}")
