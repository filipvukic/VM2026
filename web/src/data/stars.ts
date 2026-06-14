// Famous national-team players (from TEAM_DETAILS) so search works for big names
// (e.g. "mbappe") even before their team has played and entered players.json.
import { TEAM_DETAILS } from "./static/history";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export const ALL_STARS: { name: string; code: string }[] = [];
const STAR_TO_TEAM: Record<string, string> = {};
for (const code of Object.keys(TEAM_DETAILS)) {
  for (const name of TEAM_DETAILS[code].stars) {
    ALL_STARS.push({ name, code });
    STAR_TO_TEAM[norm(name)] = code;
  }
}

export function starTeam(name: string): string | null {
  return STAR_TO_TEAM[norm(name)] || null;
}
