// Official FIFA World Cup 2026 stadium capacities (the confirmed WC-configuration seated
// capacities, June 2026 — https://inside.fifa.com/news/fifa-world-cup-stadium-capacities-confirmed).
// ESPN's summary feed never returns venue.capacity (always null), but the 16 host stadiums are a
// fixed, known set — so we look capacity up by the exact `venue.stadium` string ESPN gives (same
// keys as lib/weather.ts). Attendance itself comes live from the feed (m.attendance).
export const VENUE_CAPACITY: Record<string, number> = {
  "Estadio Banorte": 80824,               // Mexico City (Azteca)
  "Estadio Akron": 45664,                 // Guadalajara
  "Estadio BBVA": 51243,                  // Monterrey
  "BMO Field": 43036,                     // Toronto
  "BC Place": 52497,                      // Vancouver
  "SoFi Stadium": 70492,                  // Los Angeles
  "Levi's Stadium": 68827,                // San Francisco Bay Area
  "Lumen Field": 66925,                   // Seattle
  "MetLife Stadium": 80663,               // New York / New Jersey
  "Gillette Stadium": 64146,              // Boston
  "Lincoln Financial Field": 68324,       // Philadelphia
  "Mercedes-Benz Stadium": 68239,         // Atlanta
  "Hard Rock Stadium": 64478,             // Miami
  "NRG Stadium": 68777,                   // Houston
  "AT&T Stadium": 70649,                  // Dallas
  "GEHA Field at Arrowhead Stadium": 69045, // Kansas City
};

/** Seated capacity for a match venue, or null if the stadium isn't a known WC-2026 host. */
export function capacityFor(stadium: string | null | undefined): number | null {
  return stadium ? VENUE_CAPACITY[stadium] ?? null : null;
}
