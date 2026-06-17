// URL of the deployed Cloudflare push worker (no trailing slash). Leave empty to
// disable Web Push — the app then falls back to foreground + catch-up notifications.
// Set this to e.g. "https://vm2026-push.<account>.workers.dev" after deploying
// push-worker/ (see push-worker/README.md), then rebuild the frontend.
export const PUSH_WORKER_URL = "";
