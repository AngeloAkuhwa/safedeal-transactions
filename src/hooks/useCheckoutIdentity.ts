import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { supabase } from "@/integrations/supabase/client";

export type CheckoutAuthState = "loading" | "anonymous" | "needs-role" | "ready";

/**
 * Who is trying to pay, and what to do about it.
 *
 * The two halves of the share-token checkout, `/t/:shareToken` and
 * `/t/:shareToken/pay`, each carried their own copy of this: the same
 * `AuthState` union, the same getSession-then-read-user_roles effect, and the
 * same redirect targets. Two copies of one decision, and they had drifted into
 * disagreeing about the thing that matters most.
 *
 * The review page let an anonymous visitor read the whole page and only asked
 * for an account when they pressed Pay. The payment page redirected to `/auth`
 * from a mount effect, before the transaction had even been fetched. Same
 * flow, same token, opposite answers.
 *
 * That mattered because `/t/:shareToken/pay` is a URL a seller can send, a
 * buyer can bookmark, and the browser will return to on a refresh or a back
 * button. Every one of those arrivals hit the redirect. The buyer landed on a
 * sign-up form having never been shown the item, the price, the seller or the
 * terms, which is the moment most people close the tab.
 *
 * So: seeing is public, paying is not. `resolve-share-token` resolves purely
 * from the token and never reads the caller's identity, so there is nothing to
 * withhold from someone holding the link. Identity is asked for at the point
 * it is actually needed, which is the point money moves.
 *
 * `requireIdentity` returns true when the caller should stop, and takes the
 * buyer somewhere they can come back from.
 */
export function useCheckoutIdentity(shareToken: string | undefined) {
  const navigate = useNavigate();
  const [authState, setAuthState] = useState<CheckoutAuthState>("loading");

  useEffect(() => {
    let mounted = true;

    const read = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      if (!session) { setAuthState("anonymous"); return; }

      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id);
      if (!mounted) return;

      if (!roles || roles.length === 0) { setAuthState("needs-role"); return; }
      setAuthState(roles.some((r: { role: string }) => r.role === "buyer") ? "ready" : "needs-role");
    };

    void read();

    // Signing in happens in another tab often enough to matter: the buyer hits
    // "Sign up to pay", completes it, comes back, and the page should already
    // know. Without this the state stays "anonymous" until a reload.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      void read();
    });

    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  /**
   * Call at the moment of payment. Returns true if the caller must stop
   * because the buyer has been sent to sign in or to pick a role.
   *
   * `returnTo` defaults to the payment page rather than the review page, so a
   * buyer who signs in from here lands back on the step they were on rather
   * than one step behind it.
   */
  const requireIdentity = useCallback(
    (returnTo = `/t/${shareToken}/pay`): boolean => {
      if (authState === "anonymous") {
        // Both the query string and sessionStorage, because the auth flow
        // reads one and the post-role flow reads the other.
        sessionStorage.setItem("safedeal_redirect", returnTo);
        navigate(`/auth?redirect=${encodeURIComponent(returnTo)}`);
        return true;
      }
      if (authState === "needs-role") {
        sessionStorage.setItem("safedeal_redirect", returnTo);
        navigate(`/role-selection?redirect=${encodeURIComponent(returnTo)}`);
        return true;
      }
      // "loading" is deliberately not a stop. The button that calls this is
      // only reachable after the page has rendered, and treating an
      // in-flight session read as anonymous would bounce a signed-in buyer.
      return false;
    },
    [authState, navigate, shareToken],
  );

  return { authState, requireIdentity };
}
