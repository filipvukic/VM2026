#!/usr/bin/env python3
"""
Fill the remaining missing player photos. For each player without any photo:
  1) try the ESPN headshot (verify it actually 200s),
  2) else TheSportsDB searchplayers cutout/thumb.
One-time, incremental, safe to re-run. Marks _photoTried so it won't loop.

Usage:  python3 build_facephotos.py
"""
import json, time
from pathlib import Path
from urllib import request as urlreq, parse, error as urlerr

BASE = Path(__file__).parent
DB_PATH = BASE / "players.json"
TSDB = "https://www.thesportsdb.com/api/v1/json/3"
UA = {"User-Agent": "Mozilla/5.0 (vm2026-bot)"}


def head_ok(url):
    try:
        req = urlreq.Request(url, method="HEAD", headers=UA)
        return urlreq.urlopen(req, timeout=8).status == 200
    except Exception:
        return False


def tsdb_photo(name):
    url = f"{TSDB}/searchplayers.php?" + parse.urlencode({"p": name})
    req = urlreq.Request(url, headers=UA)
    for attempt in range(3):
        try:
            with urlreq.urlopen(req, timeout=12) as r:
                data = json.loads(r.read())
            break
        except urlerr.HTTPError as e:
            if e.code == 429:
                time.sleep(30 * (attempt + 1))
            else:
                return None, None
        except Exception:
            return None, None
    else:
        return None, None
    players = (data or {}).get("player") or []
    soccer = [p for p in players if (p.get("strSport") or "").lower() == "soccer"]
    pool = soccer or players
    p = next((x for x in pool if (x.get("strPlayer") or "").lower() == name.lower()), pool[0] if pool else None)
    if not p:
        return None, None
    return p.get("strCutout"), p.get("strThumb")


with open(DB_PATH, encoding="utf-8") as f:
    db = json.load(f)

todo = [
    name
    for name, e in db.items()
    if isinstance(e, dict)
    and not (e.get("cutout") or e.get("wiki") or e.get("render") or e.get("thumb"))
    and not e.get("_photoTried")
]
print(f"Missing photo for {len(todo)} players.\n")

found = 0
for i, name in enumerate(todo, 1):
    e = db[name]
    got = None
    # 1) ESPN headshot (verify)
    eid = e.get("espnId")
    if eid:
        hs = f"https://a.espncdn.com/i/headshots/soccer/players/full/{eid}.png"
        if head_ok(hs):
            e["espnPhoto"] = hs
            e["cutout"] = hs
            got = hs
    # 2) TheSportsDB cutout/thumb
    if not got:
        cut, thumb = tsdb_photo(name)
        if cut or thumb:
            if cut:
                e["cutout"] = cut
            if thumb:
                e["thumb"] = thumb
            got = cut or thumb
        time.sleep(1.5)
    if got:
        found += 1
    else:
        e["_photoTried"] = True
    if i % 10 == 0 or i == len(todo):
        print(f"[{i:4}/{len(todo)}]  +{found} photos", flush=True)
        with open(DB_PATH, "w", encoding="utf-8") as f:
            json.dump(db, f, ensure_ascii=False, indent=2)

with open(DB_PATH, "w", encoding="utf-8") as f:
    json.dump(db, f, ensure_ascii=False, indent=2)
total = sum(1 for v in db.values() if isinstance(v, dict) and (v.get("cutout") or v.get("wiki") or v.get("render") or v.get("thumb")))
print(f"\nDone. +{found}. Players with photo now: {total}/{len(db)}")
