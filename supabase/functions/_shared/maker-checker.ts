import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

/**
 * Maker-checker (segregation of duties) for money-movement endpoints.
 *
 * The approver executing a release/refund must not be the same person who
 * initiated (flagged / opened) the underlying item. Controlled by the
 * platform setting `finance.maker_checker_enforced`, which is OFF by default
 * so a single-operator launch is not blocked. When off we log only.
 */
export {
  MAKER_CHECKER_SETTING_KEY,
  MAKER_CHECKER_ERROR,
  evaluateMakerChecker,
} from "./maker-checker-rules.ts";
export type { MakerCheckerDecision } from "./maker-checker-rules.ts";

import {
  MAKER_CHECKER_SETTING_KEY as SETTING_KEY,
  evaluateMakerChecker as evaluate,
} from "./maker-checker-rules.ts";
import type { MakerCheckerDecision } from "./maker-checker-rules.ts";

/** Read the platform switch. Fails CLOSED to `false` (log-only) on read errors. */
export async function isMakerCheckerEnforced(admin: SupabaseClient): Promise<boolean> {
  try {
    const { data } = await admin
      .from("system_settings")
      .select("setting_value")
      .eq("scope", "platform")
      .eq("setting_key", SETTING_KEY)
      .maybeSingle();
    const raw = (data as { setting_value?: unknown } | null)?.setting_value;
    return raw === true || raw === "true";
  } catch (_e) {
    return false;
  }
}

/**
 * Who initiated this money movement? The first person who flagged the
 * transaction into the release review queue is the maker.
 */
export async function resolveReleaseInitiator(
  admin: SupabaseClient,
  transactionId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("release_review_queue")
    .select("flagged_by_user_id, created_at")
    .eq("transaction_id", transactionId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return ((data as { flagged_by_user_id?: string | null } | null)?.flagged_by_user_id) ?? null;
}

/**
 * Refund initiator: whoever flagged/opened the case. Falls back to the
 * initiator recorded on an earlier refund attempt for the same transaction.
 */
export async function resolveRefundInitiator(
  admin: SupabaseClient,
  transactionId: string,
): Promise<string | null> {
  const flagged = await resolveReleaseInitiator(admin, transactionId);
  if (flagged) return flagged;
  const { data } = await admin
    .from("refunds")
    .select("initiated_by_user_id, created_at")
    .eq("transaction_id", transactionId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return ((data as { initiated_by_user_id?: string | null } | null)?.initiated_by_user_id) ?? null;
}

/**
 * Full gate. Returns the decision; callers reject with 409 when
 * `allowed === false`. Never throws.
 */
export async function checkMakerChecker(
  admin: SupabaseClient,
  args: { transactionId: string; approverId: string; kind: "release" | "refund" },
): Promise<MakerCheckerDecision> {
  const [enforced, initiatorId] = await Promise.all([
    isMakerCheckerEnforced(admin),
    args.kind === "refund"
      ? resolveRefundInitiator(admin, args.transactionId)
      : resolveReleaseInitiator(admin, args.transactionId),
  ]);
  const decision = evaluate({ enforced, initiatorId, approverId: args.approverId });
  if (decision.selfApproval && !decision.enforced) {
    console.warn(JSON.stringify({
      event: "maker_checker_log_only",
      kind: args.kind,
      transaction_id: args.transactionId,
      approver_id: args.approverId,
      initiator_id: initiatorId,
      note: "would_block_if_finance.maker_checker_enforced_were_on",
    }));
  }
  return decision;
}
