import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { createRefund } from "./paystack.ts";
import { nairaToKobo } from "./money.ts";
import { notifyUser, notifyOpsTeam } from "./notify.ts";
import { formatMoney } from "./money-copy.ts";

export type ProviderRefundResult =
  | {
      ok: true;
      idempotent: boolean;
      refund_id: string;
      provider_reference: string | null;
      amount: number;
      partial: boolean;
      status: string;
    }
  | { ok: false; error: string; message?: string; refund_id: string };

/**
 * Single implementation of "actually move the money at Paystack for a refund
 * row". Used by the ad-hoc admin refund pipeline (`refundBuyerCore`), by the
 * dispute-resolution path in `admin-transaction-actions`, and by the retry
 * action: so there is exactly one place that talks to Paystack for refunds.
 *
 * Idempotent: a refund already handed off (status processing/refunded, or one
 * that already carries a provider_reference) returns success without calling
 * Paystack again.
 *
 * Fail closed on pricing: the refundable amount is defined by the pricing
 * snapshot (buyer total minus the non-refundable processing fee). The guard
 * lives HERE rather than in one caller so all three rails. The ad-hoc admin
 * refund, the dispute-resolution path and the retry action. Share it.
 *
 * Never throws: failures call `fail_refund_atomic`, alert ops, and return an
 * error result so the caller can decide what to report.
 */
