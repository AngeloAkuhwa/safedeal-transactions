import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export type PayoutEligibilityResult =
  | { ok: true; recipientCode: string; accountState: string }
  | { ok: false; code: "payout_account_unverified"; message: string; accountState: string | null };

/**
 * Server-side payout eligibility gate. Reuses the same v_payout_account_state
 * view already consulted by release-core / retry-payout: the seller's payout
 * account must be verified (`account_state === "verified_ready"`) and must
 * have a non-empty Paystack recipient code before any funds can move.
 */
export async function assertPayoutEligible(
  admin: SupabaseClient,
  sellerId: string,
): Promise<PayoutEligibilityResult> {
  const { data: account, error } = await admin
    .from("v_payout_account_state")
    .select("provider_recipient_code, verification_status, account_state")
    .eq("user_id", sellerId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      code: "payout_account_unverified",
      message: "Add and verify your payout account before funds can be released.",
      accountState: null,
    };
  }

  const recipientCode = (account as any)?.provider_recipient_code as string | undefined;
  const accountState = (account as any)?.account_state as string | undefined ?? null;

  if (accountState !== "verified_ready" || !recipientCode) {
    return {
      ok: false,
      code: "payout_account_unverified",
      message: "Add and verify your payout account before funds can be released.",
      accountState,
    };
  }

  return { ok: true, recipientCode, accountState };
}
