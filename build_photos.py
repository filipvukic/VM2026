#!/usr/bin/env python3
"""
Add a Wikipedia photo (`wiki` field) to players in players.json that lack a
TheSportsDB cutout. Batched (50 titles/request) so the whole tournament's
players resolve in ~30 requests. No auth.

Usage:  python3 build_photos.py
"""
import json, time
from pathlib import Path
from urllib import request as urlreq, parse

BASE = Path(__file__).parent
DB_PATH = BASE / "players.json"
WIKI = "https://en.wikipedia.org/w/api.php"
UA = {"User-Agent": "vm2026-bot/1.0 (worldcup tipping; contact: filip)"}


def wiki_batch(names):
    """Return {requested_name: thumbnail_url_or_None} for up to 50 names."""
    params = {
        "action": "query",
        "format": "json",
        "prop": "pageimages",
        "piprop": "thumbnail",
        "pithumbsize": "500",
        "redirects": "1",
        "titles": "|".join(names),
    }
    url = WIKI + "?" + parse.urlencode(params)
    req = urlreq.Request(url, headers=UA)
    for attempt in range(3):
        try:
            with urlreq.urlopen(req, timeout=20) as r:
                data = json.loads(r.read())
            break
        except Exception as e:
            if attempt < 2:
                time.sleep(3 * (attempt + 1))
            else:
                print(f"  ! batch failed: {e}")
                return None  # transient — caller should retry later, not mark tried
    q = data.get("query", {})
    norm = {x["from"]: x["to"] for x in q.get("normalized", [])}
    redir = {x["from"]: x["to"] for x in q.get("redirects", [])}
    pages_by_title = {}
    for p in q.get("pages", {}).values():
        thumb = (p.get("thumbnail") or {}).get("source")
        pages_by_title[p.get("title")] = thumb
    out = {}
    for name in names:
        t = norm.get(name, name)
        t = redir.get(t, t)
        out[name] = pages_by_title.get(t)
    return out


with open(DB_PATH, encoding="utf-8") as f:
    db = json.load(f)
print(f"Loaded {len(db)} players.")

# Players that still need a photo source (no TheSportsDB cutout, no wiki yet)
todo = [
    name
    for name, e in db.items()
    if isinstance(e, dict) and not e.get("cutout") and not e.get("wiki") and not e.get("_wikiTried")
]
print(f"Need Wikipedia photo for {len(todo)} players.\n")

found = 0
for i in range(0, len(todo), 50):
    batch = todo[i : i + 50]
    res = wiki_batch(batch)
    if res is None:
        time.sleep(15)  # rate-limited — back off, leave batch for a later run
        continue
    for name in batch:
        url = res.get(name)
        if url:
            db[name]["wiki"] = url
            found += 1
        else:
            db[name]["_wikiTried"] = True  # genuinely no Wikipedia image
    print(f"[{min(i+50, len(todo)):4}/{len(todo)}]  +{found} photos so far", flush=True)
    with open(DB_PATH, "w", encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False, indent=2)
    time.sleep(1.2)

print(f"\nDone. Added {found} Wikipedia photos.")
with_photo = sum(1 for e in db.values() if isinstance(e, dict) and (e.get("cutout") or e.get("wiki") or e.get("render")))
print(f"Players with a real photo now: {with_photo}/{len(db)}")
