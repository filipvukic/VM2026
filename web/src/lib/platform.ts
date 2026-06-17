// iOS detection for the "add to home screen" notification guidance. On iOS, the
// Notification/Push APIs only exist for a web app installed to the home screen —
// in a regular Safari tab they're absent, so we must guide the user to install
// first (the normal permission prompt isn't even available there).
export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iphone|ipad|ipod/i.test(ua)) return true;
  // iPadOS 13+ presents as "Macintosh" — distinguish by touch support.
  return /macintosh/i.test(ua) && typeof document !== "undefined" && "ontouchend" in document;
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    (window.navigator as { standalone?: boolean }).standalone === true ||
    (!!window.matchMedia && window.matchMedia("(display-mode: standalone)").matches)
  );
}

// True on an iPhone/iPad opened in a Safari TAB (not yet added to the home screen),
// where notifications can't work until installed.
export function iosNeedsInstall(): boolean {
  return isIos() && !isStandalone();
}
