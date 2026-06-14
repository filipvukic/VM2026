import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// Repo root is one level up from web/. The Python engine commits the data JSON
// files there every ~5 min; in production GitHub Pages serves them from the
// domain root. In dev we serve them straight off disk so the working tree's
// (live, git-pulled) data shows up with no copying and no stale bundling.
const REPO_ROOT = resolve(__dirname, "..");
const ROOT_JSON = new Set([
  "/data.json",
  "/fixtures.json",
  "/players.json",
  "/odds.json",
  "/team_forms.json",
  "/xg.json",
  "/coaches.json",
]);

function serveRootData(): Plugin {
  return {
    name: "vm-serve-root-data",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url || "").split("?")[0];
        if (!ROOT_JSON.has(url)) return next();
        try {
          const buf = await readFile(resolve(REPO_ROOT, "." + url));
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          res.end(buf);
        } catch {
          res.statusCode = 404;
          res.end("{}");
        }
      });
    },
  };
}

export default defineConfig(() => ({
  // App is deployed at the domain root. Built into app/ (intermediate), then
  // index.html + assets/ are copied to the repo root by deploy_swap.sh.
  base: "/",
  plugins: [react(), serveRootData()],
  build: {
    outDir: resolve(REPO_ROOT, "app"),
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    port: 5273,
    host: true,
  },
}));
