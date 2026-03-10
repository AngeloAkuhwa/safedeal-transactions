import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { computePricing } from "../_shared/pricing.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Authenticate buyer
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
    let userEmail = claimsData.claims.email as string;

    // 2. Parse request
    const { shareToken, paymentMethod } = await req.json();
    if (!shareToken) {
      return new Response(JSON.stringify({ error: "shareToken is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 3. Resolve share token → transaction
    const { data: link, error: linkErr } = await supabase
      .from("transaction_links")
      .select("transaction_id, is_active, expires_at")
      .eq("share_token", shareToken)
      .eq("is_active", true)
      .maybeSingle();

    if (linkErr) throw linkErr;
    if (!link) {
      return new Response(JSON.stringify({ error: "Invalid or expired link" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "Link has expired" }), {
        status: 410,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const txId = link.transaction_id;

    // 4. Fetch transaction and verify state
    const { data: tx, error: txErr } = await supabase
      .from("transactions")
      .select("id, transaction_code, status, money_status, buyer_id, seller_id")
      .eq("id", txId)
      .single();

    if (txErr) throw txErr;

    if (tx.buyer_id !== userId) {
      return new Response(JSON.stringify({ error: "Only the buyer can initiate payment" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (tx.status !== "awaiting_payment") {
      return new Response(
        JSON.stringify({ error: `Invalid state: status=${tx.status}` }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isRetry = tx.money_status === "payment_pending";
    if (tx.money_status !== "not_secured" && !isRetry) {
      return new Response(
        JSON.stringify({ error: `Invalid money state: ${tx.money_status}` }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Fetch pricing data and compute
    const { data: pricingRow } = await supabase
      .from("transaction_pricing")
      .select("currency_code, item_amount")
      .eq("transaction_id", txId)
      .maybeSingle();

    if (!pricingRow || !pricingRow.item_amount) {
      return new Response(JSON.stringify({ error: "Transaction pricing not found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pricing = computePricing(
      Number(pricingRow.item_amount),
      pricingRow.currency_code || "NGN"
    );

    // 6. Generate unique reference
    const reference = `SD-${tx.transaction_code}-${Date.now()}`;

    // 7. Transition money_status (skip if already payment_pending)
    if (!isRetry) {
      const { error: txUpdateErr } = await supabase
        .from("transactions")
        .update({ money_status: "payment_pending" })
        .eq("id", txId);

      if (txUpdateErr) throw txUpdateErr;
    }

    // 8. Cancel any existing pending payments for this transaction
    if (isRetry) {
      await supabase
        .from("payments")
        .update({ status: "failed", failed_at: new Date().toISOString(), failure_reason: "Superseded by retry" })
        .eq("transaction_id", txId)
        .eq("status", "pending");
    }

    // 9. Insert payments record
    const method = paymentMethod === "bank" ? "bank_transfer" : "card";
    const { error: payErr } = await supabase.from("payments").insert({
      transaction_id: txId,
      user_id: userId,
      provider: "paystack",
      provider_reference: reference,
      status: "pending",
      payment_method_type: method,
      currency_code: pricing.currency_code,
      amount: pricing.total_amount,
    });

    if (payErr) throw payErr;

    // 10. Insert money_status_history
    await supabase.from("money_status_history").insert({
      transaction_id: txId,
      old_status: isRetry ? "payment_pending" : "not_secured",
      new_status: "payment_pending",
      changed_by_user_id: userId,
      reason: isRetry ? "Buyer retried Paystack payment" : "Buyer initiated Paystack payment",
    });

    // 10. Call Paystack POST /transaction/initialize
    const paystackSecretKey = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!paystackSecretKey) {
      throw new Error("PAYSTACK_SECRET_KEY not configured");
    }

    const amountInKobo = Math.round(pricing.total_amount * 100);
    const channels = paymentMethod === "bank" ? ["bank_transfer"] : ["card"];

    const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystackSecretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: amountInKobo,
        email: userEmail,
        currency: pricing.currency_code,
        reference,
        channels,
        metadata: {
          transaction_id: txId,
          share_token: shareToken,
          buyer_user_id: userId,
          item_amount: pricing.item_amount,
          service_fee_amount: pricing.service_fee_amount,
          paystack_fee_amount: pricing.paystack_fee_amount,
          platform_fee_amount: pricing.platform_fee_amount,
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

      return new Response(
        JSON.stringify({ error: paystackData.message || "Paystack initialization failed" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 11. Return access_code + reference + public_key
    const publicKey = Deno.env.get("PAYSTACK_PUBLIC_KEY");

    return new Response(
      JSON.stringify({
        access_code: paystackData.data.access_code,
        authorization_url: paystackData.data.authorization_url,
        reference: paystackData.data.reference,
        public_key: publicKey,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("initiate-paystack-payment error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
