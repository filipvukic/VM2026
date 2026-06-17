# VM2026 Web Push backend (Cloudflare Worker)

Sends **goal / kickoff / full-time** notifications even when the app is **closed**.
It stores browser push subscriptions, polls ESPN's scoreboard once a minute, and
pushes alerts to whoever is watching each match. Free tier is plenty (≈1 440
cron runs/day, well under the 100 k req/day limit).

The frontend stays a static site — this is the only server-side piece, and the app
works fine without it (it falls back to foreground + catch-up notifications until
`PUSH_WORKER_URL` is set).

## One-time setup (~10 min)

You need a free [Cloudflare](https://dash.cloudflare.com/sign-up) account.

```bash
cd push-worker
npm install
npx wrangler login                      # opens the browser to authorise
```

**1. Generate VAPID keys** (the identity that signs pushes):

```bash
npx @pushforge/builder vapid
```

It prints a **public key** (a base64url string, for the frontend) and a **private
key** (a JWK JSON object, for the server). Keep both.

**2. Create the KV namespace** (stores subscriptions + last-seen scores):

```bash
npx wrangler kv namespace create SUBS
```

Copy the printed `id` into `wrangler.toml` under `[[kv_namespaces]]`.

**3. Fill in `wrangler.toml`:**
- `id` — the KV id from step 2.
- `VAPID_PUBLIC_KEY` — the public key from step 1.
- `ALLOW_ORIGIN` — your site origin, e.g. `https://vm2026.<domain>` (the GitHub
  Pages / CNAME domain the app is served from). This is the CORS allow-list.
- `ADMIN_CONTACT` — already set to your email.

**4. Store the private key as a secret** (paste the JWK JSON when prompted):

```bash
npx wrangler secret put VAPID_PRIVATE_KEY
```

**5. Deploy:**

```bash
npx wrangler deploy
```

Wrangler prints the Worker URL, e.g. `https://vm2026-push.<account>.workers.dev`.

**6. Point the frontend at it.** Put that URL in
`web/src/lib/pushConfig.ts` (`PUSH_WORKER_URL`) — or just send it to me and I'll
wire it in, rebuild and redeploy. Once set, the "Bevaka matchen" button subscribes
the browser and alerts arrive with the app closed.

## Notes
- One global opt-in per browser: the app sends `{ subscription, notifyAll }` and the
  Worker pushes every goal/kickoff/full-time alert (all matches) to subscribers with
  `notifyAll` on. No per-match selection.
- **iPhone**: web push only works for a PWA — open the site in Safari, Share → "Add
  to Home Screen", then enable notifications from the installed app.
- The Worker auto-removes dead subscriptions (HTTP 404/410) on send.
- Endpoints: `GET /vapidPublicKey`, `POST /subscribe`, `POST /unsubscribe`, `POST /test`.
- **Re-deploy (`npx wrangler deploy`) whenever `src/index.ts` changes** so the live
  Worker matches the frontend's request shape.
