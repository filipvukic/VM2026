"""Regressionstester för poängsättningen. Körs i CI före engine.py.

    python test_engine.py

Kärnan: slutspelstips poängsätts mot 90-MINUTERSRESULTATET, aldrig mot resultatet
efter förlängning/straffar. Det gick fel en gång (2026-07-12): reg90_score läste
råa m["goals"], som alltid är tom — alla målhändelser kommer från ESPN och ligger i
m["_espn"]. Tom lista -> fallback på slutresultatet -> Argentina–Schweiz poängsattes
3–1 i stället för 1–1. Testerna nedan låser fast både vägen (via _goals) och svaret.
"""
import json
import unittest

import engine


def engine_match(fx):
    """Bygg en match-dict i den form ENGINE:N ser den, utifrån en exporterad fixture.

    Viktigt: m["goals"] lämnas TOM — så ser den råa football-data-matchen ut. Målen
    ligger i m["_espn"], precis som efter refresh_espn_data(). En fix som läser
    m["goals"] direkt kommer alltså att falla igenom här."""
    sd = fx.get("scoreDetail") or {}

    def pair(p):
        return {"home": p[0], "away": p[1]} if p else None

    return {
        "id": fx.get("id"),
        "stage": fx.get("stage") or "GROUP_STAGE",
        "status": fx.get("status"),
        "goals": [],  # rå football-data-feed: inga målhändelser
        "_espn": {"goals": fx.get("goals") or []},
        "score": {
            "halfTime": pair(sd.get("halfTime")),
            "fullTime": pair(sd.get("fullTime")),
            "extraTime": pair(sd.get("extraTime")),
            "penalties": pair(sd.get("penalties")),
            "duration": sd.get("duration"),
            "winner": sd.get("winnerSide"),
        },
    }


with open("fixtures.json", encoding="utf-8") as fh:
    FIXTURES = json.load(fh)
FINISHED_KO = [f for f in FIXTURES if f.get("status") == "FINISHED" and engine.is_knockout(engine_match(f))]


class Reg90(unittest.TestCase):
    def test_extra_time_goals_never_count(self):
        """Facit för de matcher som faktiskt avgjordes i förlängningen."""
        expected = {
            "Belgium-Senegal": (2, 2),                 # slutade 3–2 efter förlängning
            "Argentina-Cape Verde Islands": (1, 1),    # slutade 3–2 efter förlängning
            "Norway-England": (1, 1),                  # slutade 1–2 efter förlängning
            "Argentina-Switzerland": (1, 1),           # slutade 3–1 efter förlängning
        }
        seen = {}
        for f in FINISHED_KO:
            key = f"{f['home']}-{f['away']}"
            if key in expected:
                seen[key] = engine.reg90_score(engine_match(f))
        self.assertEqual(seen, expected)

    def test_reg90_never_equals_a_score_inflated_by_extra_time(self):
        """Invarianten som hade fångat buggen: så fort det gjordes mål i förlängningen
        MÅSTE 90-minutersresultatet skilja sig från det visade slutresultatet."""
        for f in FINISHED_KO:
            sd = f.get("scoreDetail") or {}
            et = sd.get("extraTime") or [0, 0]
            if not any(et):
                continue
            m = engine_match(f)
            reg = engine.reg90_score(m)
            final = engine.final_score(m)
            self.assertNotEqual(
                reg, final,
                f"{f['home']}-{f['away']}: mål i förlängningen ({et}) men reg90 {reg} "
                f"== slutresultatet {final} — tipsen poängsätts mot fel resultat",
            )

    def test_two_independent_derivations_agree(self):
        """Målhändelserna och score-fälten är två oberoende källor. De ska ge samma
        90-minutersresultat för varje färdigspelad slutspelsmatch."""
        for f in FINISHED_KO:
            m = engine_match(f)
            from_score = engine.reg90_from_score(m)
            if from_score is None:
                continue
            self.assertEqual(
                engine.reg90_score(m), from_score,
                f"{f['home']}-{f['away']}: målhändelser och score-fält är oense",
            )

    def test_penalties_are_stripped(self):
        """Straffar viks in i football-datas fullTime (1–1 + straffar 3–4 -> 4–5).
        De ska bort — en straffläggning betyder att det stod lika efter förlängning."""
        for f in FINISHED_KO:
            sd = f.get("scoreDetail") or {}
            if sd.get("duration") != "PENALTY_SHOOTOUT":
                continue
            h, a = engine.reg90_score(engine_match(f))
            self.assertEqual(h, a, f"{f['home']}-{f['away']}: straffläggning kräver lika efter 90/förlängning")

    def test_group_matches_use_the_final_score(self):
        for f in FIXTURES:
            if f.get("status") != "FINISHED" or f.get("stage") != "GROUP_STAGE":
                continue
            m = engine_match(f)
            self.assertEqual(engine.final_score(m), tuple(f["score"]))


class ScoreOneMatch(unittest.TestCase):
    CFG = {"exact": 5, "outcome": 2, "floor": 1}

    def test_argentina_switzerland_is_scored_on_1_1(self):
        """Matchen ur buggrapporten: 1–1 efter 90, 3–1 efter förlängning."""
        f = next(f for f in FIXTURES if f["home"] == "Argentina" and f["away"] == "Switzerland")
        m = engine_match(f)
        self.assertEqual(engine.score_one_match(m, [1, 1], self.CFG), (5, True))   # exakt 90-min-resultat
        self.assertEqual(engine.score_one_match(m, [0, 0], self.CFG), (2, False))  # rätt utgång (oavgjort)
        self.assertEqual(engine.score_one_match(m, [3, 1], self.CFG), (1, False))  # ET-resultatet ger golv
        self.assertEqual(engine.score_one_match(m, [2, 0], self.CFG), (1, False))  # hemmavinst != oavgjort


if __name__ == "__main__":
    unittest.main(verbosity=2)
