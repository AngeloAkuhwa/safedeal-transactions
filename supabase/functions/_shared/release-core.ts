import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { createTransfer } from "./paystack.ts";
import { nairaToKobo } from "./money.ts";
import { notifyUser, notifyOpsTeam } from "./notify.ts";
import { formatMoney, PRICING_LINE_LABELS } from "./money-copy.ts";
import { assertPayoutEligible } from "./payout-eligibility.ts";
import { evaluateReleaseBlocks, hasOpenDispute } from "./dispute-guard.ts";
import { executeProviderRefund } from "./provider-refund.ts";

export { executeProviderRefund } from "./provider-refund.ts";

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
    .select("id, money_status, seller_id, buyer_id, transaction_code")
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
  const eligibility = await assertPayoutEligible(admin, tx.seller_id as string);
  if (!eligibility.ok) {
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
  const recipientCode = eligibility.recipientCode;

  // 5b. Canonical amount guard. The immutable pricing snapshot is the single
  // source of truth for what the seller is owed. If the payout row drifted
  // from the snapshot we refuse to transfer and flag the case for review
  // rather than moving a number nobody agreed to.
  const { data: pricingSnap } = await admin
    .from("transaction_pricing")
    .select("seller_payout_amount, platform_fee_amount, payment_processing_fee_amount, currency_code")
    .eq("transaction_id", transaction_id)
    .maybeSingle();
  const snapshotAmount = (pricingSnap as any)?.seller_payout_amount != null
    ? Number((pricingSnap as any).seller_payout_amount)
    : null;
  const rawPayoutAmount = (payout as any)?.amount;
  const payoutAmount = rawPayoutAmount == null ? null : Number(rawPayoutAmount);
  // No snapshot → no agreed net figure. Refuse rather than transferring an
  // unverified (potentially gross) number, which is what produced the
  // historical gross `payout_debit` rows.
  if (snapshotAmount == null) {
    try {
      await admin.rpc("flag_for_release_review", {
        p_transaction_id: transaction_id,
        p_reason: "pricing_missing",
        p_actor_user_id: actor_user_id,
        p_notes: "No pricing snapshot: cannot establish the net seller payout amount.",
      });
    } catch (e) {
      console.error("releasePayoutCore: flag_for_release_review failed", e);
    }
    return { ok: false, status: 409, body: { error: "pricing_missing" } };
  }
  if (payoutAmount == null || !Number.isFinite(payoutAmount) || Math.abs(snapshotAmount - payoutAmount) > 0.005) {
    try {
      await admin.rpc("flag_for_release_review", {
        p_transaction_id: transaction_id,
        p_reason: "release_amount_mismatch",
        p_actor_user_id: actor_user_id,
        p_notes: `Payout record holds ${payoutAmount ?? "no amount"} but the agreement snapshot says ${snapshotAmount}.`,
      });
    } catch (e) {
      console.error("releasePayoutCore: flag_for_release_review failed", e);
    }
    return {
      ok: false,
      status: 409,
      body: {
        error: "release_amount_mismatch",
        payout_amount: payoutAmount,
        snapshot_amount: snapshotAmount,
      },
    };
  }

  // 5c. Fee-chain guard. Fees are booked as `fee_record` at capture time by
  // `record_payment_capture_atomic`, so by release the chain must satisfy
  //   payment_credit = escrow_hold + fee_record   (and therefore
  //   payment_credit = payout_debit + fee_record, since payout_debit is NET).
  // Releasing on a broken chain is what forced the Fix 2 remediations, so we
  // refuse and flag instead of moving money.
  // FAIL CLOSED: a null fee column must never silently zero the expectation and
  // skip the reconciliation: that would let an unreconciled transfer through.
  const rawPlatformFee = (pricingSnap as any)?.platform_fee_amount;
  const rawProcessingFee = (pricingSnap as any)?.payment_processing_fee_amount;
  if (rawPlatformFee == null || rawProcessingFee == null) {
    try {
      await admin.rpc("flag_for_release_review", {
        p_transaction_id: transaction_id,
        p_reason: "manual_hold",
        p_actor_user_id: actor_user_id,
        p_notes:
          "fee_chain_unverifiable: the pricing snapshot is missing a platform or processing fee, so the ledger fee chain cannot be reconciled before release.",
      });
    } catch (e) {
      console.error("releasePayoutCore: flag_for_release_review failed", e);
    }
    return { ok: false, status: 409, body: { error: "fee_chain_unverifiable" } };
  }
  const expectedFees = Number(rawPlatformFee) + Number(rawProcessingFee);
  if (!Number.isFinite(expectedFees)) {
    return { ok: false, status: 409, body: { error: "fee_chain_unverifiable" } };
  }
  {
    const { data: feeRows } = await admin
      .from("escrow_ledger_entries")
      .select("amount")
      .eq("transaction_id", transaction_id)
      .eq("entry_type", "fee_record");
    const bookedFees = (feeRows ?? []).reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
    if (Math.abs(bookedFees - expectedFees) > 0.005) {
      try {
        await admin.rpc("flag_for_release_review", {
          p_transaction_id: transaction_id,
          // `manual_hold` is the allowed queue_type for this class of stop;
          // the notes carry the precise fee-chain discrepancy.
          p_reason: "manual_hold",
          p_actor_user_id: actor_user_id,
          p_notes: `fee_record_mismatch: ledger holds ${bookedFees} in fee_record entries but the snapshot expects ${expectedFees}.`,
        });
      } catch (e) {
        console.error("releasePayoutCore: flag_for_release_review failed", e);
      }
      return {
        ok: false,
        status: 409,
        body: { error: "fee_record_mismatch", booked_fees: bookedFees, expected_fees: expectedFees },
      };
    }
  }

  // 5d. Dispute / hold guard. Money must never leave escrow while a dispute is
  // still open, or while an explicit hold ('held' / 'awaiting_info') is on the
  // release review queue. NOTE: `needs_release_review` and queue rows in
  // 'pending'/'claimed' are the normal "ready for release review" states and
  // must remain releasable: that is how a dispute resolved in the seller's
  // favour legitimately pays out.
  const { data: disputeRows, error: disputeErr } = await admin
    .from("disputes")
    .select("id, status")
    .eq("transaction_id", transaction_id);
  if (disputeErr) return { ok: false, status: 500, body: { error: "dispute_check_failed" } };

  const { data: holdRows, error: holdErr } = await admin
    .from("release_review_queue")
    .select("id, status")
    .eq("transaction_id", transaction_id);
  if (holdErr) return { ok: false, status: 500, body: { error: "release_hold_check_failed" } };

  const block = evaluateReleaseBlocks(disputeRows as any[], holdRows as any[]);
  if (block) {
    return { ok: false, status: 409, body: block };
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
  // Transfer (and therefore the eventual `payout_debit`) is always the NET
  // snapshot figure. `payoutAmount` is guaranteed equal to it by step 5b.
  const amountKobo = nairaToKobo(snapshotAmount);
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
      description: `SafeDeal initiated ${PRICING_LINE_LABELS.seller_payout_amount} of ${formatMoney(
        Number((payout as any).amount),
        String((payout as any).currency_code ?? (pricingSnap as any)?.currency_code ?? ""),
      )}`,
      payout_id: (payout as any).id,
      reference,
      transfer_code: transferCode,
      status: providerStatus,
    },
  });

  await notifyUser(admin, {
    user_id: tx.seller_id,
    type: "payment_update",
    title: "Payout on the way",
    message: `Your ${PRICING_LINE_LABELS.seller_payout_amount} of ${formatMoney(
      Number((payout as any).amount),
      String((payout as any).currency_code ?? (pricingSnap as any)?.currency_code ?? ""),
    )} for ${(tx as any).transaction_code} is on its way to your bank.`,
    related_transaction_id: transaction_id,
  });

  // Buyer-side update: keep mental model consistent. Funds released, not "completed".
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
    .select("id, money_status, buyer_id, seller_id, transaction_code")
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

  // Ad-hoc admin refunds must not run while a dispute is still open. The
  // dispute-resolution path (resolve_dispute_atomic) is the only sanctioned
  // way to move money on a live dispute, and it is unaffected by this guard.
  const { data: refundDisputes, error: refundDisputeErr } = await admin
    .from("disputes")
    .select("id, status")
    .eq("transaction_id", transaction_id);
  if (refundDisputeErr) return { ok: false, status: 500, body: { error: "dispute_check_failed" } };
  if (hasOpenDispute(refundDisputes as any[])) {
    return { ok: false, status: 409, body: { error: "dispute_open" } };
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

  // SafeDeal MVP rule: Payment Processing Fee is non-refundable once payment
  // has been processed. Refund = buyer_total - payment_processing_fee.
  // A missing snapshot is the same missing fact that makes the release rail
  // refuse, so the refund rail refuses and flags too. It must not silently
  // return the full charged amount.
  const { data: pricingRow } = await admin
    .from("transaction_pricing")
    .select("buyer_total_amount, payment_processing_fee_amount")
    .eq("transaction_id", transaction_id)
    .maybeSingle();

  const buyerTotal = Number((pricingRow as any)?.buyer_total_amount);
  const processingFee =
    (pricingRow as any)?.payment_processing_fee_amount != null
      ? Number((pricingRow as any).payment_processing_fee_amount)
      : null;

  const paymentAmount = Number((payment as any).amount);
  if (!Number.isFinite(buyerTotal) || processingFee === null || !Number.isFinite(processingFee)) {
    try {
      await admin.rpc("flag_for_release_review", {
        p_transaction_id: transaction_id,
        p_reason: "pricing_missing",
        p_actor_user_id: actor_user_id,
        p_notes: "No pricing snapshot: cannot establish the refundable amount (buyer total minus non-refundable processing fee).",
      });
    } catch (e) {
      console.error("refundBuyerCore: flag_for_release_review failed", e);
    }
    return { ok: false, status: 409, body: { error: "pricing_missing" } };
  }
  const refundAmount = Math.max(buyerTotal - processingFee, 0);
  const isPartial = Number.isFinite(paymentAmount) && refundAmount < paymentAmount;

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

  // Single Paystack implementation lives in `executeProviderRefund`: it
  // handles partial/full detection, idempotency, refund-row persistence,
  // party notifications, and fail_refund_atomic + ops alerting on failure.
  const exec = await executeProviderRefund(admin, refundId, {
    reason,
    notes,
    actor_user_id: actor_user_id,
  });
  if (!exec.ok) {
    return {
      ok: false,
      status: 502,
      body: { error: exec.error, message: exec.message ?? null },
    };
  }
  const providerRef = exec.provider_reference;

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
      partial: isPartial,
      amount: refundAmount,
      payment_processing_fee_non_refundable: isPartial,
    },
  });

  return {
    ok: true,
    status: 200,
    body: {
      ok: true,
      refund_id: refundId,
      provider_reference: providerRef,
      amount: refundAmount,
      partial: isPartial,
      payment_processing_fee_non_refundable: isPartial,
      status: "processing",
    },
  };
}