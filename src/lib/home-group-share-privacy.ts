/** Shared by the pre-hydration analytics hook, React provider, and proxy. */
// Document-lifetime only: a private route must not change persisted user consent.
let blockedForDocument = false;

export function blockHomeGroupShareAnalytics(): void {
  blockedForDocument = true;
}

export function isHomeGroupSharePath(pathname: string): boolean {
  return pathname === "/home-groups" || pathname.startsWith("/home-groups/");
}

/** Also catches a share URL in a referrer, performance entry, or queued event. */
export function containsHomeGroupShareUrl(value: string): boolean {
  try {
    return /\/home-groups(?:\/|[?#]|$)/i.test(decodeURIComponent(value));
  } catch {
    return /\/home-groups(?:\/|[?#]|$)/i.test(value);
  }
}

export function homeGroupAnalyticsBlocked(): boolean {
  return (
    typeof window !== "undefined" &&
    (blockedForDocument ||
      isHomeGroupSharePath(window.location.pathname) ||
      containsHomeGroupShareUrl(document.referrer))
  );
}
