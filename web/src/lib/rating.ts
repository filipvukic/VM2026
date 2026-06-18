// FotMob-style rating colour: green = played well, orange = weaker, red = poor.
// No neutral grey. (The player of the match is shown blue + a star at the badge.)
export function ratingColor(r: number): string {
  if (r >= 7.5) return "#199e4c"; // strong green
  if (r >= 7.0) return "#2faa50"; // green
  if (r >= 6.5) return "#6f9f2f"; // yellow-green (decent)
  if (r >= 6.0) return "#d98a27"; // orange
  if (r >= 5.5) return "#d2672c"; // dark orange
  return "#c8412f"; // red
}
