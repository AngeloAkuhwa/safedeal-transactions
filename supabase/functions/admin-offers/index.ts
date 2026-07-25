// Admin oversight: full traceability for buyer-specific offers.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { requirePermission, authErrorResponse } from "../_shared/auth.ts";

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
    let ctx;
    try { ctx = await requirePermission(req, "transactions.view"); }
    catch (err) {
      const resp = authErrorResponse(err, corsHeaders);
      if (resp) return resp;
      throw err;
    }
    const adminClient = ctx.adminClient;

    const url = new URL(req.url);
    const offerId = url.searchParams.get("offer_id");

    if (offerId) return await handleDetail(adminClient, offerId);
    return await handleList(adminClient, url);
  } catch (err) {
    console.error("admin-offers error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});

async function handleList(adminClient: any, url: URL) {
  await adminClient.rpc("expire_stale_offers").catch(() => {});

  const status = url.searchParams.get("status") || "all";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
  const pageSize = 50;
  const offset = (page - 1) * pageSize;

  let query = adminClient
    .from("buyer_specific_product_offers")
    .select(
      "id, offer_token, status, expires_at, linked_at, claimed_at, purchased_at, expired_at, cancelled_at, created_at, buyer_id, buyer_email, seller_id, product_id",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (status !== "all") query = query.eq("status", status);

  const { data: offers, count, error } = await query;
  if (error) return jsonResponse({ error: "Failed to load offers" }, 500);

  const list = offers || [];
  const sellerIds = [...new Set(list.map((o: any) => o.seller_id))];
  const buyerIds = list.map((o: any) => o.buyer_id).filter(Boolean);
  const productIds = [...new Set(list.map((o: any) => o.product_id))];

  const [sellersRes, buyersRes, productsRes] = await Promise.all([
    sellerIds.length
      ? adminClient.from("profiles").select("id, full_name, email").in("id", sellerIds)
      : Promise.resolve({ data: [] }),
    buyerIds.length
      ? adminClient.from("profiles").select("id, full_name, email").in("id", buyerIds)
      : Promise.resolve({ data: [] }),
    productIds.length
      ? adminClient.from("products").select("id, title, unit_price, currency_code, status").in("id", productIds)
      : Promise.resolve({ data: [] }),
  ]);

  const sm: Record<string, any> = {};
  for (const s of (sellersRes.data || [])) sm[s.id] = s;
  const bm: Record<string, any> = {};
  for (const b of (buyersRes.data || [])) bm[b.id] = b;
  const pm: Record<string, any> = {};
  for (const p of (productsRes.data || [])) pm[p.id] = p;

  // Items count per offer
  const offerIds = list.map((o: any) => o.id);
  const itemCounts: Record<string, number> = {};
  if (offerIds.length) {
    const { data: items } = await adminClient
      .from("buyer_specific_offer_items")
      .select("offer_id")
      .in("offer_id", offerIds);
    for (const it of (items || [])) {
      itemCounts[it.offer_id] = (itemCounts[it.offer_id] || 0) + 1;
    }
  }

  return jsonResponse({
    offers: list.map((o: any) => ({
      ...o,
      seller: sm[o.seller_id] || null,
      buyer: o.buyer_id ? bm[o.buyer_id] || null : null,
      product: pm[o.product_id] || null,
      items_count: itemCounts[o.id] || 0,
    })),
    total: count || 0,
    page,
    page_size: pageSize,
  });
}

async function handleDetail(adminClient: any, offerId: string) {
  const { data: offer, error } = await adminClient
    .from("buyer_specific_product_offers")
    .select("*")
    .eq("id", offerId)
    .maybeSingle();

  if (error || !offer) return jsonResponse({ error: "Offer not found" }, 404);

  const [sellerRes, buyerRes, productRes, mediaRes, eventsRes, txRes, verifRes, itemsRes] = await Promise.all([
    adminClient.from("profiles").select("id, full_name, email, avatar_url, created_at, store_slug").eq("id", offer.seller_id).maybeSingle(),
    offer.buyer_id
      ? adminClient.from("profiles").select("id, full_name, email, avatar_url, created_at").eq("id", offer.buyer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    adminClient.from("products").select("*").eq("id", offer.product_id).maybeSingle(),
    adminClient
      .from("product_media")
      .select("file_id, media_type, is_primary, files(file_url, secure_url)")
      .eq("product_id", offer.product_id)
      .order("sort_order"),
    adminClient
      .from("offer_events")
      .select("*")
      .eq("offer_id", offerId)
      .order("created_at", { ascending: true }),
    adminClient
      .from("transactions")
      .select("id, transaction_code, status, money_status, buyer_id, created_at")
      .eq("source_offer_id", offerId)
      .maybeSingle(),
    offer.buyer_id
      ? adminClient.from("account_verifications").select("verification_level").eq("user_id", offer.buyer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    adminClient
      .from("buyer_specific_offer_items")
      .select("id, position, product_id, product_title, short_description, condition_summary, quantity, unit_price_snapshot, currency_code, primary_media_url")
      .eq("offer_id", offerId)
      .order("position", { ascending: true }),
  ]);

  // Enrich items with current product status
  const items = itemsRes.data || [];
  const itemProductIds = items.map((i: any) => i.product_id).filter(Boolean);
  let itemProductMap: Record<string, any> = {};
  if (itemProductIds.length) {
    const { data: itemProducts } = await adminClient
      .from("products")
      .select("id, status, stock_quantity, reserved_quantity")
      .in("id", itemProductIds);
    for (const p of (itemProducts || [])) itemProductMap[p.id] = p;
  }
  const enrichedItems = items.map((it: any) => ({
    ...it,
    line_total: Number(it.unit_price_snapshot) * (it.quantity || 1),
    current_product: itemProductMap[it.product_id] || null,
  }));

  let payment = null;
  let escrow = null;
  if (txRes.data) {
    const [pRes, eRes] = await Promise.all([
      adminClient.from("payments").select("id, status, amount, currency_code, captured_at").eq("transaction_id", txRes.data.id).maybeSingle(),
      adminClient.from("escrow_states").select("state, held_amount, released_amount, refunded_amount").eq("transaction_id", txRes.data.id).maybeSingle(),
    ]);
    payment = pRes.data;
    escrow = eRes.data;
  }

  return jsonResponse({
    offer,
    seller: sellerRes.data,
    buyer: buyerRes.data,
    buyer_verification_level: verifRes.data?.verification_level || null,
    product: productRes.data
      ? {
          ...productRes.data,
          media: (mediaRes.data || []).map((m: any) => ({
            file_url: m.files?.secure_url || m.files?.file_url,
            media_type: m.media_type,
            is_primary: m.is_primary,
          })),
        }
      : null,
    transaction: txRes.data,
    payment,
    escrow,
    events: eventsRes.data || [],
    items: enrichedItems,
    items_count: enrichedItems.length,
  });
}
