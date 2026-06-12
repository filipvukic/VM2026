#!/usr/bin/env python3
"""
Fetches FIFA WC 2026 h2h (1X2) odds from The Odds API and writes odds.json.
Requires ODDS_API_KEY environment variable.

Sign up free (500 req/month) at: https://the-odds-api.com/
Run: ODDS_API_KEY=<your-key> python3 fetch_odds.py
"""
import json, os, re, sys, unicodedata
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib import request as urlreq

BASE = Path(__file__).parent
ODDS_PATH = BASE / "odds.json"
FIXTURES_PATH = BASE / "fixtures.json"
API_KEY_ENV = "ODDS_API_KEY"
SPORT = "soccer_fifa_world_cup"
API_BASE = "https://api.the-odds-api.com/v4"


def norm(s):
    s = unicodedata.normalize("NFD", str(s or "").lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    for w in ("the", "republic", "democratic", "of", "and", "island", "islands", "dr"):
        s = re.sub(rf"\b{w}\b", "", s)
    return re.sub(r"\s+", " ", s).strip()


def name_match(a, b):
    na, nb = norm(a), norm(b)
    if na == nb:
        return True
    wa, wb = set(na.split()), set(nb.split())
    if not wa or not wb:
        return False
    return len(wa & wb) / max(len(wa), len(wb)) >= 0.6


def avg_h2h(bookmakers, side, home_team, away_team):
    """Average price for 'home', 'draw', or 'away' across bookmakers."""
    prices = []
    for bm in bookmakers:
        for mkt in bm.get("markets", []):
            if mkt.get("key") != "h2h":
                continue
            for oc in mkt.get("outcomes", []):
                n = oc.get("name", "")
                p = oc.get("price")
                if p is None:
                    continue
                if side == "draw" and n.lower() == "draw":
                    prices.append(p)
                elif side == "home" and name_match(n, home_team):
                    prices.append(p)
                elif side == "away" and name_match(n, away_team):
                    prices.append(p)
    return round(sum(prices) / len(prices), 2) if prices else None


def main():
    api_key = os.environ.get(API_KEY_ENV)
    if not api_key:
        print(f"[odds] {API_KEY_ENV} not set — skipping.")
        sys.exit(0)

    try:
        with open(FIXTURES_PATH, encoding="utf-8") as f:
            fixtures = json.load(f)
    except FileNotFoundError:
        print("[odds] fixtures.json not found — skipping.")
        sys.exit(0)

    # Load existing odds (preserve entries not in current API response)
    try:
        with open(ODDS_PATH, encoding="utf-8") as f:
            existing = json.load(f)
        db = existing.get("odds", {})
    except FileNotFoundError:
        db = {}

    # Index fixtures by UTC day for fast lookup
    fix_by_day = {}
    for m in fixtures:
        utc = m.get("utcDate", "")
        if not utc:
            continue
        try:
            dt = datetime.fromisoformat(utc.replace("Z", "+00:00"))
            fix_by_day.setdefault(dt.strftime("%Y-%m-%d"), []).append(m)
        except Exception:
            pass

    # Fetch from The Odds API
    url = (f"{API_BASE}/sports/{SPORT}/odds/"
           f"?regions=eu&markets=h2h&oddsFormat=decimal&apiKey={api_key}")
    req = urlreq.Request(url, headers={"User-Agent": "vm2026-odds/1.0"})
    try:
        with urlreq.urlopen(req, timeout=15) as r:
            raw = json.loads(r.read())
            rem  = r.headers.get("x-requests-remaining", "?")
            used = r.headers.get("x-requests-used", "?")
    except Exception as e:
        print(f"[odds] Fetch error: {e}")
        sys.exit(1)

    if not isinstance(raw, list):
        print(f"[odds] Unexpected response: {str(raw)[:200]}")
        sys.exit(1)

    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    matched = 0

    for entry in raw:
        home_api  = entry.get("home_team", "")
        away_api  = entry.get("away_team", "")
        commence  = entry.get("commence_time", "")
        bookmakers = entry.get("bookmakers", [])

        try:
            dt = datetime.fromisoformat(commence.replace("Z", "+00:00"))
        except Exception:
            continue

        # Match against our fixtures (try same day ± 1 for timezone edge cases)
        fix = None
        for delta in (0, -1, 1):
            day = (dt + timedelta(days=delta)).strftime("%Y-%m-%d")
            for m in fix_by_day.get(day, []):
                if name_match(home_api, m.get("home", "")) and name_match(away_api, m.get("away", "")):
                    fix = m
                    break
            if fix:
                break

        if not fix:
            print(f"[odds] No match for: {home_api} vs {away_api} ({dt.date()})")
            continue

        h = avg_h2h(bookmakers, "home", home_api, away_api)
        d = avg_h2h(bookmakers, "draw", home_api, away_api)
        a = avg_h2h(bookmakers, "away", home_api, away_api)

        if h and d and a:
            db[str(fix["id"])] = {
                "home": h, "draw": d, "away": a,
                "bookmakers": len(bookmakers),
                "updated": now_str,
            }
            matched += 1

    out = {
        "generated": now_str,
        "creditsUsed": used,
        "creditsRemaining": rem,
        "matchesWithOdds": matched,
        "odds": db,
    }
    with open(ODDS_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print(f"[odds] {matched} matches · credits used: {used} · remaining: {rem}")


if __name__ == "__main__":
    main()
