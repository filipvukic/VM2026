// Pool-player colors, photo slugs, helpers — ported from index.html ~268-281.
export const PLAYER_COLORS: Record<string, string> = {
  Albin: "#FF2E6E", Alexander: "#FF8A3D", "Björn": "#1FA37A", Casper: "#7A3CF0",
  Filip: "#0E8FE0", Isac: "#F5B301", Johan: "#E63946", Martin: "#16A0A0", Oskar: "#9B5DE5",
  Vilgot: "#EC4899", Hampus: "#65A30D",
};

export const PLAYER_SLUGS: Record<string, string> = {
  Albin: "albin", Alexander: "alexander", "Björn": "bjorn", Casper: "casper",
  Filip: "filip", Isac: "isac", Johan: "johan", Martin: "martin", Oskar: "oskar",
  Vilgot: "vilgot", Hampus: "hampus",
};

// Returns the legacy base-relative path ("images/players/<slug>.webp"); the UI
// prepends import.meta.env.BASE_URL via asset() so it resolves under /app/ or /.
export function playerPhoto(name: string): string | null {
  const slug = PLAYER_SLUGS[name];
  return slug ? "images/players/" + slug + ".webp" : null;
}
