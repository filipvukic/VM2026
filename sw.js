// Service worker for VM 2026 — handles Web Push (goal/kickoff/full-time alerts
// sent by the Cloudflare push worker, fire even when the app is closed) and
// scheduled kickoff notifications via the Notification Triggers API (Chromium).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// Always fetch fresh HTML on a page load so a new deploy is picked up immediately
// (no stale cached index.html on mobile / installed PWA). The JS/CSS are
// content-hashed and immutable, so only top-level navigations need this; on a
// network error fall back to the browser default (its HTTP cache).
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request, { cache: "no-store" }).catch(() => fetch(event.request)));
});

// Web Push: the push worker sends an encrypted JSON payload {title, body, tag, url}.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data && event.data.text ? event.data.text() : "VM 2026" };
  }
  const title = data.title || "VM 2026";
  const opts = {
    tag: data.tag,
    renotify: true,
    icon: "/images/icon-192.png",
    badge: "/images/icon-192.png",
    data: { url: data.url || "/" },
  };
  if (data.body) opts.body = data.body; // omit empty body → no blank line
  event.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // The notification's data.url deep-links to the match (?mid= for foreground
  // alerts, ?m=<team-pair-key> for push alerts). If a window is already open,
  // focus it and post the url so the SPA opens the match without a reload;
  // otherwise open a new window at that url and let the app read it on load.
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of all) {
        if ("focus" in c) {
          await c.focus();
          c.postMessage({ type: "open-match", url });
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })()
  );
});
