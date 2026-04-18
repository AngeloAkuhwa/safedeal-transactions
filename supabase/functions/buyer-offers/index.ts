// Buyer's Private Offers inbox.
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

    const { data: userData, error: userErr } = await adminClient.auth.getUser(token);
    if (userErr || !userData?.user) {
      return jsonResponse({ error: "Invalid session" }, 401);
    }
    const userId = userData.user.id;
    const userEmail = userData.user.email?.toLowerCase() || "";

    // Auto-expire any stale offers + auto-link by email
    await adminClient.rpc("expire_stale_offers").catch(() => {});

    if (userEmail) {
      // Catch-up auto-link in case the trigger didn't run (e.g., social signup variations)
      const { data: catchupOffers } = await adminClient
        .from("buyer_specific_product_offers")
        .select("id")
        .is("buyer_id", null)
        .eq("status", "pending_claim")
        .ilike("buyer_email", userEmail);

      if (catchupOffers && catchupOffers.length > 0) {
        const ids = catchupOffers.map((o: any) => o.id);
        await adminClient
          .from("buyer_specific_product_offers")
          .update({
            buyer_id: userId,
            status: "linked",
            linked_at: new Date().toISOString(),
          })
          .in("id", ids);
        await adminClient.from("offer_events").insert(
          ids.map((id: string) => ({
            offer_id: id,
            event_type: "auto_linked_on_inbox_view",
            actor_user_id: userId,
          }))
        );
      }
    }

    // Fetch offers with product + seller summary
    const { data: offers, error } = await adminClient
      .from("buyer_specific_product_offers")
      .select(`
        id, offer_token, status, expires_at, linked_at, claimed_at, purchased_at, expired_at, cancelled_at, created_at,
        product_id, seller_id
      `)
      .eq("buyer_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("buyer-offers error:", error);
      return jsonResponse({ error: "Failed to load offers" }, 500);
    }

    const list = offers || [];
    const productIds = [...new Set(list.map((o: any) => o.product_id))];
    const sellerIds = [...new Set(list.map((o: any) => o.seller_id))];

    const [productsRes, sellersRes, mediaRes, txRes] = await Promise.all([
      productIds.length > 0
        ? adminClient
            .from("products")
            .select("id, title, unit_price, currency_code, stock_quantity, reserved_quantity")
            .in("id", productIds)
        : Promise.resolve({ data: [] }),
      sellerIds.length > 0
        ? adminClient
            .from("profiles")
            .select("id, full_name, avatar_url, store_slug")
            .in("id", sellerIds)
        : Promise.resolve({ data: [] }),
      productIds.length > 0
        ? adminClient
            .from("product_media")
            .select("product_id, file_id, is_primary, files(file_url, secure_url)")
            .in("product_id", productIds)
            .eq("is_primary", true)
        : Promise.resolve({ data: [] }),
      list.length > 0
        ? adminClient
            .from("transactions")
            .select("id, source_offer_id, status, money_status")
            .eq("buyer_id", userId)
            .in("source_offer_id", list.map((o: any) => o.id))
        : Promise.resolve({ data: [] }),
    ]);

    const productMap: Record<string, any> = {};
    for (const p of (productsRes.data || [])) productMap[p.id] = p;

    const sellerMap: Record<string, any> = {};
    for (const s of (sellersRes.data || [])) sellerMap[s.id] = s;

    const mediaMap: Record<string, string> = {};
    for (const m of (mediaRes.data || [])) {
      mediaMap[m.product_id] = m.files?.secure_url || m.files?.file_url || "";
    }

    const txMap: Record<string, any> = {};
    for (const t of (txRes.data || [])) txMap[t.source_offer_id] = t;

    const enriched = list.map((o: any) => {
      const product = productMap[o.product_id];
      const seller = sellerMap[o.seller_id];
      const tx = txMap[o.id];
      return {
        id: o.id,
        offer_token: o.offer_token,
        status: o.status,
        expires_at: o.expires_at,
        linked_at: o.linked_at,
        claimed_at: o.claimed_at,
        purchased_at: o.purchased_at,
        created_at: o.created_at,
        product: product
          ? {
              id: product.id,
              title: product.title,
              unit_price: Number(product.unit_price),
              currency_code: product.currency_code,
              available_quantity: product.stock_quantity - product.reserved_quantity,
              primary_image_url: mediaMap[product.id] || null,
            }
          : null,
        seller: seller
          ? {
              id: seller.id,
              full_name: seller.full_name,
              avatar_url: seller.avatar_url,
              store_slug: seller.store_slug,
            }
          : null,
        transaction: tx
          ? { id: tx.id, status: tx.status, money_status: tx.money_status }
          : null,
      };
    });

    const active = enriched.filter((o) => ["linked", "claimed"].includes(o.status));
    const past = enriched.filter((o) => ["expired", "cancelled", "purchased"].includes(o.status));

    return jsonResponse({
      active,
      past,
      total: enriched.length,
    });
  } catch (err) {
    console.error("buyer-offers error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
