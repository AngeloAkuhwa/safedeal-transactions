// Admin oversight: full traceability for buyer-specific offers.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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
      return jsonResponse({ error: "Not authenticated" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = authHeader.replace("Bearer ", "");
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: userData } = await adminClient.auth.getUser(token);
    if (!userData?.user) return jsonResponse({ error: "Invalid session" }, 401);
    const userId = userData.user.id;

    const { data: isAdmin } = await adminClient.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) return jsonResponse({ error: "Admin role required" }, 403);

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

  return jsonResponse({
    offers: list.map((o: any) => ({
      ...o,
      seller: sm[o.seller_id] || null,
      buyer: o.buyer_id ? bm[o.buyer_id] || null : null,
      product: pm[o.product_id] || null,
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

  const [sellerRes, buyerRes, productRes, mediaRes, eventsRes, txRes, verifRes] = await Promise.all([
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
  ]);

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
  });
}
