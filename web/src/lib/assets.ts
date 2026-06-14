// Resolve a bundled public asset against the Vite base URL so paths work both
// at /app/ (preview) and / (after swap). Data JSON is fetched separately via
// absolute domain-root paths and must NOT use this.
const BASE = import.meta.env.BASE_URL;
export function asset(path: string | null | undefined): string {
  if (!path) return "";
  if (/^(https?:)?\/\//.test(path) || path.startsWith("data:")) return path;
  return BASE + path.replace(/^\//, "");
}
