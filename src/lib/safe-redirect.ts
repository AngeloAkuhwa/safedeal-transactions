/**
 * The one answer to "is this redirect target safe to navigate to".
 *
 * Three surfaces consume the `redirect` query param and the
 * `safedeal_redirect` sessionStorage key: Auth (already signed in),
 * LoginForm (just signed in) and RoleSelection (just picked a role). An
 * audit found only RoleSelection validating the value; the other two
 * navigated whatever was stored. React Router's history layer happens to
 * reject cross-origin pushState, so the miss was not exploitable as a full
 * open redirect today, but that protection is the browser's accident, not
 * this codebase's decision, and one future `window.location = stored`
 * would arm it.
 *
 * The rule: a safe target is an app-internal path. It starts with exactly
 * one "/" (two is a protocol-relative URL, "//evil.com"), and it cannot
 * smuggle a scheme, because a scheme needs ":" before the first "/" and a
 * leading "/" forecloses that.
 *
 * Single copy on purpose (working agreement rule 7): the previous state of
 * three consumers with one validator among them is exactly how the drift
 * happened.
 */
export const isSafeRelativePath = (path: string | null | undefined): path is string =>
  !!path && path.startsWith("/") && !path.startsWith("//");

const KEY = "safedeal_redirect";

/** Store a redirect target, refusing unsafe values at the door. */
export function storeRedirect(path: string | null | undefined): void {
  if (isSafeRelativePath(path)) sessionStorage.setItem(KEY, path);
}

/**
 * Take the stored redirect target, validating again on the way out.
 * Read-time validation is not redundant with write-time: sessionStorage is
 * writable by anything running on the page, so the value's provenance
 * cannot be assumed from the fact that storeRedirect was careful.
 */
export function takeRedirect(): string | null {
  const stored = sessionStorage.getItem(KEY);
  if (stored !== null) sessionStorage.removeItem(KEY);
  return isSafeRelativePath(stored) ? stored : null;
}
