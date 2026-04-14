import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("checkout-review: missing auth header");
      return json({ error: "Not authenticated" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Verify user via getUser
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData?.user) {
      console.error("checkout-review: auth failed", userError?.message);
      return json({ error: "Invalid session" }, 401);
    }
    const userId = userData.user.id;

    // Parse session_id from query
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("session_id");
    console.log(`checkout-review: user=${userId}, session_id=${sessionId}`);

    if (!sessionId) {
      return json({ error: "session_id is required" }, 400);
    }

    // Fetch session
    const { data: session, error: sessionErr } = await admin
      .from("checkout_sessions")
      .select("*")
      .eq("id", sessionId)
      .single();

    if (sessionErr || !session) {
      console.error("checkout-review: session not found", sessionId, sessionErr?.message);
      return json({ error: "Checkout session not found" }, 404);
    }

    if (session.buyer_id !== userId) {
      console.warn(`checkout-review: ownership mismatch. session.buyer_id=${session.buyer_id}, userId=${userId}`);
      return json({ error: "This checkout belongs to a different account. Please sign in with the correct buyer account." }, 403);
    }

    // Fetch session items
    const { data: items } = await admin
      .from("checkout_session_items")
      .select("*")
      .eq("checkout_session_id", sessionId);

    const sessionItems = items || [];
    const productIds = [...new Set(sessionItems.map((i: any) => i.product_id))];
    const sellerIds = [...new Set(sessionItems.map((i: any) => i.seller_id))];

    // Fetch products, seller profiles, and verifications in parallel
    const [productsResult, profilesResult, verificationsResult] = await Promise.all([
      productIds.length > 0
        ? admin
            .from("products")
            .select("id,title,short_description,primary_image,stock_quantity,reserved_quantity,status")
            .in("id", productIds)
        : Promise.resolve({ data: [] }),
      sellerIds.length > 0
        ? admin.from("profiles").select("id,full_name,store_slug").in("id", sellerIds)
        : Promise.resolve({ data: [] }),
      sellerIds.length > 0
        ? admin.from("account_verifications").select("user_id,phone_verified").in("user_id", sellerIds)
        : Promise.resolve({ data: [] }),
    ]);

    const products = productsResult.data || [];
    const profiles = profilesResult.data || [];
    const verifications = verificationsResult.data || [];

    // Build seller map
    const sellerMap: Record<string, any> = {};
    for (const p of profiles) {
      sellerMap[p.id] = { id: p.id, full_name: p.full_name, store_slug: p.store_slug || null, phone_verified: false };
    }
    for (const v of verifications) {
      if (sellerMap[v.user_id]) {
        sellerMap[v.user_id].phone_verified = v.phone_verified ?? false;
      }
    }

    // Build product map
    const productMap: Record<string, any> = {};
    for (const p of products) {
      productMap[p.id] = p;
    }

    console.log(`checkout-review: returning ${sessionItems.length} items, ${Object.keys(sellerMap).length} sellers`);

    return json({
      session,
      items: sessionItems,
      products: productMap,
      sellers: sellerMap,
    });
  } catch (err: any) {
    console.error("checkout-review: unexpected error", err.message);
    return json({ error: err.message || "Internal server error" }, 500);
  }
});
