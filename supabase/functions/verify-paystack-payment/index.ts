import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { computePricing } from "../_shared/pricing.ts";
import { loadPricingConfig } from "../_shared/settings-resolver.ts";
import { emitHighValueFlagIfNeeded } from "../_shared/security-resolver.ts";
import { verifyChargeAgainstSnapshot, checkReferenceBinding } from "../_shared/payment-capture-guard.ts";
import { logEdgeError } from "../_shared/log-error.ts";

function koboToNairaSafe(kobo: unknown): number {
  const n = Number(kobo);
  return Number.isFinite(n) ? Math.round(n) / 100 : 0;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-correlation-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Shared verification logic used by both the frontend callback and webhook.
 * Idempotent: safe to call multiple times for the same reference.
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

  // 2. Find our payment record. SOURCE OF TRUTH is the reference Paystack
  //    actually verified (psData.reference). Any client-supplied
  //    provider_reference is advisory only and must resolve to the SAME
  //    payment row, otherwise a caller could verify a cheap charge while
  //    pointing the DB lookup at an expensive payment.
  const verifiedRef = String(psData.reference || paystackReference);
  const { data: payment, error: payErr } = await supabase
    .from("payments")
    .select("id, transaction_id, status, user_id, amount, currency_code")
    .eq("provider_reference", verifiedRef)
    .maybeSingle();

  if (payErr) throw payErr;
  if (!payment) return { success: false, error: "Payment record not found for this reference" };

  if (ourReference && ourReference !== verifiedRef) {
    const { data: advisoryPayment } = await supabase
      .from("payments")
      .select("id")
      .eq("provider_reference", ourReference)
      .maybeSingle();
    const bound = checkReferenceBinding(
      payment.id as string,
      (advisoryPayment?.id as string) ?? "__unresolved__",
    );
    if (!bound.ok) {
      return { success: false, error: "reference_mismatch" };
    }
  }

  // 3. Idempotency: already processed
  if (payment.status === "succeeded") {
    return { success: true, alreadyProcessed: true };
  }

  // 3b. A superseded payment must never complete. initiate-paystack-payment
  //     marks older pending rows "failed" ("Superseded by retry") before it
  //     issues a fresh charge, but nothing here refused them: a buyer who
  //     kept the older, cheaper Paystack link open could finish that charge
  //     and this function would have marked the transaction paid at the old
  //     price, because the only guards were payment.status === "succeeded"
  //     above and the transaction's money_status, which a retry resets to
  //     payment_pending.
  if (payment.status !== "pending") {
    return { success: false, error: `Payment is ${payment.status}, not payable` };
  }

  const txId = payment.transaction_id;

  // 4. Check Paystack status
  if (psData.status !== "success") {
    // Payment failed: revert
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

  // 4b. The amount Paystack actually collected must equal the amount this
  //     payment row was initiated for. Until this check, "status: success"
  //     alone marked the transaction paid: correct only for as long as every
  //     reference's charge amount stayed exactly what initiate set, which is
  //     an assumption about Paystack's behaviour and our own retry logic,
  //     not something this function verified. Paystack reports kobo; the row
  //     stores naira. Half a kobo of float tolerance, no more.
  const paidAmount = koboToNairaSafe(psData.amount);
  const expectedAmount = Number(payment.amount);
  const paidCurrency = String(psData.currency || "").toUpperCase();
  const expectedCurrency = String(payment.currency_code || "").toUpperCase();
  if (
    !Number.isFinite(expectedAmount) ||
    Math.abs(paidAmount - expectedAmount) > 0.005 ||
    (expectedCurrency !== "" && paidCurrency !== expectedCurrency)
  ) {
    // Deliberately NOT marked failed: the charge really happened, and a
    // mismatch is an operator problem to reconcile, not a state to erase.
    await supabase.from("payments").update({ raw_payload: psData }).eq("id", payment.id);
    console.error(
      `verify-paystack-payment: amount mismatch for ${verifiedRef}: paid ${paidAmount} ${paidCurrency}, expected ${expectedAmount} ${expectedCurrency}`,
    );
    return { success: false, error: "amount_mismatch" };
  }

  // 5. Payment succeeded. Fetch transaction and pricing
  const [txRes, pricingRes] = await Promise.all([
    supabase
      .from("transactions")
      .select("id, transaction_code, status, money_status, buyer_id, seller_id")
      .eq("id", txId)
      .single(),
    supabase
      .from("transaction_pricing")
      .select("currency_code, item_amount, platform_fee_amount, payment_processing_fee_amount, buyer_total_amount, seller_payout_amount")
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

  // SNAPSHOT-FIRST: display the immutable transaction_pricing row that was
  // locked at checkout time. Only recompute (for display only. Never for
  // what is charged) when no snapshot row exists at all.
  const pricingSnapshot = pricingRes.data;
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  let pricing: {
    currency_code: string;
    item_amount: number;
    paystack_fee_amount: number;
    platform_fee_amount: number;
    service_fee_amount: number;
    /**
     * `transaction_pricing` has no rate column, so the rate is DERIVED from the
     * charged fees the same way `resolve-share-token` derives it: service fee ÷
     * item amount, null when the item amount is 0 or either fee is missing.
     * It must be persisted explicitly. The payment screen treats it as
     * load-bearing evidence of what the buyer was actually charged.
     */
    service_fee_rate: number | null;
    total_amount: number;
    seller_payout_amount: number | null;
  } | null = null;

  if (pricingSnapshot) {
    const rawProcessingFee = num(pricingSnapshot.payment_processing_fee_amount);
    const rawPlatformFee = num(pricingSnapshot.platform_fee_amount);
    const processingFee = rawProcessingFee ?? 0;
    const platformFee = rawPlatformFee ?? 0;
    const itemAmount = Number(pricingSnapshot.item_amount) || 0;
    const derivedRate =
      rawProcessingFee !== null && rawPlatformFee !== null && itemAmount > 0
        ? (rawProcessingFee + rawPlatformFee) / itemAmount
        : null;
    pricing = {
      currency_code: pricingSnapshot.currency_code || "NGN",
      item_amount: itemAmount,
      paystack_fee_amount: processingFee,
      platform_fee_amount: platformFee,
      service_fee_amount: processingFee + platformFee,
      service_fee_rate: derivedRate,
      total_amount: num(pricingSnapshot.buyer_total_amount) ?? itemAmount + processingFee + platformFee,
      seller_payout_amount: num(pricingSnapshot.seller_payout_amount),
    };
  } else {
    // FALLBACK: no transaction_pricing snapshot row exists (should not happen
    // post-checkout). Recompute using the seller's vendor config for display
    // only: the actual charge already happened via Paystack.
    const fallback = computePricing(
      koboToNairaSafe(psData.amount),
      psData.currency || "NGN",
      "local",
      await loadPricingConfig(tx.seller_id),
    );
    pricing = {
      currency_code: fallback.currency_code,
      item_amount: fallback.item_amount,
      paystack_fee_amount: fallback.paystack_fee_amount,
      platform_fee_amount: fallback.platform_fee_amount,
      service_fee_amount: fallback.service_fee_amount,
      service_fee_rate: fallback.service_fee_rate,
      total_amount: fallback.total_amount,
      seller_payout_amount: null,
    };
  }

  if (!pricing) {
    return { success: false, error: "Transaction pricing not found" };
  }

  const now = new Date().toISOString();

  // 5b. AUTHORITATIVE amount + currency check against the locked snapshot.
  //     Never book escrow for a charge that does not match what was agreed.
  if (pricingSnapshot) {
    const guard = verifyChargeAgainstSnapshot(psData, pricingSnapshot);
    if (!guard.ok) {
      await supabase
        .from("payments")
        .update({
          status: "failed",
          failed_at: now,
          failure_reason: "amount_mismatch",
          raw_payload: psData,
        })
        .eq("id", payment.id);
      console.error("amount_mismatch on capture", {
        payment_id: payment.id,
        transaction_id: txId,
        reason: guard.reason,
        expectedKobo: guard.expectedKobo,
        chargedKobo: guard.chargedKobo,
        expectedCurrency: guard.expectedCurrency,
        chargedCurrency: guard.chargedCurrency,
      });
      return { success: false, error: "amount_mismatch" };
    }
  } else {
    console.warn(
      `verify-paystack-payment: no pricing snapshot for transaction ${txId}: strict amount/currency check skipped (legacy fallback path)`,
    );
  }

  // 6. Atomic updates. All must succeed
  // 6a–6d. Payment capture is recorded through the single guarded routine:
  // payment row, transaction/escrow state and the four authoritative ledger
  // entries are written all-or-nothing, keyed on the Paystack event id so a
  // retry can never produce a second set of money movements.
  const providerEventId = String(psData.id ?? psData.reference ?? paystackReference);
  const { error: captureErr } = await supabase.rpc("record_payment_capture_atomic", {
    p_payment_id: payment.id,
    p_provider_event_id: providerEventId,
    p_raw_payload: psData,
  });

  if (captureErr) {
    console.error("record_payment_capture_atomic failed:", captureErr);
    throw new Error(captureErr.message || "payment_capture_failed");
  }

  // High-value flag emission (idempotent per transaction)
  await emitHighValueFlagIfNeeded({
    transactionId: txId,
    buyerId: tx.buyer_id,
    sellerId: tx.seller_id,
    vendorId: tx.seller_id,
    amount: pricing.total_amount,
    currencyCode: pricing.currency_code,
  });

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

  // 6g.1. Convert reserved stock → sold (idempotent)
  // Decrement BOTH stock_quantity and reserved_quantity by purchased qty.
  await convertReservedToSold(supabase, txId);

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
    title: "Payment Received: Begin Fulfillment",
    message: `The buyer has completed payment of ${pricing.currency_code} ${pricing.total_amount.toLocaleString()}. The agreement is now locked. Please begin preparing the item for delivery.`,
    related_transaction_id: txId,
    status: "pending",
  });

  return { success: true };
}

/**
 * After payment succeeds, decrement stock_quantity and reserved_quantity for
 * each transaction_item's source product. Idempotent: skips if a 'sold' log
 * already exists for this transaction.
 */
async function convertReservedToSold(
  supabase: ReturnType<typeof createClient>,
  txId: string
) {
  // Resolve authoritative per-product paid quantities.
  //
  // Priority:
  //   1. checkout_session_items rows linked to this tx (covers cart + storefront flows)
  //   2. fallback to (tx.source_product_id + sum of transaction_items.quantity)
  //      for legacy/private-offer transactions without a checkout session row.
  const perProduct = new Map<string, number>();

  const { data: csItems } = await supabase
    .from("checkout_session_items")
    .select("product_id, quantity")
    .eq("transaction_id", txId);

  if (csItems && csItems.length > 0) {
    for (const row of csItems) {
      if (!row.product_id) continue;
      perProduct.set(
        row.product_id,
        (perProduct.get(row.product_id) || 0) + (Number(row.quantity) || 0),
      );
    }
  } else {
    const { data: tx } = await supabase
      .from("transactions")
      .select("id, source_product_id")
      .eq("id", txId)
      .maybeSingle();
    if (!tx?.source_product_id) return;

    const { data: items } = await supabase
      .from("transaction_items")
      .select("quantity")
      .eq("transaction_id", txId);
    const totalQty = (items || []).reduce(
      (s: number, i: any) => s + (Number(i.quantity) || 0),
      0,
    );
    if (totalQty > 0) perProduct.set(tx.source_product_id, totalQty);
  }

  for (const [productId, qty] of perProduct) {
    if (qty <= 0) continue;

    // Idempotency check per product
    const { data: existingSoldLog } = await supabase
      .from("product_inventory_logs")
      .select("id, quantity_delta")
      .eq("product_id", productId)
      .eq("change_type", "sold")
      .eq("reference_type", "transaction")
      .eq("reference_id", txId)
      .maybeSingle();

    if (existingSoldLog) {
      const alreadySold = Math.abs(Number(existingSoldLog.quantity_delta) || 0);
      if (alreadySold >= qty) continue;

      // Top-up: convert the remaining qty (handles older partial conversions
      // where qty changed after the first sold log was written)
      const remaining = qty - alreadySold;
      const { data: product } = await supabase
        .from("products")
        .select("stock_quantity, reserved_quantity")
        .eq("id", productId)
        .single();
      if (!product) continue;
      const newStock = Math.max(0, product.stock_quantity - remaining);
      const newReserved = Math.max(0, product.reserved_quantity - remaining);
      await supabase
        .from("products")
        .update({ stock_quantity: newStock, reserved_quantity: newReserved })
        .eq("id", productId);
      await supabase.from("product_inventory_logs").insert({
        product_id: productId,
        change_type: "sold",
        quantity_delta: -remaining,
        balance_after: newStock - newReserved,
        reference_type: "transaction",
        reference_id: txId,
        notes: `Reserved stock top-up sold after qty reconciliation (+${remaining})`,
      });
      continue;
    }

    const { data: product } = await supabase
      .from("products")
      .select("stock_quantity, reserved_quantity")
      .eq("id", productId)
      .single();
    if (!product) continue;

    const newStock = Math.max(0, product.stock_quantity - qty);
    const newReserved = Math.max(0, product.reserved_quantity - qty);

    await supabase
      .from("products")
      .update({ stock_quantity: newStock, reserved_quantity: newReserved })
      .eq("id", productId);

    await supabase.from("product_inventory_logs").insert({
      product_id: productId,
      change_type: "sold",
      quantity_delta: -qty,
      balance_after: newStock - newReserved,
      reference_type: "transaction",
      reference_id: txId,
      notes: "Reserved stock converted to sold after payment confirmed",
    });
  }
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

    // 3. Process verification. Reference is Paystack's, provider_reference is ours (for DB lookup)
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
    // Logged under the id the browser sent, so the buyer's symptom and this
    // stack are one query apart. Not awaited: the caller is already failing
    // and must not also wait on the record of it.
    void logEdgeError(null, {
      function_name: "verify-paystack-payment",
      message: err,
      req,
      http_status: 500,
      severity: "fatal",
      request_context: { stage: "verify" },
    });
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
