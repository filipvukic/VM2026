# VM 2026 – Tippning (auto-scoreboard)

Hämtar matcher från **football-data.org** (gratis), räknar ut poäng och visar en
live-ish tabell på **GitHub Pages**. Inga servrar, ingen kostnad.

## Hur det funkar
1. `engine.py` anropar football-data, räknar poäng enligt era regler, skriver `data.json` + `fixtures.json`.
2. GitHub Actions (`.github/workflows/update.yml`) kör scriptet var ~10:e minut och committar resultatet.
3. `index.html` (GitHub Pages) läser `data.json` och visar tabell, matcher och bonus.

> "Live" = uppdateras var ~10–20 min, och football-datas gratisdata är dessutom
> något fördröjd. Inte sekund-för-sekund. För en kompispool räcker det gott.

## Setup (engångs)
1. **API-nyckel:** registrera gratis på football-data.org → kopiera din token.
2. **Lägg in nyckeln som secret:** repo → Settings → Secrets and variables → Actions →
   *New repository secret* → namn `FOOTBALL_DATA_TOKEN`, värde = din token.
3. **Aktivera Pages:** Settings → Pages → Source = "Deploy from a branch" → branch `main`, mapp `/ (root)`.
4. **Kör en gång manuellt:** Actions-fliken → "Uppdatera tippning" → *Run workflow*.
   Då skapas `data.json`/`fixtures.json` och sajten fylls med riktig data.
5. Sajten ligger på `https://<ditt-användarnamn>.github.io/<repo>/`.

Tips: gör repot **publikt** (gratis Actions-minuter + transparens för gruppen).
Nyckeln ligger som secret, inte i koden, så den läcker inte.

## Mata in tips (`tips.json`)
- Lägg varje deltagare under `participants`.
- Matchtips kan anges med lagnamn (svenska funkar via `team_aliases`) eller med
  `id` från `fixtures.json`:
  ```json
  { "home": "Mexico", "away": "Sydafrika", "date": "2026-06-11", "tip": [2, 0] }
  ```
- **Slutspel:** lägg till matcherna i varje deltagares `matches` när lottningen är
  klar (kör workflow → kolla `fixtures.json` för rätt lag/id).
- Saknas ett lag i `team_aliases`? Lägg till det: `"SvensktNamn": "API Name"`.

## Manuella priser (på slutet)
`best_player`, `best_keeper`, `best_young` finns inte i API:t. Fyll i dem i
`manual_results` när FIFA delat ut priserna. `top_scorer` auto-räknas, men fyll i
manuellt om skyttekungen blev delad (FIFA avgör på assist/speltid).

## Poängregler (i `scoring`)
- Match: exakt resultat **5p** (2+3), rätt utgång **2p**, annars **1p**.
- Slutspel: exakt = ställning efter förlängning (straffmål räknas ej); rätt utgång =
  laget som går vidare (straffvinnaren räknas). *Ändras i `engine.py` → `score_one_match` om ni vill annat.*
- Bonus: vinnare 10 · silver 5 · brons 3 · målskytt 3 · spelare 3 · unga 3 · målvakt 3.
- Tabellen sorteras på total, sedan flest exakta resultat (tie-break).
- Pott = 300 kr × antal deltagare, fördelas 50/30/20.

## Testa lokalt utan API
```bash
python engine.py --mock mock_data.json
python -m http.server   # öppna http://localhost:8000
```
