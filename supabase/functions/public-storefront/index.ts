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

  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const url = new URL(req.url);
    const sellerSlug = url.searchParams.get("seller_slug");
    if (!sellerSlug) {
      return jsonResponse({ error: "seller_slug is required" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Get seller profile
    const { data: seller, error: sellerError } = await adminClient
      .from("profiles")
      .select("id, full_name, avatar_url, store_slug, vendor_status, vendor_status_reason, city_name, state_name")
      .eq("store_slug", sellerSlug)
      .single();

    if (sellerError || !seller) {
      return jsonResponse({ error: "Store not found" }, 404);
    }

    // Hide storefronts of disabled/suspended vendors
    if ((seller as any).vendor_status && (seller as any).vendor_status !== "active") {
      return jsonResponse({
        error: "vendor_unavailable",
        vendor_status: (seller as any).vendor_status,
        reason: (seller as any).vendor_status_reason ?? "This store is currently unavailable.",
      }, 403);
    }

    // Get seller verification level
    const { data: verification } = await adminClient
      .from("account_verifications")
      .select("verification_level, email_verified, phone_verified, identity_verified")
      .eq("user_id", seller.id)
      .single();

    // Parse query params
    const search = (url.searchParams.get("search") || "").trim().toLowerCase();
    const category = url.searchParams.get("category") || "all";
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const pageSize = 20;
    const offset = (page - 1) * pageSize;

    let query = adminClient
      .from("products")
      .select("id, title, slug, short_description, unit_price, currency_code, stock_quantity, reserved_quantity, status, condition_label, created_at", { count: "exact" })
      .eq("seller_id", seller.id)
      .eq("status", "published")
      .eq("visibility_type", "public")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (category !== "all") {
      query = query.eq("category_id", category);
    }
    if (search) {
      query = query.or(`title.ilike.%${search}%,short_description.ilike.%${search}%`);
    }

    const { data: products, error: productsError, count } = await query;
    if (productsError) {
      console.error("Public storefront products error:", productsError);
      return jsonResponse({ error: "Failed to load products" }, 500);
    }

    // Fetch primary media
    const productIds = (products || []).map((p: any) => p.id);
    let mediaMap: Record<string, string> = {};

    if (productIds.length > 0) {
      const { data: media } = await adminClient
        .from("product_media")
        .select("product_id, file_id")
        .in("product_id", productIds)
        .eq("is_primary", true);

      if (media && media.length > 0) {
        const fileIds = media.map((m: any) => m.file_id);
        const { data: files } = await adminClient
          .from("files")
          .select("id, file_url, secure_url")
          .in("id", fileIds);

        const fileUrlMap: Record<string, string> = {};
        if (files) {
          for (const f of files) fileUrlMap[f.id] = f.secure_url || f.file_url;
        }

        for (const m of media) {
          mediaMap[m.product_id] = fileUrlMap[m.file_id] || "";
        }
      }
    }

    // Social proof, measured rather than invented (plan 2.1b), mirroring the
    // marketplace: completed transactions per originating product, and the
    // card stays silent at zero.
    const soldCounts: Record<string, number> = {};
    if (productIds.length > 0) {
      const { data: soldRows } = await adminClient
        .from("transactions")
        .select("source_product_id")
        .eq("status", "completed")
        .in("source_product_id", productIds);
      for (const r of soldRows || []) {
        if (r.source_product_id) {
          soldCounts[r.source_product_id] = (soldCounts[r.source_product_id] || 0) + 1;
        }
      }
    }

    const enrichedProducts = (products || []).map((p: any) => ({
      ...p,
      primary_image_url: mediaMap[p.id] || null,
      sold_count: soldCounts[p.id] || 0,
    }));

    return jsonResponse({
      seller: {
        full_name: seller.full_name,
        avatar_url: seller.avatar_url,
        store_slug: seller.store_slug,
        city_name: (seller as { city_name?: string | null }).city_name ?? null,
        state_name: (seller as { state_name?: string | null }).state_name ?? null,
        verification_level: verification?.verification_level || "unverified",
        email_verified: verification?.email_verified || false,
        phone_verified: verification?.phone_verified || false,
        identity_verified: verification?.identity_verified || false,
      },
      products: enrichedProducts,
      total: count || 0,
      page,
      page_size: pageSize,
    });
  } catch (err) {
    console.error("public-storefront error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
