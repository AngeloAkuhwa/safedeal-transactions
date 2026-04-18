// Seller's private offers management: list, cancel, reactivate
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function generateOfferToken(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let result = "";
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  for (const b of bytes) result += chars[b % chars.length];
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Not authenticated" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = authHeader.replace("Bearer ", "");
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: userData } = await adminClient.auth.getUser(token);
    if (!userData?.user) return jsonResponse({ error: "Invalid session" }, 401);
    const userId = userData.user.id;

    const { data: hasRole } = await adminClient.rpc("has_role", {
      _user_id: userId,
      _role: "seller",
    });
    if (!hasRole) return jsonResponse({ error: "Seller role required" }, 403);

    if (req.method === "GET") {
      return await handleList(adminClient, userId);
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    if (action === "cancel") return await handleCancel(adminClient, userId, body.offer_id);
    if (action === "reactivate") return await handleReactivate(adminClient, userId, body.offer_id, body.expires_in_days);

    return jsonResponse({ error: "Invalid action" }, 400);
  } catch (err) {
    console.error("seller-offers error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});

async function handleList(adminClient: any, userId: string) {
  try {
    await adminClient.rpc("expire_stale_offers");
  } catch (_e) {
    // best-effort; ignore failure
  }

  const { data: offers, error } = await adminClient
    .from("buyer_specific_product_offers")
    .select(`
      id, offer_token, status, expires_at, linked_at, claimed_at, purchased_at, expired_at, cancelled_at, created_at,
      buyer_id, buyer_email, product_id
    `)
    .eq("seller_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return jsonResponse({ error: "Failed to load offers" }, 500);

  const list = offers || [];
  const productIds = [...new Set(list.map((o: any) => o.product_id))];
  const buyerIds = list.map((o: any) => o.buyer_id).filter(Boolean);
  const offerIds = list.map((o: any) => o.id);

  const [productsRes, mediaRes, buyersRes, itemsRes, txRes] = await Promise.all([
    productIds.length > 0
      ? adminClient
          .from("products")
          .select("id, title, unit_price, currency_code, stock_quantity, reserved_quantity, status")
          .in("id", productIds)
      : Promise.resolve({ data: [] }),
    productIds.length > 0
      ? adminClient
          .from("product_media")
          .select("product_id, files(file_url, secure_url)")
          .in("product_id", productIds)
          .eq("is_primary", true)
      : Promise.resolve({ data: [] }),
    buyerIds.length > 0
      ? adminClient
          .from("profiles")
          .select("id, full_name, email, avatar_url")
          .in("id", buyerIds)
      : Promise.resolve({ data: [] }),
    offerIds.length > 0
      ? adminClient
          .from("buyer_specific_offer_items")
          .select("offer_id, id, product_title, short_description, quantity, unit_price_snapshot, currency_code, primary_media_url, position")
          .in("offer_id", offerIds)
          .order("position", { ascending: true })
      : Promise.resolve({ data: [] }),
    offerIds.length > 0
      ? adminClient
          .from("transactions")
          .select("id, status, money_status, source_offer_id")
          .in("source_offer_id", offerIds)
      : Promise.resolve({ data: [] }),
  ]);

  const productMap: Record<string, any> = {};
  for (const p of (productsRes.data || [])) productMap[p.id] = p;

  const mediaMap: Record<string, string> = {};
  for (const m of (mediaRes.data || [])) {
    mediaMap[m.product_id] = m.files?.secure_url || m.files?.file_url || "";
  }

  const buyerMap: Record<string, any> = {};
  for (const b of (buyersRes.data || [])) buyerMap[b.id] = b;

  const itemsByOffer: Record<string, any[]> = {};
  for (const it of (itemsRes.data || [])) {
    if (!itemsByOffer[it.offer_id]) itemsByOffer[it.offer_id] = [];
    itemsByOffer[it.offer_id].push(it);
  }

  const txByOffer: Record<string, any> = {};
  for (const t of (txRes.data || [])) {
    if (t.source_offer_id) txByOffer[t.source_offer_id] = t;
  }

  const enriched = list.map((o: any) => ({
    ...o,
    product: productMap[o.product_id]
      ? { ...productMap[o.product_id], primary_image_url: mediaMap[o.product_id] || null }
      : null,
    buyer: o.buyer_id ? buyerMap[o.buyer_id] || null : null,
    items: itemsByOffer[o.id] || [],
    items_count: (itemsByOffer[o.id] || []).length,
    transaction: txByOffer[o.id] || null,
  }));

  return jsonResponse({ offers: enriched, total: enriched.length });
}

async function handleCancel(adminClient: any, userId: string, offerId: string) {
  if (!offerId) return jsonResponse({ error: "offer_id required" }, 400);

  const { data: offer } = await adminClient
    .from("buyer_specific_product_offers")
    .select("id, seller_id, status, product_id")
    .eq("id", offerId)
    .single();

  if (!offer || offer.seller_id !== userId) {
    return jsonResponse({ error: "Offer not found" }, 404);
  }

  if (["cancelled", "purchased", "expired"].includes(offer.status)) {
    return jsonResponse({ error: "Offer cannot be cancelled in current state" }, 400);
  }

  await adminClient
    .from("buyer_specific_product_offers")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", offerId);

  // Archive the linked product
  await adminClient.from("products").update({ status: "archived" }).eq("id", offer.product_id);

  await adminClient.from("offer_events").insert({
    offer_id: offerId,
    event_type: "cancelled_by_seller",
    actor_user_id: userId,
  });

  return jsonResponse({ success: true });
}

async function handleReactivate(adminClient: any, userId: string, offerId: string, expiresInDays: number) {
  if (!offerId) return jsonResponse({ error: "offer_id required" }, 400);

  const days = Math.max(1, Math.min(365, parseInt(String(expiresInDays)) || 7));

  const { data: offer } = await adminClient
    .from("buyer_specific_product_offers")
    .select("id, seller_id, status, product_id, offer_token, previous_tokens, buyer_id")
    .eq("id", offerId)
    .single();

  if (!offer || offer.seller_id !== userId) {
    return jsonResponse({ error: "Offer not found" }, 404);
  }

  if (!["expired", "cancelled"].includes(offer.status)) {
    return jsonResponse({ error: "Only expired or cancelled offers can be reactivated" }, 400);
  }

  const newToken = generateOfferToken();
  const newStatus = offer.buyer_id ? "linked" : "pending_claim";
  const newExpiry = new Date(Date.now() + days * 86400000).toISOString();

  await adminClient
    .from("buyer_specific_product_offers")
    .update({
      offer_token: newToken,
      previous_tokens: [...(offer.previous_tokens || []), offer.offer_token],
      status: newStatus,
      expires_at: newExpiry,
      expired_at: null,
      cancelled_at: null,
      linked_at: offer.buyer_id ? new Date().toISOString() : null,
      claimed_at: null,
    })
    .eq("id", offerId);

  // Re-publish product
  await adminClient
    .from("products")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", offer.product_id);

  await adminClient.from("offer_events").insert({
    offer_id: offerId,
    event_type: "reactivated_by_seller",
    actor_user_id: userId,
    metadata: { new_token: newToken, expires_at: newExpiry },
  });

  return jsonResponse({
    success: true,
    offer_token: newToken,
    offer_url: `/offer/${newToken}`,
    expires_at: newExpiry,
  });
}
