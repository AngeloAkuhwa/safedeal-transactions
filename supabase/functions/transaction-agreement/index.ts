import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { computePricing } from "../_shared/pricing.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    const userId = user.id;

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    const { transactionId } = body;

    if (!transactionId) {
      return jsonResponse({ error: "transactionId is required" }, 400);
    }

    // Fetch transaction
    const { data: tx, error: txErr } = await admin
      .from("transactions")
      .select("id, transaction_code, status, money_status, buyer_id, seller_id, created_at, source_offer_id")
      .eq("id", transactionId)
      .single();

    if (txErr || !tx) {
      return jsonResponse({ error: "Transaction not found" }, 404);
    }

    // Validate caller is buyer or seller
    if (tx.buyer_id !== userId && tx.seller_id !== userId) {
      return jsonResponse({ error: "You are not a party to this transaction" }, 403);
    }

    // Fetch all agreement data in parallel
    const [snapshotRes, itemRes, pricingRes, deliveryRes, sellerRes, escrowRes, offerRes] =
      await Promise.all([
        admin
          .from("transaction_agreement_snapshots")
          .select("snapshot_json, locked_at, locked_by_user_id")
          .eq("transaction_id", transactionId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        admin
          .from("transaction_items")
          .select("title, description, quantity, condition_label, brand, model")
          .eq("transaction_id", transactionId)
          .single(),
        admin
          .from("transaction_pricing")
          .select("currency_code, item_amount")
          .eq("transaction_id", transactionId)
          .single(),
        admin
          .from("transaction_delivery_terms")
          .select("delivery_method, expected_delivery_date, verification_window_hours, delivery_address_line1, delivery_address_line2, delivery_city, delivery_state, delivery_postal_code, delivery_country_code")
          .eq("transaction_id", transactionId)
          .maybeSingle(),
        admin
          .from("profiles")
          .select("full_name, avatar_url")
          .eq("id", tx.seller_id)
          .single(),
        admin
          .from("escrow_states")
          .select("state, held_amount, frozen_amount, released_amount, refunded_amount")
          .eq("transaction_id", transactionId)
          .maybeSingle(),
        tx.source_offer_id
          ? admin
              .from("buyer_specific_product_offers")
              .select("id")
              .eq("id", tx.source_offer_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

    // Fetch product media + bundle items if this is an offer-backed transaction
    let productMedia: Array<{
      product_id: string;
      file_url: string;
      secure_url: string | null;
      mime_type: string | null;
      media_type: string;
      sort_order: number;
      is_primary: boolean;
    }> = [];
    let bundleItems: Array<{
      product_id: string;
      product_title: string;
      short_description: string | null;
      condition_summary: string | null;
      quantity: number;
      unit_price_snapshot: number;
      currency_code: string;
      primary_media_url: string | null;
      position: number;
    }> = [];

    const offerId = offerRes.data?.id;
    if (offerId) {
      const { data: items } = await admin
        .from("buyer_specific_offer_items")
        .select("product_id, product_title, short_description, condition_summary, quantity, unit_price_snapshot, currency_code, primary_media_url, position")
        .eq("offer_id", offerId)
        .order("position", { ascending: true });

      bundleItems = items ?? [];

      const productIds = bundleItems.map((b) => b.product_id);
      if (productIds.length > 0) {
        const { data: mediaRows } = await admin
          .from("product_media")
          .select("product_id, media_type, sort_order, is_primary, files:file_id (file_url, secure_url, mime_type)")
          .in("product_id", productIds)
          .order("sort_order", { ascending: true });

        productMedia = (mediaRows ?? []).map((m: any) => ({
          product_id: m.product_id,
          file_url: m.files?.file_url ?? "",
          secure_url: m.files?.secure_url ?? null,
          mime_type: m.files?.mime_type ?? null,
          media_type: m.media_type,
          sort_order: m.sort_order,
          is_primary: m.is_primary,
        })).filter((m) => m.file_url);
      }
    }

    // Compute pricing dynamically using SafeDeal tiered policy
    const pricingRaw = pricingRes.data;
    const computedPricing = pricingRaw
      ? computePricing(Number(pricingRaw.item_amount) || 0, pricingRaw.currency_code || "NGN")
      : null;

    return jsonResponse({
      transaction: {
        id: tx.id,
        transaction_code: tx.transaction_code,
        status: tx.status,
        money_status: tx.money_status,
        created_at: tx.created_at,
      },
      snapshot: snapshotRes.data,
      item: itemRes.data,
      pricing: computedPricing,
      delivery: deliveryRes.data,
      seller: sellerRes.data,
      escrow: escrowRes.data,
      productMedia,
      bundleItems,
    });
  } catch (err) {
    console.error("transaction-agreement error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