export async function executeProviderRefund(
  admin: SupabaseClient,
  refundId: string,
  opts?: { reason?: string; notes?: string | null; actor_user_id?: string | null },
): Promise<ProviderRefundResult> {
  try {
    const { data: refund, error: rErr } = await admin
      .from("refunds")
      .select("id, transaction_id, refund_amount, status, provider_reference")
      .eq("id", refundId)
      .maybeSingle();
    if (rErr) return { ok: false, error: "refund_fetch_failed", refund_id: refundId };
    if (!refund) return { ok: false, error: "refund_not_found", refund_id: refundId };

    const currentStatus = String((refund as any).status ?? "");
    const existingRef = (refund as any).provider_reference as string | null;
    const refundAmount = Number((refund as any).refund_amount ?? 0);

    // Idempotency short-circuit: already handed off to Paystack.
    if (currentStatus === "processing" || currentStatus === "refunded" || existingRef) {
      return {
        ok: true,
        idempotent: true,
        refund_id: refundId,
        provider_reference: existingRef,
        amount: refundAmount,
        partial: false,
        status: currentStatus,
      };
    }

    if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
      return { ok: false, error: "invalid_refund_amount", refund_id: refundId };
    }

    const transactionId = (refund as any).transaction_id as string;

    // Pricing-snapshot guard: no snapshot, no money movement.
    const { data: pricingRow } = await admin
      .from("transaction_pricing")
      .select("buyer_total_amount, payment_processing_fee_amount")
      .eq("transaction_id", transactionId)
      .maybeSingle();
    const buyerTotal = Number((pricingRow as any)?.buyer_total_amount);
    const processingFee =
      (pricingRow as any)?.payment_processing_fee_amount != null
        ? Number((pricingRow as any).payment_processing_fee_amount)
        : Number.NaN;
    if (!Number.isFinite(buyerTotal) || !Number.isFinite(processingFee)) {
      try {
        await admin.rpc("flag_for_release_review", {
          p_transaction_id: transactionId,
          p_reason: "pricing_missing",
          p_actor_user_id: opts?.actor_user_id ?? null,
          p_notes:
            "No pricing snapshot: cannot establish the refundable amount before moving money at the provider.",
        });
      } catch (e) {
        console.error("executeProviderRefund: flag_for_release_review failed", e);
      }
      return { ok: false, error: "pricing_missing", refund_id: refundId };
    }
    // The refundable ceiling is buyer total minus the non-refundable
    // processing fee. Anything above it is a policy breach, not a rounding.
    if (refundAmount > Math.max(buyerTotal - processingFee, 0) + 0.005) {
      return { ok: false, error: "refund_exceeds_refundable_amount", refund_id: refundId };
    }

    const { data: tx } = await admin
      .from("transactions")
      .select("id, buyer_id, seller_id, transaction_code, currency_code")
      .eq("id", transactionId)
      .maybeSingle();

    const { data: payment, error: payErr } = await admin
      .from("payments")
      .select("id, provider_reference, amount")
      .eq("transaction_id", transactionId)
      .eq("status", "succeeded")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (payErr) return { ok: false, error: "payment_fetch_failed", refund_id: refundId };
    if (!(payment as any)?.provider_reference) {
      return { ok: false, error: "no_successful_payment", refund_id: refundId };
    }

    const paymentAmount = Number((payment as any).amount);
    // Partial vs full is decided exactly as the ad-hoc pipeline does: anything
    // below the captured payment amount is a PARTIAL Paystack refund. Note
    // seller-fault dispute refunds are item + platform fee (< buyer_total), so
    // they are partial by design.
    const isPartial = Number.isFinite(paymentAmount) && refundAmount < paymentAmount;
    const reason = opts?.reason ?? "refund";
    const notes = opts?.notes ?? null;

    let paystack;
    try {
      paystack = await createRefund({
        transaction: (payment as any).provider_reference,
        customer_note: `SafeDeal refund for ${(tx as any)?.transaction_code ?? transactionId}`,
        merchant_note: notes ? `${reason} / ${notes}` : reason,
        ...(isPartial ? { amount: nairaToKobo(refundAmount) } : {}),
      });
    } catch (e) {
      paystack = { ok: false, status: 0, message: String(e), raw: null } as const;
    }

    if (!paystack.ok) {
      const reasonText = (paystack as any).message || `paystack_http_${(paystack as any).status}`;
      try {
        await admin.rpc("fail_refund_atomic", { p_refund_id: refundId, p_reason: reasonText });
      } catch (e) {
        console.error("executeProviderRefund: fail_refund_atomic", e);
      }
      await notifyOpsTeam(admin, {
        type: "security_alert",
        title: "Refund failed at Paystack",
        message: `Refund for ${(tx as any)?.transaction_code ?? transactionId} rejected: ${reasonText}`,
        related_transaction_id: transactionId,
        metadata: { severity: "high", refund_id: refundId, status: (paystack as any).status },
      });
      return { ok: false, error: "paystack_refund_failed", message: reasonText, refund_id: refundId };
    }

    const providerRef = (paystack as any).data?.id ? String((paystack as any).data.id) : null;
    await admin
      .from("refunds")
      .update({
        provider_reference: providerRef,
        initiated_at: new Date().toISOString(),
        status: "processing",
      })
      .eq("id", refundId);

    if ((tx as any)?.buyer_id) {
      await notifyUser(admin, {
        user_id: (tx as any).buyer_id,
        type: "payment_update",
        title: "Refund on the way",
        message: `SafeDeal has initiated a refund of ${formatMoney(refundAmount, String((tx as any)?.currency_code ?? ""))} for ${(tx as any).transaction_code}.`,
        related_transaction_id: transactionId,
      });
    }
    if ((tx as any)?.seller_id) {
      await notifyUser(admin, {
        user_id: (tx as any).seller_id,
        type: "transaction_update",
        title: "Refund initiated",
        message: `SafeDeal has refunded the buyer for ${(tx as any).transaction_code}.`,
        related_transaction_id: transactionId,
      });
    }

    return {
      ok: true,
      idempotent: false,
      refund_id: refundId,
      provider_reference: providerRef,
      amount: refundAmount,
      partial: isPartial,
      status: "processing",
    };
  } catch (e) {
    console.error("executeProviderRefund: unexpected", e);
    return { ok: false, error: "provider_refund_unexpected", message: String(e), refund_id: refundId };
  }
}
