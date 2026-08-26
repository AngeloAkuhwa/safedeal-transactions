import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { computePricing } from "../_shared/pricing.ts";
import { buildPricingSnapshot, MAX_TOTAL_SERVICE_FEE_FALLBACK } from "../_shared/safedeal-money-policy.ts";
import { loadPricingConfig } from "../_shared/settings-resolver.ts";
import { resolveInitiationCharge } from "../_shared/payment-capture-guard.ts";
import { logEdgeError } from "../_shared/log-error.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-correlation-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonErr(msg: string, status: number) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Tiered limits (must match buyer-profile) ──
const LIMIT_BY_LEVEL: Record<string, number> = {
  unverified: 0,
  basic_verified: 50_000,
  trusted_buyer: 200_000,
  high_trust_buyer: 500_000,
};

const CONCURRENT_BY_LEVEL: Record<string, number> = {
  unverified: 0,
  basic_verified: 5,
  trusted_buyer: 10,
  high_trust_buyer: 20,
};

const ACTIVE_TX_STATUSES = [
  "payment_secured",
  "seller_preparing_delivery",
  "seller_dispatched",
  "delivered_awaiting_verification",
  "disputed",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Authenticate buyer
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonErr("Unauthorized", 401);
    }

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await anonClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return jsonErr("Unauthorized", 401);
    }
    const userId = claimsData.claims.sub as string;
    let userEmail = claimsData.claims.email as string;

    // 2. Verification + tiered limit gates
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const [verifRes, profRes] = await Promise.all([
      supabaseAdmin
        .from("account_verifications")
        .select("phone_verified, verification_level")
        .eq("user_id", userId)
        .single(),
      supabaseAdmin
        .from("profiles")
        .select("state_name, city_name, is_region_eligible")
        .eq("id", userId)
        .single(),
    ]);

    const verif = verifRes.data;
    const prof = profRes.data;

    const phoneVerified = !!verif?.phone_verified;
    const locationComplete = !!(prof?.state_name && prof?.city_name);
    const level = (verif?.verification_level as string) || "unverified";
    const levelPermits = level !== "unverified";

    // Gate 1: Base verification
    if (!phoneVerified || !locationComplete || !levelPermits) {
      const missing: string[] = [];
      if (!phoneVerified) missing.push("phone verification");
      if (!locationComplete) missing.push("location (state and LGA)");
      if (!levelPermits) missing.push("account activation");
      return jsonErr(
        `Complete the following before making payments: ${missing.join(", ")}. Go to Profile Settings to continue.`,
        403,
      );
    }

    // Gate 2: Region eligibility
    if (!prof?.is_region_eligible) {
      return jsonErr(
        "SafeDeal protected transactions are currently available only in Lagos. Update your location in Profile Settings.",
        403,
      );
    }

    // 3. Parse request
    const { shareToken, paymentMethod } = await req.json();
    if (!shareToken) {
      return jsonErr("shareToken is required", 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Use the authenticated buyer's real email (resolved earlier in this
    // handler). We used to override with a hardcoded test address during
    // development: that leaked test receipts and misrouted Paystack
    // notifications, so it is intentionally removed. If `userEmail` is
    // missing we cannot proceed to Paystack initialization.
    if (!userEmail) {
      return jsonErr(
        "We couldn't find an email on your account. Add one in Profile Settings and try again.",
        400,
      );
    }

    // 4. Resolve share token → transaction
    const { data: link, error: linkErr } = await supabase
      .from("transaction_links")
      .select("transaction_id, is_active, expires_at")
      .eq("share_token", shareToken)
      .eq("is_active", true)
      .maybeSingle();

    if (linkErr) throw linkErr;
    if (!link) {
      return jsonErr("Invalid or expired link", 404);
    }
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return jsonErr("Link has expired", 410);
    }

    const txId = link.transaction_id;

    // 5. Fetch transaction and verify state
    const { data: tx, error: txErr } = await supabase
      .from("transactions")
      .select("id, transaction_code, status, money_status, buyer_id, seller_id")
      .eq("id", txId)
      .single();

    if (txErr) throw txErr;

    // A transaction bound to another account stays theirs. An unclaimed one
    // (buyer_id null) is NOT refused here: the share link is the capability,
    // and the claim happens below, after the state gates prove the
    // transaction is genuinely payable. Refusing null here was the missing
    // backend half of guest pay (plan 4.1): the frontend sends a new
    // account straight back to this function, and nothing else ever made
    // that account the buyer.
    if (tx.buyer_id !== null && tx.buyer_id !== userId) {
      return jsonErr("Only the buyer can initiate payment", 403);
    }

    // Commerce gate: platform kill switch + vendor active check
    {
      const { checkCheckoutAllowed } = await import("../_shared/commerce-gate.ts");
      const gate = await checkCheckoutAllowed(tx.seller_id);
      if (gate) {
        return new Response(JSON.stringify(gate.body), {
          status: gate.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (tx.status !== "awaiting_payment") {
      return jsonErr(`Invalid state: status=${tx.status}`, 409);
    }

    const isRetry = tx.money_status === "payment_pending";
    if (tx.money_status !== "not_secured" && !isRetry) {
      return jsonErr(`Invalid money state: ${tx.money_status}`, 409);
    }

    // ── Guest pay, the backend half (plan 4.1): claim on pay ──
    // Identity attaches at the point money moves, the same principle the
    // pay page states. The first signed-in link holder to initiate payment
    // becomes the buyer. Atomicity lives in the WHERE clause: the update
    // matches only while buyer_id is still null, so a race between two
    // claimers has exactly one winner and the loser gets the same refusal
    // a stranger gets. Sitting after the status and money gates means a
    // cancelled or already-paid transaction can never acquire a buyer here.
    if (tx.buyer_id === null) {
      const { data: claimed, error: claimErr } = await supabase
        .from("transactions")
        .update({ buyer_id: userId })
        .eq("id", txId)
        .is("buyer_id", null)
        .select("id")
        .maybeSingle();
      if (claimErr) throw claimErr;
      if (!claimed) {
        return jsonErr("Only the buyer can initiate payment", 403);
      }
      tx.buyer_id = userId;

      const { data: claimerProfile } = await supabase
        .from("profiles")
        .select("full_name, phone")
        .eq("id", userId)
        .maybeSingle();

      // The buyer participant seat was minted with user_id null alongside
      // the transaction. Fill it, guarded the same way as the claim itself,
      // so a seat an account already holds is never reassigned.
      await Promise.all([
        supabase
          .from("transaction_participants")
          .update({
            user_id: userId,
            display_name: claimerProfile?.full_name || "Buyer",
            email: userEmail,
            phone: claimerProfile?.phone || null,
          })
          .eq("transaction_id", txId)
          .eq("role", "buyer")
          .is("user_id", null),
        supabase.from("transaction_events").insert({
          transaction_id: txId,
          event_type: "buyer_claimed_by_link",
          actor_user_id: userId,
          description: "Buyer attached to the transaction through its share link at payment",
          metadata: { share_token_claim: true },
        }),
      ]);
    }

    // 6. Fetch pricing data and compute
    const { data: pricingRow } = await supabase
      .from("transaction_pricing")
      .select("currency_code, item_amount, buyer_total_amount, platform_fee_amount, payment_processing_fee_amount")
      .eq("transaction_id", txId)
      .maybeSingle();

    if (!pricingRow || !pricingRow.item_amount) {
      return jsonErr("Transaction pricing not found", 400);
    }
    if (!pricingRow.currency_code) {
      return jsonErr("Transaction pricing currency is missing", 409);
    }

    const itemAmount = Number(pricingRow.item_amount);
    const vendorPricingConfig = await loadPricingConfig(tx.seller_id);
    const pricing = computePricing(itemAmount, pricingRow.currency_code, "local", vendorPricingConfig);
    const snapshot = buildPricingSnapshot(itemAmount, pricingRow.currency_code, vendorPricingConfig);

    // Charge the LOCKED snapshot total the buyer already agreed to. The live
    // recomputation above is used only for fee metadata / gating and as a
    // fallback when no snapshot total exists.
    const charge = resolveInitiationCharge({
      snapshot: pricingRow,
      computed: { currency_code: pricing.currency_code, total_amount: pricing.total_amount },
    });
    if (charge.source === "computed") {
      console.warn(
        `initiate-paystack-payment: no locked buyer_total_amount for transaction ${txId}: falling back to live pricing`,
      );
    }

    // SafeDeal central gate: provider (Paystack) fee is covered first inside
    // the effective cap for this vendor. If the provider estimate alone would
    // exceed the effective cap, the payment method is blocked. We use the
    // vendor-scoped cap when present, falling back to the platform default.
    const effectiveCap = vendorPricingConfig?.max_total_service_fee ?? MAX_TOTAL_SERVICE_FEE_FALLBACK;
    if (snapshot.payment_processing_fee_amount > effectiveCap) {
      return jsonErr("payment_method_blocked", 409);
    }

    // Gate 3: Amount limit by verification level.
    // An unrecognised level is a data fault, not a ₦0 limit: refuse explicitly
    // rather than fabricating a cap the buyer was never told about.
    if (!Object.prototype.hasOwnProperty.call(LIMIT_BY_LEVEL, level)) {
      return jsonErr("verification_level_unknown", 409);
    }
    const amountLimit = LIMIT_BY_LEVEL[level];
    if (itemAmount > amountLimit) {
      return jsonErr(
        `This transaction (₦${itemAmount.toLocaleString()}) exceeds your ₦${amountLimit.toLocaleString()} limit. Complete identity verification to unlock higher limits.`,
        403,
      );
    }

    // Gate 4: Concurrent active transaction cap.
    // Same shape as the limit lookup above: an unrecognised level is a data
    // fault, refused explicitly rather than silently collapsed to a 0 cap.
    if (!Object.prototype.hasOwnProperty.call(CONCURRENT_BY_LEVEL, level)) {
      return jsonErr("verification_level_unknown", 409);
    }
    const maxConcurrent = CONCURRENT_BY_LEVEL[level];
    const { count: activeCount } = await supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("buyer_id", userId)
      .in("status", ACTIVE_TX_STATUSES)
      .neq("id", txId);

    if ((activeCount ?? 0) + 1 > maxConcurrent) {
      return jsonErr(
        `You've reached your active purchase limit (${maxConcurrent}). Complete or resolve existing transactions first.`,
        403,
      );
    }

    // 7. Generate unique reference
    const reference = `SD-${tx.transaction_code}-${Date.now()}`;

    // 8. Transition money_status (skip if already payment_pending)
    if (!isRetry) {
      const { error: txUpdateErr } = await supabase
        .from("transactions")
        .update({ money_status: "payment_pending" })
        .eq("id", txId);

      if (txUpdateErr) throw txUpdateErr;
    }

    // 9. Cancel any existing pending payments for this transaction
    if (isRetry) {
      await supabase
        .from("payments")
        .update({ status: "failed", failed_at: new Date().toISOString(), failure_reason: "Superseded by retry" })
        .eq("transaction_id", txId)
        .eq("status", "pending");
    }

    // 10. Insert payments record
    const method = paymentMethod === "bank" ? "bank_transfer" : "card";
    const { error: payErr } = await supabase.from("payments").insert({
      transaction_id: txId,
      user_id: userId,
      provider: "paystack",
      provider_reference: reference,
      status: "pending",
      payment_method_type: method,
      currency_code: charge.currency_code,
      amount: charge.total_amount,
    });

    if (payErr) throw payErr;

    // 11. Insert money_status_history
    await supabase.from("money_status_history").insert({
      transaction_id: txId,
      old_status: isRetry ? "payment_pending" : "not_secured",
      new_status: "payment_pending",
      changed_by_user_id: userId,
      reason: isRetry ? "Buyer retried Paystack payment" : "Buyer initiated Paystack payment",
    });

    // 12. Call Paystack POST /transaction/initialize
    const paystackSecretKey = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!paystackSecretKey) {
      throw new Error("PAYSTACK_SECRET_KEY not configured");
    }

    const amountInKobo = charge.amount_kobo;
    const channels = paymentMethod === "bank" ? ["bank_transfer"] : ["card"];

    // Snapshot fees travel to Paystack as evidence. A missing column must stay
    // null on the charge metadata: coercing it to 0 would record a fee that
    // was never charged against a real payment.
    const numOrNull = (v: unknown) =>
      v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v);
    const snapPlatformFee = numOrNull((pricingRow as Record<string, unknown> | null)?.platform_fee_amount);
    const snapProcessingFee = numOrNull(
      (pricingRow as Record<string, unknown> | null)?.payment_processing_fee_amount,
    );
    const snapServiceFee =
      snapPlatformFee !== null && snapProcessingFee !== null
        ? snapPlatformFee + snapProcessingFee
        : null;

    const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystackSecretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: amountInKobo,
        email: userEmail,
        currency: charge.currency_code,
        reference,
        channels,
        metadata: {
          transaction_id: txId,
          share_token: shareToken,
          buyer_user_id: userId,
          item_amount: itemAmount,
          service_fee_amount:
            charge.source === "snapshot" ? snapServiceFee : pricing.service_fee_amount,
          paystack_fee_amount:
            charge.source === "snapshot" ? snapProcessingFee : pricing.paystack_fee_amount,
          platform_fee_amount:
            charge.source === "snapshot" ? snapPlatformFee : pricing.platform_fee_amount,
          pricing_source: charge.source,
        },
      }),
    });

    const paystackData = await paystackRes.json();

    if (!paystackData.status) {
      // Revert money_status on Paystack init failure
      await supabase
        .from("transactions")
        .update({ money_status: "not_secured" })
        .eq("id", txId);

      await supabase
        .from("payments")
        .update({ status: "failed", failed_at: new Date().toISOString(), failure_reason: paystackData.message })
        .eq("provider_reference", reference);

      await supabase.from("money_status_history").insert({
        transaction_id: txId,
        old_status: "payment_pending",
        new_status: "not_secured",
        changed_by_user_id: userId,
        reason: `Paystack init failed: ${paystackData.message}`,
      });

      // Paystack refusing an init is the most likely real failure here and it
      // returns before the catch below, so it needs its own record. Without
      // this, the one error that actually stops buyers paying would be the
      // one error the log never sees.
      void logEdgeError(supabaseAdmin, {
        function_name: "initiate-paystack-payment",
        error_code: "paystack_init_failed",
        message: paystackData.message || "Paystack initialization failed",
        req,
        http_status: 502,
        severity: "fatal",
        user_id: userId,
        request_context: { stage: "paystack_init", transaction_id: txId },
      });
      return jsonErr(paystackData.message || "Paystack initialization failed", 502);
    }

    // 13. Return access_code + reference + public_key
    const publicKey = Deno.env.get("PAYSTACK_PUBLIC_KEY");

    return new Response(
      JSON.stringify({
        access_code: paystackData.data.access_code,
        authorization_url: paystackData.data.authorization_url,
        reference: paystackData.data.reference,
        public_key: publicKey,
        email: userEmail,
        amount: amountInKobo,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("initiate-paystack-payment error:", err);
    // Logged under the id the browser sent, so the buyer's symptom and this
    // stack are one query apart. Not awaited: the caller is already failing
    // and must not also wait on the record of it.
    void logEdgeError(null, {
      function_name: "initiate-paystack-payment",
      message: err,
      req,
      http_status: 500,
      severity: "fatal",
      request_context: { stage: "initiate" },
    });
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
