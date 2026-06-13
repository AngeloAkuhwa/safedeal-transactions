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
          .select("id, transaction_code, status, money_status, created_at, agreement_locked_at, seller_id, source_offer_id, source_product_id")
          .eq("id", txId)
          .single(),
        supabase
          .from("transaction_items")
          .select("title, description, quantity, condition_label, brand, model, warranty_info")
          .eq("transaction_id", txId)
          .maybeSingle(),
        supabase
          .from("transaction_pricing")
          .select("currency_code, item_amount")
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
          .select("id, file_id, media_type, sort_order, files(file_url, secure_url, mime_type, original_file_name)")
          .eq("transaction_id", txId)
          .order("sort_order", { ascending: true }),
      ]);

    if (txRes.error) throw txRes.error;
    const tx = txRes.data;

    // Surface silent failures from the parallel fetches.
    for (const [name, res] of [
      ["item", itemRes],
      ["pricing", pricingRes],
      ["delivery", deliveryRes],
      ["escrow", escrowRes],
      ["media", mediaRes],
    ] as const) {
      if ((res as { error?: unknown }).error) {
        console.error(`resolve-share-token: ${name} query error`, (res as { error: unknown }).error);
      }
    }

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

    // 4. Compute pricing dynamically using SafeDeal tiered policy
    const pricingRaw = pricingRes.data;
    const computedPricing = pricingRaw
      ? computePricing(Number(pricingRaw.item_amount) || 0, pricingRaw.currency_code || "NGN")
      : null;

    // 5. Resolve media: prefer transaction_media; fall back to product_media
    //    (offer-claimed transactions store media on the source product, not on the transaction)
    let media: unknown[] = mediaRes.data ?? [];
    if (media.length === 0) {
      const productIds: string[] = [];
      // Single-product transaction
      if (tx.source_product_id) productIds.push(tx.source_product_id as string);
      // Offer-claimed (potentially multi-product) transaction
      if (tx.source_offer_id) {
        const { data: offerItems } = await supabase
          .from("buyer_specific_offer_items")
          .select("product_id, position")
          .eq("offer_id", tx.source_offer_id)
          .order("position", { ascending: true });
        for (const oi of offerItems ?? []) {
          if (oi.product_id && !productIds.includes(oi.product_id)) {
            productIds.push(oi.product_id);
          }
        }
      }
      if (productIds.length > 0) {
        const { data: pmRows } = await supabase
          .from("product_media")
          .select("id, file_id, media_type, sort_order, product_id, files(file_url, secure_url, mime_type, original_file_name)")
          .in("product_id", productIds)
          .order("sort_order", { ascending: true });
        media = (pmRows ?? []).map((m: Record<string, unknown>) => ({
          id: m.id,
          file_id: m.file_id,
          media_type: m.media_type,
          sort_order: m.sort_order,
          files: m.files,
        }));
      }
    }

    const response = {
      transaction: {
        id: tx.id,
        transaction_code: tx.transaction_code,
        status: tx.status,
        money_status: tx.money_status,
        created_at: tx.created_at,
        agreement_locked_at: tx.agreement_locked_at,
      },
      item: itemRes.data
        ? {
            ...itemRes.data,
            // Preserve the existing client contract (`warranty_terms`).
            warranty_terms: (itemRes.data as { warranty_info?: unknown }).warranty_info ?? null,
          }
        : null,
      pricing: computedPricing,
      delivery: deliveryRes.data || null,
      escrow: escrowRes.data || null,
      media,
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
