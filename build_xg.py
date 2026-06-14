#!/usr/bin/env python3
"""
Fetch REAL expected-goals (xG) per match from FotMob's server-rendered pages
(__NEXT_DATA__ — no signed header needed) and write xg.json keyed by our
fixture id: { "<fixtureId>": {"home": 1.46, "away": 0.07} }.

NOT computed by us — values come straight from FotMob. Re-runnable; only fetches
matches that have already kicked off. Usage: python3 build_xg.py
"""
import json, re, time, datetime, unicodedata
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


# our fixtures: name+date -> (id, homeNorm, awayNorm)
fixtures = json.loads((BASE / "fixtures.json").read_text(encoding="utf-8"))
fx_by_key = {}
for m in fixtures:
    d = (m.get("utcDate") or "")[:10]
    fx_by_key[(d, frozenset([norm(m.get("home")), norm(m.get("away"))]))] = m

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
    hn, an = norm(fm["home"]["name"]), norm(fm["away"]["name"])
    fx = fx_by_key.get((d, frozenset([hn, an])))
    if not fx:
        continue
    url = "https://www.fotmob.com" + fm["pageUrl"].split("#")[0]
    try:
        pp = get_next(url)["props"]["pageProps"]
    except Exception as e:
        print(f"  ! {fm['home']['name']}-{fm['away']['name']}: {e}")
        continue
    # coaches (map FotMob home/away coach to OUR team codes)
    hc, ac = find_coaches(pp)
    fx_home_is_fm_home = norm(fx.get("home")) == hn
    htla, atla = fx.get("homeTla"), fx.get("awayTla")
    if htla and (hc if fx_home_is_fm_home else ac):
        coaches[htla] = hc if fx_home_is_fm_home else ac
    if atla and (ac if fx_home_is_fm_home else hc):
        coaches[atla] = ac if fx_home_is_fm_home else hc

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
