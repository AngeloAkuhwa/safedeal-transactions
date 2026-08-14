/**
 * Installed-app launch routing.
 *
 * When SafeDeal is launched from a home-screen icon (standalone display mode,
 * iOS `navigator.standalone`, or the manifest's `?source=pwa` start_url) the
 * root route should open the user's app home instead of the marketing landing
 * page. Normal browser visitors — and crawlers, which never match any of these
 * signals — must keep seeing the full landing page.
 */

export function isStandaloneLaunch(win: Window | undefined = typeof window !== "undefined" ? window : undefined): boolean {
  if (!win) return false;
  try {
    if (win.matchMedia?.("(display-mode: standalone)")?.matches) return true;
    if ((win.navigator as Navigator & { standalone?: boolean })?.standalone === true) return true;
    if (new URLSearchParams(win.location?.search ?? "").get("source") === "pwa") return true;
  } catch {
    return false;
  }
  return false;
}

/** Role home for an authenticated installed-app launch. */
export function resolveLaunchTarget(roles: string[] | null | undefined): string {
  const list = roles ?? [];
  if (list.includes("seller")) return "/seller";
  if (list.includes("buyer")) return "/dashboard";
  return "/role-selection";
}