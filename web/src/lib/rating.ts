// FotMob-style rating colour: red (low) → grey (~6.5) → green → bright green (high).
export function ratingColor(r: number): string {
  if (r >= 8) return "#1fd35b";
  if (r >= 7) return "#7ed957";
  if (r >= 6.5) return "#cfd6e6";
  if (r >= 6) return "#f0b429";
  return "#f0623a";
}
