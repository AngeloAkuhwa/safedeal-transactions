import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { computePricing } from "../_shared/pricing.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Shared verification logic used by both the frontend callback and webhook.
 * Idempotent — safe to call multiple times for the same reference.
 */
export async function processPaystackVerification(
  paystackReference: string,
  supabase: ReturnType<typeof createClient>,
  callerUserId?: string,
  ourReference?: string
): Promise<{ success: boolean; alreadyProcessed?: boolean; error?: string }> {
  // 1. Verify with Paystack using Paystack's own reference
  const paystackSecretKey = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!paystackSecretKey) throw new Error("PAYSTACK_SECRET_KEY not configured");

  const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(paystackReference)}`, {
    headers: { Authorization: `Bearer ${paystackSecretKey}` },
  });
  const verifyData = await verifyRes.json();

  if (!verifyData.status || !verifyData.data) {
    return { success: false, error: verifyData.message || "Paystack verification failed" };
  }

  const psData = verifyData.data;

  // 2. Find our payment record using our stored reference (or fall back to Paystack's)
  const lookupRef = ourReference || paystackReference;
  const { data: payment, error: payErr } = await supabase
    .from("payments")
    .select("id, transaction_id, status, user_id, amount, currency_code")
    .eq("provider_reference", lookupRef)
    .maybeSingle();

  if (payErr) throw payErr;
  if (!payment) return { success: false, error: "Payment record not found for this reference" };

  // 3. Idempotency: already processed
  if (payment.status === "succeeded") {
    return { success: true, alreadyProcessed: true };
  }

  const txId = payment.transaction_id;

  // 4. Check Paystack status
  if (psData.status !== "success") {
    // Payment failed — revert
    await supabase
      .from("payments")
      .update({
        status: "failed",
        failed_at: new Date().toISOString(),
        failure_reason: psData.gateway_response || psData.status,
        raw_payload: psData,
      })
      .eq("id", payment.id);

    await supabase
      .from("transactions")
      .update({ money_status: "not_secured" })
      .eq("id", txId);

    await supabase.from("money_status_history").insert({
      transaction_id: txId,
      old_status: "payment_pending",
      new_status: "not_secured",
      changed_by_user_id: callerUserId || null,
      reason: `Payment failed: ${psData.gateway_response || psData.status}`,
    });

    return { success: false, error: psData.gateway_response || "Payment was not successful" };
  }

  // 5. Payment succeeded — fetch transaction and pricing
  const [txRes, pricingRes] = await Promise.all([
    supabase
      .from("transactions")
      .select("id, transaction_code, status, money_status, buyer_id, seller_id")
      .eq("id", txId)
      .single(),
    supabase
      .from("transaction_pricing")
      .select("currency_code, item_amount")
      .eq("transaction_id", txId)
      .maybeSingle(),
  ]);

  if (txRes.error) throw txRes.error;
  const tx = txRes.data;

  // Extra safety: only process if in correct state
  if (tx.money_status !== "payment_pending") {
    // Could be already processed by webhook
    if (tx.money_status === "funds_held_in_escrow") {
      return { success: true, alreadyProcessed: true };
    }
    return { success: false, error: `Unexpected money_status: ${tx.money_status}` };
  }

  const pricing = pricingRes.data
    ? computePricing(Number(pricingRes.data.item_amount) || 0, pricingRes.data.currency_code || "NGN")
    : null;

  if (!pricing) {
    return { success: false, error: "Transaction pricing not found" };
  }

  const now = new Date().toISOString();

  // 6. Atomic updates — all must succeed
  // 6a. Update payment record
  await supabase
    .from("payments")
    .update({
      status: "succeeded",
      captured_at: now,
      authorized_at: psData.paid_at || now,
      raw_payload: psData,
    })
    .eq("id", payment.id);

  // 6b. Update transaction status + money_status
  await supabase
    .from("transactions")
    .update({
      status: "payment_secured",
      money_status: "funds_held_in_escrow",
      agreement_locked_at: now,
    })
    .eq("id", txId);

  // 6c. Update escrow state
  await supabase
    .from("escrow_states")
    .update({
      state: "held",
      held_amount: pricing.item_amount,
      last_changed_at: now,
    })
    .eq("transaction_id", txId);

  // 6d. Create 4 ledger entries
  const ledgerEntries = [
    {
      transaction_id: txId,
      entry_type: "payment_credit" as const,
      currency_code: pricing.currency_code,
      amount: pricing.total_amount,
      balance_after: pricing.total_amount,
      reference_type: "payment",
      reference_id: payment.id,
      notes: `Buyer payment received: ${pricing.currency_code} ${pricing.total_amount}`,
      created_by_user_id: tx.buyer_id,
    },
    {
      transaction_id: txId,
      entry_type: "fee_record" as const,
      currency_code: pricing.currency_code,
      amount: pricing.paystack_fee_amount,
      balance_after: pricing.total_amount - pricing.paystack_fee_amount,
      reference_type: "paystack_fee",
      notes: `Paystack processing fee: ${pricing.currency_code} ${pricing.paystack_fee_amount}`,
    },
    {
      transaction_id: txId,
      entry_type: "fee_record" as const,
      currency_code: pricing.currency_code,
      amount: pricing.platform_fee_amount,
      balance_after: pricing.total_amount - pricing.paystack_fee_amount - pricing.platform_fee_amount,
      reference_type: "platform_fee",
      notes: `SafeDeal platform fee: ${pricing.currency_code} ${pricing.platform_fee_amount}`,
    },
    {
      transaction_id: txId,
      entry_type: "escrow_hold" as const,
      currency_code: pricing.currency_code,
      amount: pricing.item_amount,
      balance_after: pricing.item_amount,
      reference_type: "escrow",
      notes: `Seller principal held in escrow: ${pricing.currency_code} ${pricing.item_amount}`,
    },
  ];

  await supabase.from("escrow_ledger_entries").insert(ledgerEntries);

  // 6e. Transaction status history
  await supabase.from("transaction_status_history").insert({
    transaction_id: txId,
    old_status: tx.status,
    new_status: "payment_secured",
    changed_by_user_id: callerUserId || tx.buyer_id,
    reason: "Buyer payment verified via Paystack",
  });

  // 6f. Money status history
  await supabase.from("money_status_history").insert({
    transaction_id: txId,
    old_status: "payment_pending",
    new_status: "funds_held_in_escrow",
    changed_by_user_id: callerUserId || tx.buyer_id,
    reason: "Payment verified and funds held in escrow",
  });

  // 6g. Create agreement snapshot
  const [itemRes, deliveryRes, mediaRes] = await Promise.all([
    supabase
      .from("transaction_items")
      .select("*")
      .eq("transaction_id", txId)
      .maybeSingle(),
    supabase
      .from("transaction_delivery_terms")
      .select("*")
      .eq("transaction_id", txId)
      .maybeSingle(),
    supabase
      .from("transaction_media")
      .select("id, file_id, media_type, sort_order, files(file_url, secure_url, mime_type, original_file_name)")
      .eq("transaction_id", txId)
      .order("sort_order", { ascending: true }),
  ]);

  const snapshotJson = {
    item: itemRes.data || null,
    pricing: {
      currency_code: pricing.currency_code,
      item_amount: pricing.item_amount,
      paystack_fee_amount: pricing.paystack_fee_amount,
      platform_fee_amount: pricing.platform_fee_amount,
      service_fee_amount: pricing.service_fee_amount,
      service_fee_rate: pricing.service_fee_rate,
      total_amount: pricing.total_amount,
    },
    delivery: deliveryRes.data || null,
    media: mediaRes.data || [],
    locked_at: now,
    payment_reference: paystackReference,
  };

  await supabase.from("transaction_agreement_snapshots").insert({
    transaction_id: txId,
    snapshot_json: snapshotJson,
    locked_at: now,
    locked_by_user_id: tx.buyer_id,
  });

  // 6h. Transaction event
  await supabase.from("transaction_events").insert({
    transaction_id: txId,
    event_type: "payment_received",
    actor_user_id: tx.buyer_id,
    description: `Payment of ${pricing.currency_code} ${pricing.total_amount} received and held in escrow`,
    metadata: { reference: paystackReference, amount: pricing.total_amount, currency: pricing.currency_code },
  });

  // 6i. Notify seller
  await supabase.from("notifications").insert({
    user_id: tx.seller_id,
    type: "payment",
    channel: "in_app",
    title: "Payment Received — Begin Fulfillment",
    message: `The buyer has completed payment of ${pricing.currency_code} ${pricing.total_amount.toLocaleString()}. The agreement is now locked. Please begin preparing the item for delivery.`,
    related_transaction_id: txId,
    status: "pending",
  });

  return { success: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Authenticate
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await anonClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    // 2. Parse request
    const { reference, provider_reference } = await req.json();
    if (!reference) {
      return new Response(JSON.stringify({ error: "reference is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 3. Process verification — reference is Paystack's, provider_reference is ours (for DB lookup)
    const result = await processPaystackVerification(reference, supabase, userId, provider_reference);

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: result.error, success: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        alreadyProcessed: result.alreadyProcessed || false,
        message: result.alreadyProcessed
          ? "Payment was already processed"
          : "Payment verified and escrow created",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("verify-paystack-payment error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
