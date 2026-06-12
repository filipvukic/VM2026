#!/usr/bin/env python3
"""
Lokal server för VM 2026 – serverar statiska filer och kör engine.py i bakgrunden.

Starta med:
    FOOTBALL_DATA_TOKEN=<din-nyckel> python server.py

Utan token körs enbart med befintliga data.json/fixtures.json.
"""

import http.server
import json
import os
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone

PORT = 8000
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TOKEN_ENV = "FOOTBALL_DATA_TOKEN"
ODDS_KEY_ENV = "ODDS_API_KEY"
ODDS_INTERVAL = 90 * 60  # 90 min between fetches (~16/day, within free tier)

LIVE_STATUSES = {"IN_PLAY", "PAUSED", "LIVE", "SUSPENDED"}


def has_live_games():
    try:
        with open(os.path.join(BASE_DIR, "fixtures.json"), encoding="utf-8") as f:
            fixtures = json.load(f)
        return any(m.get("status") in LIVE_STATUSES for m in fixtures)
    except Exception:
        return False


def has_recent_finished_without_events():
    """Returnerar True om det finns nyligen spelade matcher (< 48 h) utan måldata.
    Engine körs oftare tills API:t har levererat händelsedata."""
    try:
        with open(os.path.join(BASE_DIR, "fixtures.json"), encoding="utf-8") as f:
            fixtures = json.load(f)
        now = datetime.now(timezone.utc)
        for m in fixtures:
            if m.get("status") != "FINISHED":
                continue
            if m.get("goals"):  # Har redan måldata
                continue
            utc = m.get("utcDate", "")
            if not utc:
                continue
            try:
                kickoff = datetime.fromisoformat(utc.replace("Z", "+00:00"))
                age_h = (now - kickoff).total_seconds() / 3600
                if age_h < 48:
                    return True
            except Exception:
                pass
        return False
    except Exception:
        return False


def has_upcoming_matches():
    """Returns True if there are matches in the next 48 hours (odds are relevant)."""
    try:
        with open(os.path.join(BASE_DIR, "fixtures.json"), encoding="utf-8") as f:
            fixtures = json.load(f)
        now = datetime.now(timezone.utc)
        for m in fixtures:
            if m.get("status") in ("FINISHED", "played"):
                continue
            utc = m.get("utcDate", "")
            if not utc:
                continue
            try:
                kickoff = datetime.fromisoformat(utc.replace("Z", "+00:00"))
                hours = (kickoff - now).total_seconds() / 3600
                if -2 <= hours <= 48:
                    return True
            except Exception:
                pass
        return False
    except Exception:
        return False


def run_odds_fetcher():
    key = os.environ.get(ODDS_KEY_ENV)
    if not key:
        return False
    try:
        result = subprocess.run(
            [sys.executable, os.path.join(BASE_DIR, "fetch_odds.py")],
            cwd=BASE_DIR, capture_output=True, text=True, timeout=30,
            env={**os.environ, ODDS_KEY_ENV: key},
        )
        if result.returncode == 0:
            print(f"[odds] {result.stdout.strip()}", flush=True)
            return True
        print(f"[odds] FEL: {result.stderr.strip()[:200]}", flush=True)
        return False
    except subprocess.TimeoutExpired:
        print("[odds] Timeout – hoppar över.", flush=True)
        return False
    except Exception as e:
        print(f"[odds] Undantag: {e}", flush=True)
        return False


def odds_loop():
    key = os.environ.get(ODDS_KEY_ENV)
    if not key:
        print(f"[server] OBS: {ODDS_KEY_ENV} inte satt – hoppar över odds-uppdateringar.", flush=True)
        return

    print("[server] Startar odds-hämtning (initial körning)…", flush=True)
    run_odds_fetcher()

    while True:
        time.sleep(ODDS_INTERVAL)
        if has_upcoming_matches():
            run_odds_fetcher()


def run_engine():
    token = os.environ.get(TOKEN_ENV)
    if not token:
        return False
    try:
        result = subprocess.run(
            [sys.executable, os.path.join(BASE_DIR, "engine.py")],
            cwd=BASE_DIR, capture_output=True, text=True, timeout=90,
            env={**os.environ, TOKEN_ENV: token},
        )
        if result.returncode == 0:
            print(f"[engine] {result.stdout.strip()}", flush=True)
            return True
        print(f"[engine] FEL: {result.stderr.strip()[:200]}", flush=True)
        return False
    except subprocess.TimeoutExpired:
        print("[engine] Timeout – hoppar över.", flush=True)
        return False
    except Exception as e:
        print(f"[engine] Undantag: {e}", flush=True)
        return False


def engine_loop():
    token = os.environ.get(TOKEN_ENV)
    if not token:
        print(f"[server] OBS: {TOKEN_ENV} inte satt – hoppar över API-uppdateringar.", flush=True)
        print("[server] Sätt variabeln och starta om för live-data.", flush=True)
        return

    print("[server] Startar engine (initial körning)…", flush=True)
    run_engine()

    while True:
        if has_live_games():
            interval = 30          # Pågående match: uppdatera snabbt
        elif has_recent_finished_without_events():
            interval = 60          # Nyss spelad utan händelsedata: vänta på API
        else:
            interval = 120         # Lugnt: normalintervall
        time.sleep(interval)
        run_engine()


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def log_message(self, fmt, *args):
        # Visa bara icke-200 svar
        if args and args[1] not in ("200", "304"):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    t = threading.Thread(target=engine_loop, daemon=True)
    t.start()
    t2 = threading.Thread(target=odds_loop, daemon=True)
    t2.start()

    with http.server.HTTPServer(("", PORT), Handler) as httpd:
        print(f"\n  VM 2026 – lokal server\n", flush=True)
        print(f"  http://localhost:{PORT}", flush=True)
        print(f"\n  Tryck Ctrl+C för att stoppa\n", flush=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n[server] Stoppad.")
