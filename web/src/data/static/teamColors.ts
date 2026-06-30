// Iconic team-colour OVERRIDES — only for teams whose identity colour differs from
// their flag's dominant colour (so the auto-derived flag colour would feel "wrong").
// Everything else is derived from the actual flag (see lib/flagColor.ts), so it's
// always a real flag colour and can't be a hand-maintained mistake.
export const TEAM_COLORS: Record<string, string> = {
  BRA: "#FFD400", // canarinho yellow (flag is green-dominant)
  NED: "#FF7A00", // oranje (flag is red/white/blue)
  ITA: "#2E78E6", // azzurri blue (flag is green/white/red)
  ESP: "#E63946", // la roja red (flag red dominates but keep it vivid)
};
