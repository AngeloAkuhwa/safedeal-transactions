import { z } from "https://esm.sh/zod@3.23.8";
import { requireAdmin, authErrorResponse } from "../_shared/auth.ts";
import { createRefund } from "../_shared/paystack.ts";
import { nairaToKobo } from "../_shared/money.ts";
import { notifyUser, notifyOpsTeam } from "../_shared/notify.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BodySchema = z.object({
  transaction_id: z.string().uuid(),
  // Optional partial-refund amount in NAIRA. Omit for full refund.
  amount: z.number().positive().optional(),
  reason: z.string().trim().min(3).max(200),
  notes: z.string().trim().max(500).optional(),
});

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  let ctx;
  try { ctx = await requireAdmin(req); }
  catch (err) {
    const r = authErrorResponse(err, corsHeaders);
    if (r) return r;
    console.error("refund-buyer auth error", err);
    return json(500, { error: "auth_failed" });
  }

  let raw: unknown;
  try { raw = await req.json(); } catch { return json(400, { error: "invalid_json" }); }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return json(400, { error: "invalid_body", issues: parsed.error.flatten().fieldErrors });
  }
  const { transaction_id, amount, reason, notes } = parsed.data;
  const admin = ctx.adminClient;

  // 1. Load tx + buyer
  const { data: tx, error: txErr } = await admin
    .from("transactions")
    .select("id, money_status, buyer_id, seller_id, currency_code, transaction_code, total_amount")
    .eq("id", transaction_id)
    .maybeSingle();
  if (txErr) return json(500, { error: "tx_fetch_failed" });
  if (!tx) return json(404, { error: "transaction_not_found" });

  const eligibleStates = ["funds_held_in_escrow", "funds_pending_release", "funds_frozen"];
  if (!eligibleStates.includes(tx.money_status)) {
    return json(409, { error: "invalid_money_status_for_refund", money_status: tx.money_status });
  }

  // 2. Resolve original successful payment (we need its provider_reference for Paystack /refund)
  const { data: payment, error: payErr } = await admin
    .from("payments")
    .select("id, provider_reference")
    .eq("transaction_id", transaction_id)
    .eq("status", "succeeded")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (payErr) return json(500, { error: "payment_fetch_failed" });
  if (!payment?.provider_reference) {
    return json(409, { error: "no_successful_payment" });
  }

  // 3. Determine refund amount
  const totalAmount = Number(tx.total_amount);
  const refundAmount = amount ?? totalAmount;
  if (refundAmount <= 0 || refundAmount > totalAmount) {
    return json(400, { error: "amount_out_of_range", total: totalAmount });
  }

  // 4. Atomic state flip + refund row creation. The helper:
  //    - blocks if a payout is already processing/completed
  //    - bridges held -> pending_release -> refund_pending
  //    - cancels any open payouts/queue rows
  //    - inserts admin_actions(refund_buyer)
  const { data: refundIdRaw, error: rpcErr } = await admin.rpc("start_refund_atomic", {
    p_transaction_id: transaction_id,
    p_amount: refundAmount,
    p_actor_user_id: ctx.userId,
    p_reason: reason,
    p_notes: notes ?? null,
  });
  if (rpcErr) {
    console.error("refund-buyer: start_refund_atomic", rpcErr);
    return json(409, { error: "state_conflict", detail: rpcErr.message });
  }
  const refundId = refundIdRaw as string;

  // 5. Call Paystack /refund. Reference is the original payment reference;
  //    Paystack returns its own refund id which we persist.
  const isPartial = refundAmount < totalAmount;
  const paystack = await createRefund({
    transaction: payment.provider_reference,
    amount: isPartial ? nairaToKobo(refundAmount) : undefined,
    customer_note: `SafeDeal refund for ${tx.transaction_code}`,
    merchant_note: notes ? `${reason} / ${notes}` : reason,
  });

  if (!paystack.ok) {
    const reasonText = paystack.message || `paystack_http_${paystack.status}`;
    try {
      await admin.rpc("fail_refund_atomic", {
        p_refund_id: refundId,
        p_reason: reasonText,
      });
    } catch (e) { console.error("refund-buyer: fail_refund_atomic", e); }
    await notifyOpsTeam(admin, {
      type: "security_alert",
      title: "Refund failed at Paystack",
      message: `Refund for ${tx.transaction_code} rejected: ${reasonText}`,
      related_transaction_id: transaction_id,
      metadata: { severity: "high", refund_id: refundId, status: paystack.status },
    });
    return json(502, { error: "paystack_refund_failed", message: reasonText });
  }

  // 6. Persist Paystack refund id as our provider_reference
  const providerRef = paystack.data?.id ? String(paystack.data.id) : null;
  await admin
    .from("refunds")
    .update({
      provider_reference: providerRef,
      initiated_at: new Date().toISOString(),
      status: "processing",
    })
    .eq("id", refundId);

  // 7. Audit event + buyer notification
  await admin.from("transaction_events").insert({
    transaction_id,
    event_type: "refund_issued",
    actor_user_id: ctx.userId,
    actor_role: "admin",
    event_data: {
      reason,
      notes: notes ?? null,
      refund_id: refundId,
      provider_reference: providerRef,
      partial: isPartial,
      amount: refundAmount,
      currency_code: tx.currency_code,
    },
  });

  await notifyUser(admin, {
    user_id: tx.buyer_id,
    type: "payment_update",
    title: "Refund on the way",
    message: `SafeDeal has initiated a refund of ${tx.currency_code} ${refundAmount.toLocaleString()} for ${tx.transaction_code}.`,
    related_transaction_id: transaction_id,
  });
  await notifyUser(admin, {
    user_id: tx.seller_id,
    type: "transaction_update",
    title: "Refund initiated",
    message: `SafeDeal has refunded the buyer for ${tx.transaction_code}.`,
    related_transaction_id: transaction_id,
  });

  return json(200, {
    ok: true,
    refund_id: refundId,
    provider_reference: providerRef,
    amount: refundAmount,
    partial: isPartial,
    status: "processing",
  });
});
