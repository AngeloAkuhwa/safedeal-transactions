import { supabase } from "@/integrations/supabase/client";
import { resilientAuthCall, markAuthHealthy } from "@/lib/auth-resilience";

/**
 * Sign in, retrying a service failure but never a refusal.
 *
 * A 5xx from the password grant is weather, not a verdict. During the
 * 2026-08-24 and 2026-08-25 degradations, sign-ins succeeded and timed out
 * seconds apart, and a single attempt turned a working password into "invalid
 * email or password" on screen. The audit harness already learned this and
 * retries; the product itself did not, so real people saw the wrong message
 * about their own credentials.
 *
 * A wrong password is still one attempt: `resilientAuthCall` returns `denied`
 * on 400/401/403 immediately, so this never sits there retrying a typo, and
 * never turns a login form into a slow credential-stuffing amplifier.
 *
 * The `{ data, error }` shape is preserved so the caller did not have to
 * change; only the message differs, and only when the truth differs.
 */
export const signIn = async (email: string, password: string) => {
  const outcome = await resilientAuthCall("auth.sign_in", () =>
    supabase.auth.signInWithPassword({ email, password }),
  );

  if (outcome.kind === "ok") {
    markAuthHealthy();
    return { data: outcome.value, error: null };
  }
  if (outcome.kind === "denied") {
    return {
      data: { user: null, session: null },
      error: { message: outcome.message, status: outcome.status ?? 400 },
    };
  }
  return {
    data: { user: null, session: null },
    error: {
      // Deliberately not "invalid email or password". It was never checked,
      // and telling someone their password is wrong when it is not sends them
      // to reset a password that works.
      message:
        "We could not reach the sign-in service. Your details are fine; please try again in a moment.",
      status: 503,
    },
  };
};

export const signUp = async (
  email: string,
  password: string,
  metadata: Record<string, string>
) => {
  return supabase.auth.signUp({
    email,
    password,
    options: { data: metadata },
  });
};

export const signOut = async () => {
  return supabase.auth.signOut();
};

export const getSession = async () => {
  return supabase.auth.getSession();
};

export const onAuthStateChange = (
  callback: Parameters<typeof supabase.auth.onAuthStateChange>[0]
) => {
  return supabase.auth.onAuthStateChange(callback);
};

export const resendVerificationEmail = async (email: string) => {
  return supabase.auth.resend({ type: "signup", email });
};

export const resetPasswordForEmail = async (
  email: string,
  redirectTo: string
) => {
  return supabase.auth.resetPasswordForEmail(email, { redirectTo });
};

export const updatePassword = async (password: string) => {
  return supabase.auth.updateUser({ password });
};
