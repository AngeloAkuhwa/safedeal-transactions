import { supabase } from "@/integrations/supabase/client";

/**
 * Returns a non-expired access token, refreshing proactively if the cached
 * token is within the skew window of expiry. Returns null if no session.
 */
const SKEW_SECONDS = 60;

export async function getValidAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  let session = data.session;
  if (!session) return null;

  const expiresAt = session.expires_at ?? 0;
  const nowSec = Math.floor(Date.now() / 1000);
  if (expiresAt - nowSec <= SKEW_SECONDS) {
    const { data: refreshed, error } = await supabase.auth.refreshSession();
    if (error || !refreshed.session) return null;
    session = refreshed.session;
  }
  return session.access_token;
}

let refreshingPromise: Promise<string | null> | null = null;

/** Force a refresh now (deduped across concurrent callers). */
export function forceRefreshAccessToken(): Promise<string | null> {
  if (!refreshingPromise) {
    refreshingPromise = supabase.auth
      .refreshSession()
      .then(({ data, error }) => (error || !data.session ? null : data.session.access_token))
      .finally(() => {
        refreshingPromise = null;
      });
  }
  return refreshingPromise;
}

/**
 * Install global resilience for token expiry:
 *  - Monkey-patches `supabase.functions.invoke` to (a) refresh the access token
 *    pre-flight when it's within the skew window, (b) rewrite any caller-
 *    supplied `Authorization: Bearer ...` header with the freshest token, and
 *    (c) retry once on a JWT-expired/401 response after a forced refresh.
 *  - Refreshes on tab visibility change so a long-idle tab never sends a
 *    stale token on the next user action.
 */
export function installAuthTokenResilience() {
  if (typeof window === "undefined") return;

  // 1. Patch supabase.functions.invoke
  const fns = supabase.functions as unknown as {
    invoke: (name: string, opts?: any) => Promise<any>;
    __originalInvoke?: (name: string, opts?: any) => Promise<any>;
  };
  if (!fns.__originalInvoke) {
    fns.__originalInvoke = fns.invoke.bind(supabase.functions);

    const callWithToken = async (name: string, opts: any, token: string | null) => {
      const next = { ...(opts ?? {}) };
      if (token) {
        const headers = { ...(next.headers ?? {}) } as Record<string, string>;
        // Replace any Authorization key (case-insensitive) with fresh token
        for (const k of Object.keys(headers)) {
          if (k.toLowerCase() === "authorization") delete headers[k];
        }
        headers.Authorization = `Bearer ${token}`;
        next.headers = headers;
      }
      return fns.__originalInvoke!(name, next);
    };

    fns.invoke = async (name: string, opts?: any) => {
      const callerProvidedAuth = !!(
        opts?.headers &&
        Object.keys(opts.headers).some((k) => k.toLowerCase() === "authorization")
      );

      // Pre-flight: ensure token is fresh when caller passes their own auth
      let token: string | null = null;
      if (callerProvidedAuth) {
        token = await getValidAccessToken();
      }

      let result = await callWithToken(name, opts, token);

      // Retry once on JWT expired / 401
      const err = result?.error as any;
      const status = err?.context?.status ?? err?.status;
      const msg = String(err?.message ?? "");
      const looksExpired =
        status === 401 ||
        /jwt expired/i.test(msg) ||
        /invalid_session|invalid jwt|token.*expired/i.test(msg);

      if (err && looksExpired) {
        const fresh = await forceRefreshAccessToken();
        if (fresh) {
          result = await callWithToken(name, opts, callerProvidedAuth ? fresh : null);
        }
      }
      return result;
    };
  }

  // 2. Refresh on visibility change (covers long-idle tabs)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void getValidAccessToken();
    }
  });

  // 3. Refresh on focus (extra safety for browsers that fire focus only)
  window.addEventListener("focus", () => {
    void getValidAccessToken();
  });
}