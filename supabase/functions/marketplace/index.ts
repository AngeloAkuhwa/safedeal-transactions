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

const FEATURED_SLOTS = 4;

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
    const include = (url.searchParams.get("include") || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const category = url.searchParams.get("category") || "";
    const sort = url.searchParams.get("sort") || "newest";
    const priceMinRaw = url.searchParams.get("price_min");
    const priceMaxRaw = url.searchParams.get("price_max");
    const priceMin = priceMinRaw ? parseFloat(priceMinRaw) : null;
    const priceMax = priceMaxRaw ? parseFloat(priceMaxRaw) : null;
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const requestedPageSize = parseInt(url.searchParams.get("page_size") || "20", 10);
    const pageSize = Math.min(Math.max(1, requestedPageSize), 40);

    // Build products query with strict inclusion rules
    let query = adminClient
      .from("products")
      .select(
        `id, title, slug, short_description, unit_price, currency_code, stock_quantity, reserved_quantity, condition_label, category_id, created_at,
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

    // Price filter
    if (priceMin != null && !isNaN(priceMin)) {
      query = query.gte("unit_price", priceMin);
    }
    if (priceMax != null && !isNaN(priceMax)) {
      query = query.lte("unit_price", priceMax);
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

    /**
     * Paid featured placement. Sellers earn it either from a plan that includes
     * `featured_placement` (Growth) or from an active "Boost my store" sachet
     * (`featured_until`). It only re-orders the first page of the default sort —
     * explicit price sorts and deeper pages stay untouched so the ordering the
     * shopper asked for is never overridden.
     */
    const featuredIds = new Set<string>();
    if (page === 1 && sort === "newest") {
      const nowIso = new Date().toISOString();
      const [{ data: boosted }, { data: featuredPlans }] = await Promise.all([
        adminClient.from("profiles").select("id").gt("featured_until", nowIso),
        adminClient.from("vendor_plans").select("code").eq("featured_placement", true).eq("is_active", true),
      ]);
      const planCodes = (featuredPlans || []).map((r: any) => r.code);
      let planSellerIds: string[] = [];
      if (planCodes.length > 0) {
        const { data: planSellers } = await adminClient
          .from("profiles")
          .select("id")
          .in("vendor_plan_code", planCodes)
          .gt("vendor_plan_expires_at", nowIso);
        planSellerIds = (planSellers || []).map((r: any) => r.id);
      }
      const featuredSellerIds = [
        ...new Set([...(boosted || []).map((r: any) => r.id), ...planSellerIds]),
      ];

      if (featuredSellerIds.length > 0) {
        let fq = adminClient
          .from("products")
          .select(
            `id, title, slug, short_description, unit_price, currency_code, stock_quantity, reserved_quantity, condition_label, category_id, created_at,
             seller_id,
             product_media!inner ( file_id, is_primary, files!inner ( file_url ) )`,
          )
          .eq("status", "published")
          .eq("visibility_type", "public")
          .eq("is_active", true)
          .in("seller_id", featuredSellerIds);
        if (search) fq = fq.or(`title.ilike.%${search}%,short_description.ilike.%${search}%`);
        if (category) fq = fq.eq("category_id", category);
        if (priceMin != null && !isNaN(priceMin)) fq = fq.gte("unit_price", priceMin);
        if (priceMax != null && !isNaN(priceMax)) fq = fq.lte("unit_price", priceMax);

        const { data: featuredProducts } = await fq
          .order("created_at", { ascending: false })
          .limit(FEATURED_SLOTS);

        for (const fp of featuredProducts || []) {
          featuredIds.add(fp.id);
        }
        if ((featuredProducts || []).length > 0) {
          const existing = new Set((products || []).map((p: any) => p.id));
          const prepend = (featuredProducts || []).filter((p: any) => !existing.has(p.id));
          (products as any[]).unshift(...prepend);
          // Keep the page size stable: featured items replace the tail.
          if (products!.length > pageSize) (products as any[]).length = pageSize;
        }
        // Re-order so featured items lead the page.
        (products as any[]).sort(
          (a: any, b: any) => Number(featuredIds.has(b.id)) - Number(featuredIds.has(a.id)),
        );
      }
    }

    // Collect unique seller IDs
    const sellerIds = [...new Set((products || []).map((p: any) => p.seller_id))];

    // Filter out products whose seller is disabled/suspended
    let activeSellerIdSet = new Set<string>(sellerIds as string[]);
    if (sellerIds.length > 0) {
      const { data: statusRows } = await adminClient
        .from("profiles")
        .select("id, vendor_status")
        .in("id", sellerIds);
      activeSellerIdSet = new Set(
        (statusRows || [])
          .filter((r: any) => (r.vendor_status ?? "active") === "active")
          .map((r: any) => r.id),
      );
    }
    const filteredProducts = (products || []).filter((p: any) => activeSellerIdSet.has(p.seller_id));

    // Fetch seller profiles + verification in one go
    let sellerMap: Record<string, any> = {};
    const activeSellerIds = Array.from(activeSellerIdSet);
    if (activeSellerIds.length > 0) {
      const { data: sellers } = await adminClient
        .from("profiles")
        .select("id, full_name, store_slug, avatar_url")
        .in("id", activeSellerIds);

      const { data: verifications } = await adminClient
        .from("account_verifications")
        .select("user_id, verification_level, email_verified, phone_verified, identity_verified")
        .in("user_id", activeSellerIds);

      const verificationMap: Record<string, any> = {};
      (verifications || []).forEach((v: any) => {
        verificationMap[v.user_id] = v;
      });

      (sellers || []).forEach((s: any) => {
        const v = verificationMap[s.id] || {};
        sellerMap[s.id] = {
          id: s.id,
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

    // Shape response: public-safe data only
    const shaped = filteredProducts.map((p: any) => {
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
        reserved_quantity: p.reserved_quantity ?? 0,
        condition_label: p.condition_label,
        category_id: p.category_id || null,
        primary_image_url: primaryImageUrl,
        is_featured: featuredIds.has(p.id),
        seller: sellerMap[p.seller_id] || {
          id: p.seller_id,
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

    // Optionally include featured sellers (top sellers by published, public, in-stock products)
    let featured_sellers: any[] = [];
    if (include.includes("sellers")) {
      const { data: counts } = await adminClient
        .from("products")
        .select("seller_id")
        .eq("status", "published")
        .eq("visibility_type", "public")
        .eq("is_active", true)
        .gt("stock_quantity", 0);

      const tally: Record<string, number> = {};
      (counts || []).forEach((r: any) => {
        if (!r.seller_id) return;
        tally[r.seller_id] = (tally[r.seller_id] || 0) + 1;
      });

      const topSellerIds = Object.entries(tally)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([id]) => id);

      if (topSellerIds.length > 0) {
        const { data: sellers } = await adminClient
          .from("profiles")
          .select("id, full_name, store_slug, avatar_url, city_name, state_name")
          .in("id", topSellerIds)
          .not("store_slug", "is", null);

        const { data: verifications } = await adminClient
          .from("account_verifications")
          .select("user_id, verification_level, email_verified, phone_verified, identity_verified")
          .in("user_id", topSellerIds);

        const vMap: Record<string, any> = {};
        (verifications || []).forEach((v: any) => (vMap[v.user_id] = v));

        featured_sellers = (sellers || [])
          .filter((s: any) => s.store_slug)
          .map((s: any) => ({
            id: s.id,
            full_name: s.full_name,
            store_slug: s.store_slug,
            avatar_url: s.avatar_url,
            city_name: s.city_name,
            state_name: s.state_name,
            product_count: tally[s.id] || 0,
            verification_level: vMap[s.id]?.verification_level || "unverified",
            email_verified: vMap[s.id]?.email_verified || false,
            phone_verified: vMap[s.id]?.phone_verified || false,
            identity_verified: vMap[s.id]?.identity_verified || false,
          }))
          // Re-sort to preserve top-N ordering after filtering
          .sort((a, b) => b.product_count - a.product_count);
      }
    }

    return jsonResponse({
      products: shaped,
      categories,
      featured_sellers,
      total: count || 0,
      page,
      page_size: pageSize,
    });
  } catch (err) {
    console.error("marketplace error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
