#!/usr/bin/env python3
"""
Fetch REAL expected-goals (xG) per match from FotMob's server-rendered pages
(__NEXT_DATA__ — no signed header needed) and write xg.json keyed by our
fixture id: { "<fixtureId>": {"home": 1.46, "away": 0.07} }.

NOT computed by us — values come straight from FotMob. Re-runnable; only fetches
matches that have already kicked off. Usage: python3 build_xg.py
"""
import json, re, time, datetime, unicodedata, difflib
from pathlib import Path
from urllib import request as urlreq

BASE = Path(__file__).parent
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36"}
LEAGUE = "https://www.fotmob.com/leagues/77/matches/world-cup"
NEXT = re.compile(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', re.S)


def norm(s):
    s = unicodedata.normalize("NFD", (s or "").lower().replace("&", "and"))
    return "".join(c for c in s if c.isalnum())


def get_next(url):
    with urlreq.urlopen(urlreq.Request(url, headers=UA), timeout=25) as r:
        html = r.read().decode("utf-8", "ignore")
    m = NEXT.search(html)
    return json.loads(m.group(1)) if m else None


def coach_obj(c):
    if not isinstance(c, dict) or not c.get("name"):
        return None
    cid = c.get("id")
    return {
        "name": c.get("name"),
        "age": c.get("age"),
        "country": c.get("countryName"),
        "countryCode": c.get("countryCode"),
        "photo": f"https://images.fotmob.com/image_resources/playerimages/{cid}.png" if cid else None,
    }


def find_coaches(pp):
    """Return (homeCoach, awayCoach) dicts from content.lineup."""
    lu = (pp.get("content", {}) or {}).get("lineup", {}) or {}
    return coach_obj((lu.get("homeTeam") or {}).get("coach")), coach_obj((lu.get("awayTeam") or {}).get("coach"))


def find_team_xg(pp):
    """Return full-match [home_xg, away_xg] from content.stats.Periods.All."""
    periods = (pp.get("content", {}).get("stats") or {}).get("Periods") or {}
    allp = periods.get("All") or {}
    stack = [allp]
    while stack:
        o = stack.pop()
        if isinstance(o, dict):
            if o.get("key") == "expected_goals" and isinstance(o.get("stats"), list) and len(o["stats"]) == 2:
                a, b = o["stats"]
                try:
                    return [float(a), float(b)]
                except (TypeError, ValueError):
                    pass
            stack.extend(o.values())
        elif isinstance(o, list):
            stack.extend(o)
    return None


# our fixtures, keyed by the unordered pair of team TLAs (group-stage pairs are
# unique; KO repeats are disambiguated by date below). FotMob team names are
# resolved to our TLAs with fuzzy matching so spelling variants (Turkiye/Turkey,
# USA/United States, Bosnia and Herzegovina/Bosnia-Herzegovina) still map.
fixtures = json.loads((BASE / "fixtures.json").read_text(encoding="utf-8"))
our_norm2tla = {}
for m in fixtures:
    if m.get("homeTla"):
        our_norm2tla[norm(m.get("home"))] = m["homeTla"]
    if m.get("awayTla"):
        our_norm2tla[norm(m.get("away"))] = m["awayTla"]

# FotMob spellings too short/different for fuzzy matching to reach.
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
out = {}
try:
    out = json.loads((BASE / "xg.json").read_text(encoding="utf-8"))
except FileNotFoundError:
    pass
coaches = {}
try:
    coaches = json.loads((BASE / "coaches.json").read_text(encoding="utf-8"))
except FileNotFoundError:
    pass

done = 0
for fm in matches:
    ut = (fm.get("status") or {}).get("utcTime") or ""
    try:
        ko = datetime.datetime.fromisoformat(ut.replace("Z", "+00:00"))
    except ValueError:
        continue
    if ko > now:  # not started
        continue
    d = ut[:10]
    htla_fm, atla_fm = fm_tla(fm["home"]["name"]), fm_tla(fm["away"]["name"])
    if not htla_fm or not atla_fm:
        continue
    cands = fx_by_pair.get(frozenset([htla_fm, atla_fm])) or []
    fx = next((c for c in cands if (c.get("utcDate") or "")[:10] == d), cands[0] if len(cands) == 1 else None)
    if not fx:
        continue
    url = "https://www.fotmob.com" + fm["pageUrl"].split("#")[0]
    try:
        pp = get_next(url)["props"]["pageProps"]
    except Exception as e:
        print(f"  ! {fm['home']['name']}-{fm['away']['name']}: {e}")
        continue
    # coaches (map FotMob home/away coach to OUR team codes). Only ENRICH the
    # entry build_coaches.py owns: add age/country/countryCode (which the team
    # page lacks); never clobber its name/id/career/photo.
    hc, ac = find_coaches(pp)
    fx_home_is_fm_home = fx.get("homeTla") == htla_fm
    for tla, mc in ((fx.get("homeTla"), hc if fx_home_is_fm_home else ac),
                    (fx.get("awayTla"), ac if fx_home_is_fm_home else hc)):
        if not tla or not mc:
            continue
        cur = coaches.get(tla)
        if not cur:
            coaches[tla] = mc  # no team-page entry yet: take the match-page coach whole
            continue
        for k in ("age", "country", "countryCode"):
            if mc.get(k) is not None:
                cur[k] = mc[k]
        if not cur.get("photo") and mc.get("photo"):
            cur["photo"] = mc["photo"]

    xg = find_team_xg(pp)
    if xg:
        home_xg, away_xg = (xg[0], xg[1]) if fx_home_is_fm_home else (xg[1], xg[0])
        out[str(fx["id"])] = {"home": home_xg, "away": away_xg}
        done += 1
        print(f"  {fx.get('home')} {home_xg} – {away_xg} {fx.get('away')}")
    time.sleep(1.0)

(BASE / "xg.json").write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
(BASE / "coaches.json").write_text(json.dumps(coaches, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"\nWrote xg.json ({len(out)} matches) + coaches.json ({len(coaches)} coaches). {done} xG this run.")
