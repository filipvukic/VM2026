import { useEffect, useState } from "react";

// Day's high temperature at the match venue, from Open-Meteo (free, no key, CORS-open).
// The 16 WC-2026 host stadiums, keyed by the exact `venue.stadium` string in the fixtures,
// mapped to coordinates + IANA timezone (so the "match day" is the venue-local calendar day,
// not the UTC day — evening kickoffs cross midnight UTC).
const VENUES: Record<string, { lat: number; lon: number; tz: string }> = {
  "Estadio Banorte": { lat: 19.3029, lon: -99.1505, tz: "America/Mexico_City" },
  "Estadio Akron": { lat: 20.6819, lon: -103.4625, tz: "America/Mexico_City" },
  "Estadio BBVA": { lat: 25.6692, lon: -100.2444, tz: "America/Monterrey" },
  "BMO Field": { lat: 43.6332, lon: -79.4185, tz: "America/Toronto" },
  "BC Place": { lat: 49.2768, lon: -123.1119, tz: "America/Vancouver" },
  "SoFi Stadium": { lat: 33.9535, lon: -118.3392, tz: "America/Los_Angeles" },
  "Levi's Stadium": { lat: 37.403, lon: -121.97, tz: "America/Los_Angeles" },
  "Lumen Field": { lat: 47.5952, lon: -122.3316, tz: "America/Los_Angeles" },
  "MetLife Stadium": { lat: 40.8135, lon: -74.0745, tz: "America/New_York" },
  "Gillette Stadium": { lat: 42.0909, lon: -71.2643, tz: "America/New_York" },
  "Lincoln Financial Field": { lat: 39.9008, lon: -75.1675, tz: "America/New_York" },
  "Mercedes-Benz Stadium": { lat: 33.7554, lon: -84.4009, tz: "America/New_York" },
  "Hard Rock Stadium": { lat: 25.958, lon: -80.2389, tz: "America/New_York" },
  "NRG Stadium": { lat: 29.6847, lon: -95.4107, tz: "America/Chicago" },
  "AT&T Stadium": { lat: 32.7473, lon: -97.0945, tz: "America/Chicago" },
  "GEHA Field at Arrowhead Stadium": { lat: 39.049, lon: -94.4839, tz: "America/Chicago" },
};

const mem = new Map<string, number | null>(); // session cache (incl. nulls, so we don't refetch)
const LS = "wx:"; // localStorage — only PAST days are persisted (their high is final)

function localDate(d: Date, tz: string): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** The day's max temperature (°C, rounded) at the match venue, or null if unknown/out of range. */
export function useMatchWeather(stadium: string | null | undefined, kickoff: Date | null | undefined): number | null {
  const v = stadium ? VENUES[stadium] : null;
  const date = v && kickoff ? localDate(kickoff, v.tz) : null;
  const key = v && date ? `${v.lat},${v.lon},${date}` : null;

  const [temp, setTemp] = useState<number | null>(() => {
    if (!key) return null;
    if (mem.has(key)) return mem.get(key)!;
    try {
      const s = localStorage.getItem(LS + key);
      if (s != null) { const n = +s; mem.set(key, n); return n; }
    } catch { /* ignore */ }
    return null;
  });

  useEffect(() => {
    if (!key || !v || !date) return;
    if (mem.has(key)) { setTemp(mem.get(key)!); return; }
    let alive = true;
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${v.lat}&longitude=${v.lon}` +
      `&daily=temperature_2m_max&timezone=auto&start_date=${date}&end_date=${date}`;
    fetch(url)
      .then((r) => r.json())
      .then((j) => {
        const arr = j?.daily?.temperature_2m_max;
        const t = Array.isArray(arr) && arr[0] != null ? Math.round(arr[0]) : null;
        mem.set(key, t);
        // Past days are final → persist; future forecasts change, so keep them session-only.
        if (t != null && date < localDate(new Date(), v.tz)) {
          try { localStorage.setItem(LS + key, String(t)); } catch { /* ignore */ }
        }
        if (alive) setTemp(t);
      })
      .catch(() => { /* transient — leave uncached so it retries next mount */ });
    return () => { alive = false; };
  }, [key, v, date]);

  return temp;
}
