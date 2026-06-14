#!/usr/bin/env python3
"""
Fetch the CURRENT head coach for ALL 48 World Cup finalists from FotMob's
server-rendered team pages (__NEXT_DATA__ -> fallback.team-<id>.overview.
coachHistory) and write/merge coaches.json keyed by our team TLA:

  { "FRA": {"name": "Didier Deschamps", "id": 78624, "photo": "...",
            "career": {"games": 179, "win": 116, "draw": 32, "loss": 31,
                       "winPct": 0.65}, "age": .., "country": ..} }

NOT computed by us — names, ids and win/draw/loss come straight from FotMob.
The coach photo is FotMob's player image (validated); if that's missing we fall
back to a Wikipedia thumbnail, else None (the UI then shows initials).

Incremental: a TLA already holding a name + photo + career is skipped, so the
first run fetches ~48 teams and later runs (e.g. in CI) fetch only what's still
missing. Pass --force to refetch everything. Usage: python3 build_coaches.py
"""
import json, re, sys, time, unicodedata, difflib
from pathlib import Path
from urllib import request as urlreq, error as urlerr

BASE = Path(__file__).parent
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36"}
LEAGUE = "https://www.fotmob.com/leagues/77/matches/world-cup"
NEXT = re.compile(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', re.S)
FORCE = "--force" in sys.argv

# FotMob names that our fuzzy match can't reach on its own (TLA -> FotMob team id).
ID_OVERRIDE = {"USA": "6713"}


def norm(s):
    s = unicodedata.normalize("NFD", (s or "").lower().replace("&", "and"))
    return "".join(c for c in s if c.isalnum())


def get_next(url):
    with urlreq.urlopen(urlreq.Request(url, headers=UA), timeout=25) as r:
        html = r.read().decode("utf-8", "ignore")
    m = NEXT.search(html)
    return json.loads(m.group(1)) if m else None


def head_ok(url):
    """True if the URL serves a real image (200 and not a tiny placeholder)."""
    try:
        req = urlreq.Request(url, headers=UA, method="GET")
        with urlreq.urlopen(req, timeout=15) as r:
            if r.status != 200:
                return False
            ct = (r.headers.get("Content-Type") or "").lower()
            if "image" not in ct:
                return False
            return len(r.read(4096)) >= 1000
    except Exception:
        return False


def wiki_photo(name):
    """Best-effort Wikipedia thumbnail for a coach name."""
    try:
        slug = urlreq.quote(name.replace(" ", "_"))
        url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{slug}"
        with urlreq.urlopen(urlreq.Request(url, headers=UA), timeout=15) as r:
            d = json.loads(r.read().decode("utf-8", "ignore"))
        src = (d.get("thumbnail") or {}).get("source")
        return src if src and "/static/images/" not in src else None
    except Exception:
        return None


def season_year(c):
    try:
        return int(str(c.get("season"))[:4])
    except (TypeError, ValueError):
        return 0


def current_coach(fmid):
    """Return (coachId, name, careerDict) for a FotMob team id, or None."""
    d = get_next(f"https://www.fotmob.com/teams/{fmid}/x/x")
    fb = (d["props"]["pageProps"].get("fallback") or {}).get(f"team-{fmid}", {})
    ch = (fb.get("overview") or {}).get("coachHistory") or []
    if not ch:
        return None
    mx = max(season_year(c) for c in ch)
    latest = [c for c in ch if season_year(c) == mx]
    cur = latest[-1]
    cid, cname = cur.get("id"), cur.get("name")
    win = draw = loss = 0
    for c in ch:
        if c.get("id") == cid:
            win += c.get("win") or 0
            draw += c.get("draw") or 0
            loss += c.get("loss") or 0
    games = win + draw + loss
    career = {"games": games, "win": win, "draw": draw, "loss": loss,
              "winPct": round(win / games, 3) if games else None}
    return cid, cname, career


def resolve_ids():
    """Map every one of our 48 TLAs to a FotMob national-team id."""
    fixtures = json.loads((BASE / "fixtures.json").read_text(encoding="utf-8"))
    tla2name = {}
    for m in fixtures:
        if m.get("homeTla"):
            tla2name[m["homeTla"]] = m["home"]
        if m.get("awayTla"):
            tla2name[m["awayTla"]] = m["away"]
    data = get_next(LEAGUE)
    matches = data["props"]["pageProps"]["overview"]["matches"]["allMatches"]
    fm_name2id = {}
    for m in matches:
        for side in ("home", "away"):
            fm_name2id[m[side]["name"]] = m[side]["id"]
    fm_norm = {norm(n): i for n, i in fm_name2id.items()}

    out = {}
    for tla, name in tla2name.items():
        if tla in ID_OVERRIDE:
            out[tla] = ID_OVERRIDE[tla]
            continue
        n = norm(name)
        if n in fm_norm:
            out[tla] = fm_norm[n]
            continue
        cand = max(fm_name2id, key=lambda x: difflib.SequenceMatcher(None, n, norm(x)).ratio())
        if difflib.SequenceMatcher(None, n, norm(cand)).ratio() >= 0.7:
            out[tla] = fm_name2id[cand]
        else:
            print(f"  ! no FotMob id for {tla} ({name})")
    return out, tla2name


def main():
    coaches = {}
    try:
        coaches = json.loads((BASE / "coaches.json").read_text(encoding="utf-8"))
    except FileNotFoundError:
        pass

    tla2fm, tla2name = resolve_ids()
    print(f"Resolved {len(tla2fm)}/{len(tla2name)} FotMob ids.")

    fetched = 0
    for tla, fmid in sorted(tla2fm.items()):
        existing = coaches.get(tla) or {}
        if not FORCE and existing.get("name") and existing.get("photo") and existing.get("career"):
            continue
        try:
            res = current_coach(fmid)
        except Exception as e:
            print(f"  ! {tla} (fm{fmid}): {e}")
            continue
        if not res:
            print(f"  ! {tla}: no coachHistory")
            continue
        cid, cname, career = res
        photo = f"https://images.fotmob.com/image_resources/playerimages/{cid}.png" if cid else None
        if photo and not head_ok(photo):
            photo = None
        if not photo:
            photo = wiki_photo(cname)
        merged = dict(existing)  # keep age/country/countryCode from match-page enrichment
        merged.update({"name": cname, "id": cid, "career": career})
        if photo or not merged.get("photo"):
            merged["photo"] = photo
        coaches[tla] = merged
        fetched += 1
        print(f"  {tla}: {cname}  ({career['games']} matcher, {career['win']}V "
              f"{career['draw']}O {career['loss']}F)  photo={'yes' if merged.get('photo') else 'no'}")
        time.sleep(0.6)

    (BASE / "coaches.json").write_text(json.dumps(coaches, ensure_ascii=False, indent=2), encoding="utf-8")
    have_photo = sum(1 for c in coaches.values() if c.get("photo"))
    print(f"\nWrote coaches.json: {len(coaches)} coaches "
          f"({have_photo} with photo). {fetched} fetched this run.")


if __name__ == "__main__":
    main()
