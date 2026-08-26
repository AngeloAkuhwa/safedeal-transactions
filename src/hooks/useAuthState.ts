import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { resilientAuthCall, markAuthHealthy } from "@/lib/auth-resilience";

/**
 * Is someone signed in, and what do we do when we cannot tell.
 *
 * This hook already refused to sign people out on anything but a 401 or 403,
 * which was right. What it still did was set `isAuthenticated` false on a 5xx,
 * and every consumer reads that as "signed out": nav switches to the logged
 * out state, gated content disappears, calls to action change. So the session
 * survived and the interface behaved as though it had not.
 *
 * The fix is to keep the last good answer when the service stops answering.
 * We hold a local session hint, the token is still valid, and nothing the
 * server said contradicts that. Guessing "signed out" from silence is a guess,
 * and it is the wrong one during an outage that has now happened twice.
 */
export function useAuthState() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  /** True while we are running on a stale belief because the service did not
   *  answer. Exposed so a surface can say so rather than pretend. */
  const [degraded, setDegraded] = useState(false);

  const syncAuthState = useCallback(async (hasSessionHint: boolean) => {
    if (!hasSessionHint) {
      setIsAuthenticated(false);
      setDegraded(false);
      setLoading(false);
      return;
    }

    const outcome = await resilientAuthCall("use_auth_state.get_user", () =>
      supabase.auth.getUser(),
    );

    if (outcome.kind === "unavailable") {
      // Hold the previous belief. There IS a local session, so the honest
      // reading of "we could not check" is "probably still signed in", and
      // the cost of being wrong here is a later 401 on a real request rather
      // than throwing a signed-in person out of a checkout.
      setIsAuthenticated(true);
      setDegraded(true);
      setLoading(false);
      return;
    }

    setDegraded(false);
    markAuthHealthy();

    if (outcome.kind === "denied") {
      setIsAuthenticated(false);
      setLoading(false);
      // The service answered, and the answer was no. Clearing the local
      // session is correct here and only here.
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      return;
    }

    // `resilientAuthCall` already unwrapped the { data, error } pair, so this
    // is getUser's `data`, whose shape is { user }.
    const user = (outcome.value as { user?: unknown } | undefined)?.user;
    setIsAuthenticated(Boolean(user));
    setLoading(false);
  }, []);

  useEffect(() => {
    let mounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setLoading(true);
      void syncAuthState(!!session);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      void syncAuthState(!!session);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [syncAuthState]);

  return { isAuthenticated, loading, degraded };
}
