import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const { shareToken } = await req.json();
    if (!shareToken || typeof shareToken !== "string") {
      return new Response(JSON.stringify({ error: "shareToken is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Resolve share token → transaction_id
    const { data: link, error: linkErr } = await supabase
      .from("transaction_links")
      .select("transaction_id, expires_at, is_active")
      .eq("share_token", shareToken)
      .eq("is_active", true)
      .maybeSingle();

    if (linkErr) throw linkErr;
    if (!link) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired transaction link" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check expiry
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "This transaction link has expired" }),
        { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const txId = link.transaction_id;

    // 2. Fetch transaction + related data in parallel
    const [txRes, itemRes, pricingRes, deliveryRes, escrowRes, mediaRes] =
      await Promise.all([
        supabase
          .from("transactions")
          .select("id, transaction_code, status, money_status, created_at, agreement_locked_at, seller_id")
          .eq("id", txId)
          .single(),
        supabase
          .from("transaction_items")
          .select("title, description, quantity, condition_label, brand, model, warranty_terms")
          .eq("transaction_id", txId)
          .maybeSingle(),
        supabase
          .from("transaction_pricing")
          .select("currency_code, item_amount, platform_fee_amount, processing_fee_amount, seller_net_amount, buyer_total_amount")
          .eq("transaction_id", txId)
          .maybeSingle(),
        supabase
          .from("transaction_delivery_terms")
          .select("delivery_method, expected_delivery_date, verification_window_hours")
          .eq("transaction_id", txId)
          .maybeSingle(),
        supabase
          .from("escrow_states")
          .select("state, held_amount, frozen_amount, released_amount, refunded_amount")
          .eq("transaction_id", txId)
          .maybeSingle(),
        supabase
          .from("transaction_media")
          .select("id, file_id, media_type, display_order, files(file_url, secure_url, mime_type, original_file_name)")
          .eq("transaction_id", txId)
          .order("display_order", { ascending: true }),
      ]);

    if (txRes.error) throw txRes.error;
    const tx = txRes.data;

    // 3. Fetch seller profile + verification
    const [sellerRes, verifyRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, avatar_url, email, created_at")
        .eq("id", tx.seller_id)
        .single(),
      supabase
        .from("account_verifications")
        .select("email_verified, phone_verified, identity_verified, payout_verified")
        .eq("user_id", tx.seller_id)
        .maybeSingle(),
    ]);

    const pricingRaw = pricingRes.data || null;
    const computedPricing = pricingRaw ? {
      ...pricingRaw,
      service_fee_amount: (Number(pricingRaw.platform_fee_amount) || 0) + (Number(pricingRaw.processing_fee_amount) || 0),
      service_fee_rate: (Number(pricingRaw.item_amount) || 0) > 0
        ? ((Number(pricingRaw.platform_fee_amount) || 0) + (Number(pricingRaw.processing_fee_amount) || 0)) / Number(pricingRaw.item_amount)
        : 0,
    } : null;

    const response = {
      transaction: {
        id: tx.id,
        transaction_code: tx.transaction_code,
        status: tx.status,
        money_status: tx.money_status,
        created_at: tx.created_at,
        agreement_locked_at: tx.agreement_locked_at,
      },
      item: itemRes.data || null,
      pricing: computedPricing,
      delivery: deliveryRes.data || null,
      escrow: escrowRes.data || null,
      media: mediaRes.data || [],
      seller: sellerRes.data
        ? {
            full_name: sellerRes.data.full_name,
            avatar_url: sellerRes.data.avatar_url,
            email: sellerRes.data.email,
            member_since: sellerRes.data.created_at,
          }
        : null,
      sellerVerification: verifyRes.data || null,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("resolve-share-token error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
