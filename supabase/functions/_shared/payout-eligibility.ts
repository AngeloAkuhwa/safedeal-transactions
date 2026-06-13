/**
 * Central payout-eligibility evaluator.
 *
 * Reads (only) what the DB already knows about the payout, transaction,
 * dispute, refund, and payout account. Returns a structured decision so the
 * admin UI and edge functions agree on a single answer.
 *
 * The DB atomic RPCs (release_payout_atomic, retry_payout_atomic, …) remain
 * the final authority — this module short-circuits the obvious cases and
 * powers the disabled/enabled CTA state in the admin drawer.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export type GateId =
  | "money_status_pending_release"
  | "no_active_dispute"
  | "no_open_investigation"
  | "no_release_review"
  | "payout_status_awaiting_release"
  | "payout_not_blocked"
  | "payout_account_verified"
  | "provider_recipient_present"
  | "no_refund_in_flight"
  | "payout_not_already_processing"
  | "admin_permission";

export interface GateResult {
  id: GateId;
  label: string;
  pass: boolean;
  detail?: string;
}

export interface PayoutEligibility {
  payout_id: string | null;
  transaction_id: string;
  can_release: boolean;
  can_retry: boolean;
  can_block: boolean;
  can_unblock: boolean;
  can_refund: boolean;
  first_blocker: GateId | null;
  gates: GateResult[];
}

const GATE_LABELS: Record<GateId, string> = {
  money_status_pending_release: "Funds awaiting release",
  no_active_dispute: "No active dispute",
  no_open_investigation: "No open investigation",
  no_release_review: "Release review cleared",
  payout_status_awaiting_release: "Payout awaiting release",
  payout_not_blocked: "Payout not blocked",
  payout_account_verified: "Payout account verified",
  provider_recipient_present: "Transfer recipient available",
  no_refund_in_flight: "No refund in flight",
  payout_not_already_processing: "Payout not already in transfer",
  admin_permission: "Admin has release permission",
};

const ACTIVE_DISPUTE_STATUSES = new Set(["open", "seller_response_pending", "under_review"]);
const IN_FLIGHT_REFUND_STATUSES = new Set(["pending", "processing", "awaiting_provider"]);
const IN_FLIGHT_PAYOUT_STATUSES = new Set(["pending", "processing"]);

export async function evaluatePayoutEligibility(
  admin: SupabaseClient,
  args: { transaction_id: string; payout_id?: string | null; admin_user_id: string },
): Promise<PayoutEligibility> {
  const { transaction_id, payout_id, admin_user_id } = args;

  // Load tx, payout, account, dispute, refund, review queue in parallel.
  const [txRes, payoutRes, disputeRes, refundRes, reviewRes, permRes] = await Promise.all([
    admin
      .from("transactions")
      .select("id, seller_id, money_status, dispute_status")
      .eq("id", transaction_id)
      .maybeSingle(),
    payout_id
      ? admin
          .from("payouts")
          .select("id, transaction_id, seller_id, status, release_blocked, provider_reference, amount, currency_code")
          .eq("id", payout_id)
          .maybeSingle()
      : admin
          .from("payouts")
          .select("id, transaction_id, seller_id, status, release_blocked, provider_reference, amount, currency_code")
          .eq("transaction_id", transaction_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
    admin
      .from("disputes")
      .select("id, status")
      .eq("transaction_id", transaction_id),
    admin
      .from("refunds")
      .select("id, status")
      .eq("transaction_id", transaction_id),
    admin
      .from("release_review_queue")
      .select("id, status")
      .eq("transaction_id", transaction_id)
      .in("status", ["pending", "in_progress"]),
    admin.rpc("has_role", { _user_id: admin_user_id, _role: "super_admin" }),
  ]);

  const tx = txRes.data as any;
  const payout = payoutRes.data as any;
  const disputes = (disputeRes.data ?? []) as Array<{ status: string }>;
  const refunds = (refundRes.data ?? []) as Array<{ status: string }>;
  const reviews = (reviewRes.data ?? []) as Array<{ status: string }>;
  const hasPermission = Boolean((permRes as any)?.data);

  // Payout account fetched only after we know the seller_id.
  let accountRow: any = null;
  if (tx?.seller_id) {
    const { data } = await admin
      .from("payout_accounts")
      .select("id, verification_status, provider_recipient_code")
      .eq("user_id", tx.seller_id)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle();
    accountRow = data;
  }

  const gates: GateResult[] = [
    {
      id: "money_status_pending_release",
      label: GATE_LABELS.money_status_pending_release,
      pass: tx?.money_status === "funds_pending_release",
      detail: tx?.money_status ?? undefined,
    },
    {
      id: "no_active_dispute",
      label: GATE_LABELS.no_active_dispute,
      pass: !disputes.some((d) => ACTIVE_DISPUTE_STATUSES.has(d.status)),
    },
    {
      id: "no_open_investigation",
      label: GATE_LABELS.no_open_investigation,
      pass: true, // hook for future admin_investigations check; default pass
    },
    {
      id: "no_release_review",
      label: GATE_LABELS.no_release_review,
      pass: reviews.length === 0,
    },
    {
      id: "payout_status_awaiting_release",
      label: GATE_LABELS.payout_status_awaiting_release,
      pass: payout?.status === "awaiting_release",
      detail: payout?.status ?? undefined,
    },
    {
      id: "payout_not_blocked",
      label: GATE_LABELS.payout_not_blocked,
      pass: !payout?.release_blocked,
    },
    {
      id: "payout_account_verified",
      label: GATE_LABELS.payout_account_verified,
      pass: accountRow?.verification_status === "verified",
    },
    {
      id: "provider_recipient_present",
      label: GATE_LABELS.provider_recipient_present,
      pass: Boolean(accountRow?.provider_recipient_code),
    },
    {
      id: "no_refund_in_flight",
      label: GATE_LABELS.no_refund_in_flight,
      pass: !refunds.some((r) => IN_FLIGHT_REFUND_STATUSES.has(r.status)),
    },
    {
      id: "payout_not_already_processing",
      label: GATE_LABELS.payout_not_already_processing,
      pass: !IN_FLIGHT_PAYOUT_STATUSES.has(payout?.status),
    },
    {
      id: "admin_permission",
      label: GATE_LABELS.admin_permission,
      pass: hasPermission,
    },
  ];

  const firstBlocker = gates.find((g) => !g.pass)?.id ?? null;
  const canRelease = gates.every((g) => g.pass);
  const canRetry =
    payout?.status === "failed" &&
    !payout?.release_blocked &&
    hasPermission &&
    !refunds.some((r) => IN_FLIGHT_REFUND_STATUSES.has(r.status));
  const canBlock = !payout?.release_blocked && hasPermission && payout?.status === "awaiting_release";
  const canUnblock = Boolean(payout?.release_blocked) && hasPermission;
  const canRefund =
    hasPermission &&
    !IN_FLIGHT_PAYOUT_STATUSES.has(payout?.status) &&
    payout?.status !== "completed" &&
    !refunds.some((r) => IN_FLIGHT_REFUND_STATUSES.has(r.status));

  return {
    payout_id: payout?.id ?? null,
    transaction_id,
    can_release: canRelease,
    can_retry: canRetry,
    can_block: canBlock,
    can_unblock: canUnblock,
    can_refund: canRefund,
    first_blocker: firstBlocker,
    gates,
  };
}