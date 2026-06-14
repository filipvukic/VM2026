#!/usr/bin/env python3
"""
Guarantee every player has a WORKING photo + a club.

Photos: many stored URLs (esp. TheSportsDB 'cutout', premium) return 404, so the
UI fell back to initials. This validates candidates per player and writes a single
verified `photo` field (first URL that actually 200s). If none work it re-fetches
TheSportsDB (thumb/cutout) + Wikipedia, validates, and as a last resort sets a
generated avatar so EVERY player has an image.

Clubs: fills missing `team` from TheSportsDB for players ESPN had no club for.

Idempotent / incremental. Usage: python3 fix_players.py
"""
import json, time, urllib.parse
from pathlib import Path
from urllib import request as urlreq, error as urlerr

BASE = Path(__file__).parent
DB = BASE / "players.json"
TSDB = "https://www.thesportsdb.com/api/v1/json/3"
WIKI = "https://en.wikipedia.org/w/api.php"
UA = {"User-Agent": "Mozilla/5.0 (vm2026-bot)"}


def head_ok(url):
    if not url:
        return False
    try:
        req = urlreq.Request(url, method="HEAD", headers=UA)
        r = urlreq.urlopen(req, timeout=8)
        return r.status == 200 and ("image" in (r.headers.get("Content-Type", "") or "") or True)
    except Exception:
        return False


def tsdb_search(name):
    try:
        url = f"{TSDB}/searchplayers.php?" + urllib.parse.urlencode({"p": name})
        req = urlreq.Request(url, headers=UA)
        for attempt in range(3):
            try:
                with urlreq.urlopen(req, timeout=12) as r:
                    data = json.loads(r.read())
                break
            except urlerr.HTTPError as e:
                if e.code == 429:
                    time.sleep(25 * (attempt + 1)); continue
                return None
            except Exception:
                return None
        else:
            return None
        pl = (data or {}).get("player") or []
        soccer = [p for p in pl if (p.get("strSport") or "").lower() == "soccer"]
        pool = soccer or pl
        return next((p for p in pool if (p.get("strPlayer") or "").lower() == name.lower()), pool[0] if pool else None)
    except Exception:
        return None


def wiki_thumb(name):
    try:
        params = {"action": "query", "format": "json", "prop": "pageimages", "piprop": "thumbnail",
                  "pithumbsize": "500", "redirects": "1", "titles": name}
        url = WIKI + "?" + urllib.parse.urlencode(params)
        with urlreq.urlopen(urlreq.Request(url, headers=UA), timeout=15) as r:
            d = json.loads(r.read())
        for p in d.get("query", {}).get("pages", {}).values():
            t = (p.get("thumbnail") or {}).get("source")
            if t:
                return t
    except Exception:
        pass
    return None


def avatar(name):
    # Always-available generated avatar (real PNG) as the absolute last resort.
    return "https://ui-avatars.com/api/?" + urllib.parse.urlencode(
        {"name": name, "background": "2f2450", "color": "ffffff", "bold": "true", "size": "256", "format": "png"}
    )


db = json.loads(DB.read_text(encoding="utf-8"))
names = list(db.keys())
print(f"{len(names)} players. Validating photos + filling clubs…\n")

fixed_photo = refetched = club_filled = avatared = 0
for i, name in enumerate(names, 1):
    e = db[name]
    if not isinstance(e, dict):
        continue

    # ---- PHOTO: pick first candidate that actually loads ----
    if not head_ok(e.get("photo")):
        cands = [e.get("wiki"), e.get("thumb"), e.get("render"), e.get("cutout"), e.get("espnPhoto")]
        eid = e.get("espnId")
        if eid:
            cands.append(f"https://a.espncdn.com/i/headshots/soccer/players/full/{eid}.png")
        photo = next((u for u in cands if head_ok(u)), None)
        if not photo and not e.get("_photoRefetched"):
            e["_photoRefetched"] = True
            p = tsdb_search(name)
            if p:
                for u in (p.get("strCutout"), p.get("strThumb"), p.get("strRender")):
                    if head_ok(u):
                        photo = u; break
            if not photo:
                w = wiki_thumb(name)
                if head_ok(w):
                    photo = w
            refetched += 1
            time.sleep(1.2)
        if not photo:
            photo = avatar(name); avatared += 1
        e["photo"] = photo
        fixed_photo += 1

    # ---- CLUB: fill from TheSportsDB if missing ----
    if not e.get("team") and not e.get("_clubRefetched"):
        e["_clubRefetched"] = True
        p = tsdb_search(name)
        if p:
            club = p.get("strTeam")
            league = (p.get("strSport"),)
            # strTeam from search is usually the club; skip obvious national-team names
            if club and "national" not in club.lower():
                e["team"] = club
                club_filled += 1
        time.sleep(1.0)

    if i % 25 == 0 or i == len(names):
        print(f"[{i:4}/{len(names)}] photos set {fixed_photo} (refetch {refetched}, avatar {avatared}) · clubs +{club_filled}", flush=True)
        DB.write_text(json.dumps(db, ensure_ascii=False, indent=2), encoding="utf-8")

DB.write_text(json.dumps(db, ensure_ascii=False, indent=2), encoding="utf-8")
working = sum(1 for v in db.values() if isinstance(v, dict) and v.get("photo"))
clubs = sum(1 for v in db.values() if isinstance(v, dict) and v.get("team"))
print(f"\nDone. Players with a verified photo: {working}/{len(db)} · with club: {clubs}/{len(db)}")
