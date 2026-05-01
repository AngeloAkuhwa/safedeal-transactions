import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { z } from "https://esm.sh/zod@3.23.8";
import { requireAdmin, authErrorResponse, AuthError } from "../_shared/auth.ts";
import { createTransfer } from "../_shared/paystack.ts";
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
  payout_id: z.string().uuid().optional(),
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
  try {
    ctx = await requireAdmin(req);
  } catch (err) {
    const r = authErrorResponse(err, corsHeaders);
    if (r) return r;
    console.error("release-funds auth error", err);
    return json(500, { error: "auth_failed" });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return json(400, { error: "invalid_body", issues: parsed.error.flatten().fieldErrors });
  }
  const { transaction_id, payout_id, notes } = parsed.data;

  const admin = ctx.adminClient;

  // 3. Load transaction
  const { data: tx, error: txErr } = await admin
    .from("transactions")
    .select("id, money_status, seller_id, currency_code, transaction_code")
    .eq("id", transaction_id)
    .maybeSingle();
  if (txErr) {
    console.error("release-funds: tx fetch", txErr);
    return json(500, { error: "tx_fetch_failed" });
  }
  if (!tx) return json(404, { error: "transaction_not_found" });
  if (tx.money_status !== "funds_pending_release") {
    return json(409, { error: "not_in_pending_release", money_status: tx.money_status });
  }

  // 4. Resolve payout
  let payout: {
    id: string;
    transaction_id: string;
    seller_id: string;
    amount: number;
    currency_code: string;
    status: string;
    release_blocked: boolean;
    payout_blocked_reason: string | null;
  } | null = null;

  if (payout_id) {
    const { data, error } = await admin
      .from("payouts")
      .select("id, transaction_id, seller_id, amount, currency_code, status, release_blocked, payout_blocked_reason")
      .eq("id", payout_id)
      .maybeSingle();
    if (error) return json(500, { error: "payout_fetch_failed" });
    if (!data || data.transaction_id !== transaction_id) {
      return json(409, { error: "payout_not_for_transaction" });
    }
    payout = data as typeof payout;
  } else {
    const { data, error } = await admin
      .from("payouts")
      .select("id, transaction_id, seller_id, amount, currency_code, status, release_blocked, payout_blocked_reason")
      .eq("transaction_id", transaction_id)
      .eq("status", "awaiting_release");
    if (error) return json(500, { error: "payout_fetch_failed" });
    if (!data || data.length === 0) return json(409, { error: "no_awaiting_payout" });
    if (data.length > 1) return json(409, { error: "ambiguous_payout", count: data.length });
    payout = data[0] as typeof payout;
  }

  if (!payout) return json(409, { error: "no_awaiting_payout" });
  if (payout.status !== "awaiting_release") {
    return json(409, { error: "payout_not_awaiting", status: payout.status });
  }
  if (payout.release_blocked) {
    return json(409, { error: "payout_blocked", reason: payout.payout_blocked_reason });
  }

  // 5. Resolve seller payout account & verified Paystack recipient
  const { data: account, error: acctErr } = await admin
    .from("payout_accounts")
    .select("id, provider_recipient_code, verification_status")
    .eq("user_id", tx.seller_id)
    .maybeSingle();
  if (acctErr) return json(500, { error: "account_fetch_failed" });

  const recipientCode = account?.provider_recipient_code;
  if (!recipientCode || account?.verification_status !== "verified") {
    // Push back into the queue with a clear reason for the future admin UI
    try {
      await admin.rpc("flag_for_release_review", {
        p_transaction_id: transaction_id,
        p_reason: "missing_recipient",
        p_actor_user_id: ctx.userId,
        p_notes: "Seller payout account is not verified or missing Paystack recipient.",
      });
    } catch (e) {
      console.error("release-funds: flag_for_release_review failed", e);
    }
    return json(409, { error: "recipient_missing" });
  }

  // 6. Atomic state flip
  const { error: rpcErr } = await admin.rpc("release_payout_atomic", {
    p_transaction_id: transaction_id,
    p_payout_id: payout.id,
    p_actor_user_id: ctx.userId,
    p_notes: notes ?? null,
  });
  if (rpcErr) {
    console.error("release-funds: release_payout_atomic failed", rpcErr);
    const msg = rpcErr.message || "rpc_failed";
    return json(409, { error: "state_conflict", detail: msg });
  }

  // 7-8. Build deterministic reference and call Paystack
  const reference = `payout_${payout.id}`;
  const amountKobo = nairaToKobo(Number(payout.amount));
  const transferReason = `SafeDeal release for ${tx.transaction_code}`;

  let transfer;
  try {
    transfer = await createTransfer({
      source: "balance",
      amount: amountKobo,
      recipient: recipientCode,
      reason: transferReason,
      reference,
    });
  } catch (e) {
    transfer = { ok: false, status: 0, message: String(e), raw: null } as const;
  }

  if (!transfer.ok) {
    const reason = transfer.message || `paystack_http_${transfer.status}`;
    // 10. Roll the state back via fail_payout_atomic
    const { data: maxRetriesSetting } = await admin
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", "payout_max_retry_attempts")
      .maybeSingle();
    const maxRetries = Number(maxRetriesSetting?.setting_value ?? 3);
    try {
      await admin.rpc("fail_payout_atomic", {
        p_payout_id: payout.id,
        p_reason: reason,
        p_max_retries: maxRetries,
      });
    } catch (e) {
      console.error("release-funds: fail_payout_atomic failed", e);
    }
    await notifyOpsTeam(admin, {
      type: "security_alert",
      title: "Release failed at Paystack",
      message: `Transfer for ${tx.transaction_code} rejected: ${reason}`,
      related_transaction_id: transaction_id,
      metadata: { severity: "high", payout_id: payout.id, reference, status: transfer.status },
    });
    return json(502, { error: "paystack_transfer_failed", message: reason });
  }

  // 9. Persist provider response on the payout (audit only)
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
    .eq("id", payout.id);

  // 11. Emit transaction event + seller notification
  await admin.from("transaction_events").insert({
    transaction_id,
    event_type: "payout_released",
    actor_user_id: ctx.userId,
    description: `SafeDeal initiated payout transfer of ${tx.currency_code} ${Number(payout.amount).toLocaleString()}`,
    metadata: { payout_id: payout.id, reference, transfer_code: transferCode, status: providerStatus },
  });

  await notifyUser(admin, {
    user_id: tx.seller_id,
    type: "payment_update",
    title: "Releasing your funds",
    message: `SafeDeal has approved your payout for ${tx.transaction_code}. The transfer is on the way to your bank.`,
    related_transaction_id: transaction_id,
  });

  return json(200, {
    ok: true,
    payout_id: payout.id,
    transfer_reference: reference,
    transfer_code: transferCode,
    status: providerStatus,
  });
});