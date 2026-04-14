import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify the user
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub;

    // Parse session_id from query
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("session_id");
    if (!sessionId) {
      return new Response(JSON.stringify({ error: "session_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Fetch session and verify ownership
    const { data: session, error: sessionErr } = await admin
      .from("checkout_sessions")
      .select("*")
      .eq("id", sessionId)
      .single();

    if (sessionErr || !session) {
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (session.buyer_id !== userId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch session items
    const { data: items } = await admin
      .from("checkout_session_items")
      .select("*")
      .eq("checkout_session_id", sessionId);

    const sessionItems = items || [];

    // Collect unique IDs
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
        ? admin
            .from("profiles")
            .select("id,full_name")
            .in("id", sellerIds)
        : Promise.resolve({ data: [] }),
      sellerIds.length > 0
        ? admin
            .from("account_verifications")
            .select("user_id,phone_verified")
            .in("user_id", sellerIds)
        : Promise.resolve({ data: [] }),
    ]);

    const products = productsResult.data || [];
    const profiles = profilesResult.data || [];
    const verifications = verificationsResult.data || [];

    // Build seller map with merged data
    const sellerMap: Record<string, any> = {};
    for (const p of profiles) {
      sellerMap[p.id] = { id: p.id, full_name: p.full_name, phone_verified: false };
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

    return new Response(
      JSON.stringify({
        session,
        items: sessionItems,
        products: productMap,
        sellers: sellerMap,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
