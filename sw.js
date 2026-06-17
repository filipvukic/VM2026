// Service worker for VM 2026 — handles Web Push (goal/kickoff/full-time alerts
// sent by the Cloudflare push worker, fire even when the app is closed) and
// scheduled kickoff notifications via the Notification Triggers API (Chromium).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// Web Push: the push worker sends an encrypted JSON payload {title, body, tag, url}.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data && event.data.text ? event.data.text() : "VM 2026" };
  }
  const title = data.title || "VM 2026";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      tag: data.tag,
      renotify: true,
      icon: "/images/wc2026-logo.svg",
      badge: "/images/wc2026-logo.svg",
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of all) {
        if ("focus" in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("/");
    })()
  );
});
