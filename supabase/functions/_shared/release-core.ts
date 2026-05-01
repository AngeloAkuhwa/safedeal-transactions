import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { createTransfer, createRefund } from "./paystack.ts";
import { nairaToKobo } from "./money.ts";
import { notifyUser, notifyOpsTeam } from "./notify.ts";

export type CoreResult =
  | { ok: true; status: number; body: Record<string, unknown> }
  | { ok: false; status: number; body: Record<string, unknown> };

/**
 * Shared release-payout pipeline. Used by both the `release-funds` HTTP
 * endpoint and the `resolve-release-review` orchestrator. Caller is
 * responsible for admin authorisation.
 */
export async function releasePayoutCore(
  admin: SupabaseClient,
  args: { transaction_id: string; payout_id?: string; actor_user_id: string; notes?: string | null },
): Promise<CoreResult> {
  const { transaction_id, payout_id, actor_user_id } = args;
  const notes = args.notes ?? null;

  // 1. Load tx
  const { data: tx, error: txErr } = await admin
    .from("transactions")
    .select("id, money_status, seller_id, buyer_id, currency_code, transaction_code")
    .eq("id", transaction_id)
    .maybeSingle();
  if (txErr) return { ok: false, status: 500, body: { error: "tx_fetch_failed" } };
  if (!tx) return { ok: false, status: 404, body: { error: "transaction_not_found" } };

  // 2. Resolve payout (any status). The idempotency short-circuit needs to
  //    inspect the payout regardless of `money_status`.
  let payoutQuery = admin
    .from("payouts")
    .select("id, transaction_id, seller_id, amount, currency_code, status, release_blocked, payout_blocked_reason, provider_reference")
    .eq("transaction_id", transaction_id);
  const { data: payouts, error: pErr } = await payoutQuery;
  if (pErr) return { ok: false, status: 500, body: { error: "payout_fetch_failed" } };
  if (!payouts || payouts.length === 0) return { ok: false, status: 409, body: { error: "no_payout" } };

  let payout = payout_id
    ? payouts.find((p) => (p as any).id === payout_id)
    : (payouts.length === 1 ? payouts[0] : payouts.find((p) => (p as any).status === "awaiting_release"));
  if (!payout) return { ok: false, status: 409, body: { error: payout_id ? "payout_not_for_transaction" : "ambiguous_payout", count: payouts.length } };

  // 3. Idempotency short-circuit: if payout has already been handed off to
  //    Paystack (processing or completed) and we already have a provider
  //    reference, return the current state without calling Paystack again.
  const status = (payout as any).status as string;
  const providerRef = (payout as any).provider_reference as string | null;
  if ((status === "processing" || status === "completed") && providerRef) {
    return {
      ok: true,
      status: 200,
      body: {
        ok: true,
        idempotent: true,
        payout_id: (payout as any).id,
        status,
        transfer_reference: providerRef,
      },
    };
  }

  // 4. Now enforce the normal guards.
  if (tx.money_status !== "funds_pending_release") {
    return { ok: false, status: 409, body: { error: "not_in_pending_release", money_status: tx.money_status } };
  }
  if (status !== "awaiting_release") {
    return { ok: false, status: 409, body: { error: "payout_not_awaiting", status } };
  }
  if ((payout as any).release_blocked) {
    return { ok: false, status: 409, body: { error: "payout_blocked", reason: (payout as any).payout_blocked_reason } };
  }

  // 5. Resolve seller's verified Paystack recipient
  const { data: account, error: acctErr } = await admin
    .from("payout_accounts")
    .select("id, provider_recipient_code, verification_status")
    .eq("user_id", tx.seller_id)
    .maybeSingle();
  if (acctErr) return { ok: false, status: 500, body: { error: "account_fetch_failed" } };

  const recipientCode = (account as any)?.provider_recipient_code;
  if (!recipientCode || (account as any)?.verification_status !== "verified") {
    try {
      await admin.rpc("flag_for_release_review", {
        p_transaction_id: transaction_id,
        p_reason: "payout_account_missing",
        p_actor_user_id: actor_user_id,
        p_notes: "Seller payout account is not verified or missing Paystack recipient.",
      });
    } catch (e) {
      console.error("releasePayoutCore: flag_for_release_review failed", e);
    }
    return { ok: false, status: 409, body: { error: "payout_account_unverified" } };
  }

  // 6. Atomic state flip
  const { error: rpcErr } = await admin.rpc("release_payout_atomic", {
    p_transaction_id: transaction_id,
    p_payout_id: (payout as any).id,
    p_actor_user_id: actor_user_id,
    p_notes: notes,
  });
  if (rpcErr) {
    console.error("releasePayoutCore: release_payout_atomic failed", rpcErr);
    return { ok: false, status: 409, body: { error: "state_conflict", detail: rpcErr.message ?? "rpc_failed" } };
  }

  // 7. Paystack transfer
  const reference = `payout_${(payout as any).id}`;
  const amountKobo = nairaToKobo(Number((payout as any).amount));
  const transferReason = `SafeDeal release for ${(tx as any).transaction_code}`;

  let transfer: { ok: boolean; status?: number; message?: string; data?: any; raw?: any };
  try {
    transfer = await createTransfer({
      source: "balance",
      amount: amountKobo,
      recipient: recipientCode,
      reason: transferReason,
      reference,
    });
  } catch (e) {
    transfer = { ok: false, status: 0, message: String(e), raw: null };
  }

  if (!transfer.ok) {
    const reason = transfer.message || `paystack_http_${transfer.status}`;
    const { data: maxRetriesSetting } = await admin
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", "payout_max_retry_attempts")
      .maybeSingle();
    const maxRetries = Number((maxRetriesSetting as any)?.setting_value ?? 3);
    try {
      await admin.rpc("fail_payout_atomic", {
        p_payout_id: (payout as any).id,
        p_reason: reason,
        p_max_retries: maxRetries,
      });
    } catch (e) {
      console.error("releasePayoutCore: fail_payout_atomic failed", e);
    }
    await notifyOpsTeam(admin, {
      type: "security_alert",
      title: "Release failed at Paystack",
      message: `Transfer for ${(tx as any).transaction_code} rejected: ${reason}`,
      related_transaction_id: transaction_id,
      metadata: { severity: "high", payout_id: (payout as any).id, reference, status: transfer.status },
    });
    return { ok: false, status: 502, body: { error: "paystack_transfer_failed", message: reason } };
  }

  // 8. Persist provider response
  const transferCode = transfer.data?.transfer_code ?? null;
  const providerStatus = transfer.data?.status ?? "pending";
  const noteAppendix = `[paystack:${providerStatus}${transferCode ? ` ${transferCode}` : ""}]`;
  await admin
    .from("payouts")
    .update({
      provider_reference: reference,
      initiated_at: new Date().toISOString(),
      notes: notes ? `${notes} ${noteAppendix}` : noteAppendix,
    })
    .eq("id", (payout as any).id);

  await admin.from("transaction_events").insert({
    transaction_id,
    event_type: "payout_released",
    actor_user_id: actor_user_id,
    actor_role: "admin",
    event_data: {
      description: `SafeDeal initiated payout transfer of ${(tx as any).currency_code} ${Number((payout as any).amount).toLocaleString()}`,
      payout_id: (payout as any).id,
      reference,
      transfer_code: transferCode,
      status: providerStatus,
    },
  });

  await notifyUser(admin, {
    user_id: tx.seller_id,
    type: "payment_update",
    title: "Releasing your funds",
    message: `SafeDeal has approved your payout for ${(tx as any).transaction_code}. The transfer is on the way to your bank.`,
    related_transaction_id: transaction_id,
  });

  // Buyer-side update: keep mental model consistent — funds released, not "completed".
  if ((tx as any).buyer_id) {
    await notifyUser(admin, {
      user_id: (tx as any).buyer_id,
      type: "transaction_update",
      title: "Funds released to seller",
      message: `SafeDeal has approved the release for ${(tx as any).transaction_code}.`,
      related_transaction_id: transaction_id,
    });
  }

  return {
    ok: true,
    status: 200,
    body: {
      ok: true,
      payout_id: (payout as any).id,
      transfer_reference: reference,
      transfer_code: transferCode,
      status: providerStatus,
    },
  };
}

