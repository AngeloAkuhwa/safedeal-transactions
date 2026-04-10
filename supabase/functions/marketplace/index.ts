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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const url = new URL(req.url);
    const search = url.searchParams.get("search")?.trim() || "";
    const category = url.searchParams.get("category") || "";
    const sort = url.searchParams.get("sort") || "newest";
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const requestedPageSize = parseInt(url.searchParams.get("page_size") || "20", 10);
    const pageSize = Math.min(Math.max(1, requestedPageSize), 40);

    // Build products query with strict inclusion rules
    let query = adminClient
      .from("products")
      .select(
        `id, title, slug, short_description, unit_price, currency_code, stock_quantity, condition_label, category_id, created_at,
         seller_id,
         product_media!inner ( file_id, is_primary, files!inner ( file_url ) )`,
        { count: "exact" }
      )
      .eq("status", "published")
      .eq("visibility_type", "public")
      .eq("is_active", true);

    // Search filter
    if (search) {
      query = query.or(`title.ilike.%${search}%,short_description.ilike.%${search}%`);
    }

    // Category filter
    if (category) {
      query = query.eq("category_id", category);
    }

    // Sort
    if (sort === "price_asc") {
      query = query.order("unit_price", { ascending: true });
    } else if (sort === "price_desc") {
      query = query.order("unit_price", { ascending: false });
    } else {
      query = query.order("created_at", { ascending: false });
    }

    // Pagination
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data: products, count, error: productsError } = await query;

    if (productsError) {
      console.error("Products query error:", productsError);
      return jsonResponse({ error: "Failed to load products" }, 500);
    }

    // Collect unique seller IDs
    const sellerIds = [...new Set((products || []).map((p: any) => p.seller_id))];

    // Fetch seller profiles + verification in one go
    let sellerMap: Record<string, any> = {};
    if (sellerIds.length > 0) {
      const { data: sellers } = await adminClient
        .from("profiles")
        .select("id, full_name, store_slug, avatar_url")
        .in("id", sellerIds);

      const { data: verifications } = await adminClient
        .from("account_verifications")
        .select("user_id, verification_level, email_verified, phone_verified, identity_verified")
        .in("user_id", sellerIds);

      const verificationMap: Record<string, any> = {};
      (verifications || []).forEach((v: any) => {
        verificationMap[v.user_id] = v;
      });

      (sellers || []).forEach((s: any) => {
        const v = verificationMap[s.id] || {};
        sellerMap[s.id] = {
          full_name: s.full_name,
          store_slug: s.store_slug,
          avatar_url: s.avatar_url,
          trust_summary: {
            verification_level: v.verification_level || "unverified",
            email_verified: v.email_verified || false,
            phone_verified: v.phone_verified || false,
            identity_verified: v.identity_verified || false,
          },
        };
      });
    }

    // Get active categories that have matching products (non-empty)
    const { data: categoriesWithCounts } = await adminClient
      .from("products")
      .select("category_id")
      .eq("status", "published")
      .eq("visibility_type", "public")
      .eq("is_active", true)
      .not("category_id", "is", null);

    const categoryCountMap: Record<string, number> = {};
    (categoriesWithCounts || []).forEach((p: any) => {
      if (p.category_id) {
        categoryCountMap[p.category_id] = (categoryCountMap[p.category_id] || 0) + 1;
      }
    });

    const activeCategoryIds = Object.keys(categoryCountMap);
    let categories: any[] = [];
    if (activeCategoryIds.length > 0) {
      const { data: cats } = await adminClient
        .from("product_categories")
        .select("id, name, slug, icon_name")
        .eq("is_active", true)
        .in("id", activeCategoryIds)
        .order("sort_order", { ascending: true });
      categories = (cats || []).map((c: any) => ({
        ...c,
        product_count: categoryCountMap[c.id] || 0,
      }));
    }

    // Shape response — public-safe data only
    const shaped = (products || []).map((p: any) => {
      const primaryMedia = (p.product_media || []).find((m: any) => m.is_primary);
      const firstMedia = primaryMedia || (p.product_media || [])[0];
      const primaryImageUrl = firstMedia?.files?.file_url || null;

      return {
        id: p.id,
        title: p.title,
        slug: p.slug,
        short_description: p.short_description,
        unit_price: p.unit_price,
        currency_code: p.currency_code,
        stock_quantity: p.stock_quantity,
        condition_label: p.condition_label,
        primary_image_url: primaryImageUrl,
        seller: sellerMap[p.seller_id] || {
          full_name: "Unknown Seller",
          store_slug: null,
          avatar_url: null,
          trust_summary: {
            verification_level: "unverified",
            email_verified: false,
            phone_verified: false,
            identity_verified: false,
          },
        },
      };
    });

    return jsonResponse({
      products: shaped,
      categories,
      total: count || 0,
      page,
      page_size: pageSize,
    });
  } catch (err) {
    console.error("marketplace error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
