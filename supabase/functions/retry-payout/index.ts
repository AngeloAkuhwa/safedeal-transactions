import { z } from "https://esm.sh/zod@3.23.8";
import { requirePermission, authErrorResponse } from "../_shared/auth.ts";
import { enforceAdminRateLimit } from "../_shared/rate-limit.ts";
import { createTransfer } from "../_shared/paystack.ts";
import { nairaToKobo } from "../_shared/money.ts";
import { notifyUser, notifyOpsTeam } from "../_shared/notify.ts";
import { formatMoney, PRICING_LINE_LABELS } from "../_shared/money-copy.ts";
import { assertPayoutEligible } from "../_shared/payout-eligibility.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BodySchema = z.object({
  payout_id: z.string().uuid(),
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

  let ctx;
  try {
    ctx = await requirePermission(req, "payouts.release");
  } catch (err) {
    const r = authErrorResponse(err, corsHeaders);
    if (r) return r;
    console.error("retry-payout auth error", err);
    return json(500, { error: "auth_failed" });
  }

  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const rl = await enforceAdminRateLimit(ctx, "retry_payout", 30, corsHeaders);
  if (rl) return rl;

  let raw: unknown;
  try { raw = await req.json(); } catch { return json(400, { error: "invalid_json" }); }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return json(400, { error: "invalid_body", issues: parsed.error.flatten().fieldErrors });
  }
  const { payout_id, notes } = parsed.data;
  const admin = ctx.adminClient;

  const { data: payout, error: pErr } = await admin
    .from("payouts")
    .select("id, transaction_id, seller_id, amount, currency_code, status, retry_allowed, failed_attempt_count")
    .eq("id", payout_id)
    .maybeSingle();
  if (pErr) return json(500, { error: "payout_fetch_failed" });
  if (!payout) return json(404, { error: "payout_not_found" });
  if (payout.status !== "failed") return json(409, { error: "payout_not_failed", status: payout.status });
  if (!payout.retry_allowed) return json(409, { error: "retry_exhausted" });
  // Money never falls back to zero: `Number(null)` is 0, which would send a
  // ₦0 Paystack transfer and tell the seller we are retrying "₦0.00".
  const payoutAmount =
    payout.amount != null && Number.isFinite(Number(payout.amount)) ? Number(payout.amount) : null;
  if (payoutAmount === null || payoutAmount <= 0) {
    return json(409, { error: "payout_amount_missing", payout_id: payout.id });
  }

  const { data: tx, error: tErr } = await admin
    .from("transactions")
    .select("id, money_status, currency_code, transaction_code, seller_id")
    .eq("id", payout.transaction_id)
    .maybeSingle();
  if (tErr) return json(500, { error: "tx_fetch_failed" });
  if (!tx) return json(404, { error: "transaction_not_found" });
  if (tx.money_status !== "funds_pending_release") {
    return json(409, { error: "tx_not_in_pending_release", money_status: tx.money_status });
  }

  const eligibility = await assertPayoutEligible(admin, tx.seller_id);
  if (!eligibility.ok) {
    const state = eligibility.accountState ?? "no_account";
    return json(409, {
      error: state === "verified_no_recipient"
        ? "payout_account_recipient_missing"
        : state === "unverified"
          ? "payout_account_unverified"
          : "payout_account_missing",
      account_state: state,
    });
  }
  const recipientCode = eligibility.recipientCode;

  // Re-arm: failed -> awaiting_release (audited).
  const { error: armErr } = await admin.rpc("retry_payout_atomic", {
    p_payout_id: payout.id,
    p_actor_user_id: ctx.userId,
    p_notes: notes ?? null,
  });
  if (armErr) {
    console.error("retry-payout: retry_payout_atomic", armErr);
    return json(409, { error: "state_conflict", detail: armErr.message });
  }

  // Flip awaiting_release -> pending + tx -> funds_releasing (same atomic helper as release-funds).
  const { error: relErr } = await admin.rpc("release_payout_atomic", {
    p_transaction_id: tx.id,
    p_payout_id: payout.id,
    p_actor_user_id: ctx.userId,
    p_notes: notes ?? "retry",
  });
  if (relErr) {
    console.error("retry-payout: release_payout_atomic", relErr);
    return json(409, { error: "state_conflict", detail: relErr.message });
  }

  const attempt = (payout.failed_attempt_count ?? 0) + 1;
  // Paystack rejects duplicate references — suffix retries so each attempt is unique.
  const reference = `payout_${payout.id}_r${attempt}`;
  const amountKobo = nairaToKobo(payoutAmount);

  let transfer;
  try {
    transfer = await createTransfer({
      source: "balance",
      amount: amountKobo,
      recipient: recipientCode,
      reason: `SafeDeal retry ${attempt} for ${tx.transaction_code}`,
      reference,
    });
  } catch (e) {
    transfer = { ok: false, status: 0, message: String(e), raw: null } as const;
  }

  if (!transfer.ok) {
    const reason = transfer.message || `paystack_http_${transfer.status}`;
    const { data: maxRetriesSetting } = await admin
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", "payout_max_retry_attempts")
      .maybeSingle();
    // Fail closed: with no configured ceiling we do not invent one — zero
    // further retries are allowed until an operator sets the setting.
    const rawMaxRetries = maxRetriesSetting?.setting_value;
    const maxRetries =
      rawMaxRetries != null && Number.isFinite(Number(rawMaxRetries)) ? Number(rawMaxRetries) : 0;
    try {
      await admin.rpc("fail_payout_atomic", {
        p_payout_id: payout.id,
        p_reason: reason,
        p_max_retries: maxRetries,
      });
    } catch (e) { console.error("retry-payout: fail_payout_atomic", e); }
    await notifyOpsTeam(admin, {
      type: "security_alert",
      title: "Payout retry failed",
      message: `Retry ${attempt} for ${tx.transaction_code} failed: ${reason}`,
      related_transaction_id: tx.id,
      metadata: { severity: "high", payout_id: payout.id, attempt, reference, status: transfer.status },
    });
    return json(502, { error: "paystack_transfer_failed", message: reason, attempt });
  }

  const transferCode = transfer.data?.transfer_code ?? null;
  const providerStatus = transfer.data?.status ?? "pending";
  const noteAppendix = `[paystack:${providerStatus}${transferCode ? ` ${transferCode}` : ""} retry#${attempt}]`;
  await admin.from("payouts").update({
    provider_reference: reference,
    initiated_at: new Date().toISOString(),
    notes: notes ? `${notes} ${noteAppendix}` : noteAppendix,
  }).eq("id", payout.id);

  await admin.from("transaction_events").insert({
    transaction_id: tx.id,
    event_type: "payout_released",
    actor_user_id: ctx.userId,
    actor_role: "admin",
    event_data: {
      description: `SafeDeal retry ${attempt} initiated ${PRICING_LINE_LABELS.seller_payout_amount} of ${formatMoney(
      payoutAmount,
        tx.currency_code,
      )}`,
      payout_id: payout.id,
      reference,
      transfer_code: transferCode,
      status: providerStatus,
      attempt,
    },
  });

  await notifyUser(admin, {
    user_id: tx.seller_id,
    type: "payment_update",
    title: "Retrying your payout",
    message: `SafeDeal is retrying the bank transfer of ${formatMoney(
      payoutAmount,
      tx.currency_code,
    )} (${PRICING_LINE_LABELS.seller_payout_amount}) for ${tx.transaction_code}.`,
    related_transaction_id: tx.id,
  });

  return json(200, {
    ok: true,
    payout_id: payout.id,
    transfer_reference: reference,
    transfer_code: transferCode,
    status: providerStatus,
    attempt,
  });
});