/**
 * Shared full-refund pipeline (Phase B is full-refund only).
 * Caller is responsible for admin authorisation.
 */
export async function refundBuyerCore(
  admin: SupabaseClient,
  args: { transaction_id: string; reason: string; notes?: string | null; actor_user_id: string },
): Promise<CoreResult> {
  const { transaction_id, reason, actor_user_id } = args;
  const notes = args.notes ?? null;

  const { data: tx, error: txErr } = await admin
    .from("transactions")
    .select("id, money_status, buyer_id, seller_id, currency_code, transaction_code, total_amount")
    .eq("id", transaction_id)
    .maybeSingle();
  if (txErr) return { ok: false, status: 500, body: { error: "tx_fetch_failed" } };
  if (!tx) return { ok: false, status: 404, body: { error: "transaction_not_found" } };

  const eligible = ["funds_held_in_escrow", "funds_pending_release", "funds_frozen"];
  if (!eligible.includes((tx as any).money_status)) {
    return { ok: false, status: 409, body: { error: "invalid_money_status_for_refund", money_status: (tx as any).money_status } };
  }

  // Hard guard: refund-after-payout is out of scope for Phase B.
  const { data: completedPayouts, error: payoutChkErr } = await admin
    .from("payouts")
    .select("id, status")
    .eq("transaction_id", transaction_id)
    .in("status", ["processing", "completed"])
    .limit(1);
  if (payoutChkErr) return { ok: false, status: 500, body: { error: "payout_check_failed" } };
  if (completedPayouts && completedPayouts.length > 0) {
    return { ok: false, status: 409, body: { error: "payout_already_completed" } };
  }

  // In-flight refund?
  const { data: openRefund } = await admin
    .from("refunds")
    .select("id, status")
    .eq("transaction_id", transaction_id)
    .in("status", ["pending", "processing"])
    .limit(1);
  if (openRefund && openRefund.length > 0) {
    return { ok: false, status: 409, body: { error: "refund_already_in_flight" } };
  }

  const { data: payment, error: payErr } = await admin
    .from("payments")
    .select("id, provider_reference, amount")
    .eq("transaction_id", transaction_id)
    .eq("status", "succeeded")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (payErr) return { ok: false, status: 500, body: { error: "payment_fetch_failed" } };
  if (!(payment as any)?.provider_reference) {
    return { ok: false, status: 409, body: { error: "no_successful_payment" } };
  }

  // Phase B = full refund only — refund the full captured payment amount.
  const refundAmount = Number((payment as any).amount);
  if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
    return { ok: false, status: 409, body: { error: "invalid_refund_amount" } };
  }

  const { data: refundIdRaw, error: rpcErr } = await admin.rpc("start_refund_atomic", {
    p_transaction_id: transaction_id,
    p_amount: refundAmount,
    p_actor_user_id: actor_user_id,
    p_reason: reason,
    p_notes: notes,
  });
  if (rpcErr) {
    console.error("refundBuyerCore: start_refund_atomic", rpcErr);
    return { ok: false, status: 409, body: { error: "state_conflict", detail: rpcErr.message } };
  }
  const refundId = refundIdRaw as string;

  // Full refund: omit `amount` so Paystack refunds the entire payment.
  const paystack = await createRefund({
    transaction: (payment as any).provider_reference,
    customer_note: `SafeDeal refund for ${(tx as any).transaction_code}`,
    merchant_note: notes ? `${reason} / ${notes}` : reason,
  });

  if (!paystack.ok) {
    const reasonText = paystack.message || `paystack_http_${paystack.status}`;
    try {
      await admin.rpc("fail_refund_atomic", { p_refund_id: refundId, p_reason: reasonText });
    } catch (e) {
      console.error("refundBuyerCore: fail_refund_atomic", e);
    }
    await notifyOpsTeam(admin, {
      type: "security_alert",
      title: "Refund failed at Paystack",
      message: `Refund for ${(tx as any).transaction_code} rejected: ${reasonText}`,
      related_transaction_id: transaction_id,
      metadata: { severity: "high", refund_id: refundId, status: paystack.status },
    });
    return { ok: false, status: 502, body: { error: "paystack_refund_failed", message: reasonText } };
  }

  const providerRef = paystack.data?.id ? String(paystack.data.id) : null;
  await admin
    .from("refunds")
    .update({
      provider_reference: providerRef,
      initiated_at: new Date().toISOString(),
      status: "processing",
    })
    .eq("id", refundId);

  await admin.from("transaction_events").insert({
    transaction_id,
    event_type: "refund_issued",
    actor_user_id: actor_user_id,
    actor_role: "admin",
    event_data: {
      reason,
      notes: notes ?? null,
      refund_id: refundId,
      provider_reference: providerRef,
      partial: false,
      amount: refundAmount,
      currency_code: (tx as any).currency_code,
    },
  });

  await notifyUser(admin, {
    user_id: (tx as any).buyer_id,
    type: "payment_update",
    title: "Refund on the way",
    message: `SafeDeal has initiated a refund of ${(tx as any).currency_code} ${refundAmount.toLocaleString()} for ${(tx as any).transaction_code}.`,
    related_transaction_id: transaction_id,
  });
  await notifyUser(admin, {
    user_id: (tx as any).seller_id,
    type: "transaction_update",
    title: "Refund initiated",
    message: `SafeDeal has refunded the buyer for ${(tx as any).transaction_code}.`,
    related_transaction_id: transaction_id,
  });

  return {
    ok: true,
    status: 200,
    body: {
      ok: true,
      refund_id: refundId,
      provider_reference: providerRef,
      amount: refundAmount,
      partial: false,
      status: "processing",
    },
  };
}