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
    const productSlug = url.searchParams.get("product_slug");

    if (!sellerSlug || !productSlug) {
      return jsonResponse({ error: "seller_slug and product_slug are required" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Get seller
    const { data: seller } = await adminClient
      .from("profiles")
      .select("id, full_name, avatar_url, store_slug")
      .eq("store_slug", sellerSlug)
      .single();

    if (!seller) {
      return jsonResponse({ error: "Store not found" }, 404);
    }

    // Get product
    const { data: product } = await adminClient
      .from("products")
      .select("*")
      .eq("seller_id", seller.id)
      .eq("slug", productSlug)
      .eq("status", "published")
      .eq("visibility_type", "public")
      .eq("is_active", true)
      .single();

    if (!product) {
      return jsonResponse({ error: "Product not found" }, 404);
    }

    // Get all media
    const { data: media } = await adminClient
      .from("product_media")
      .select("id, file_id, media_type, sort_order, is_primary")
      .eq("product_id", product.id)
      .order("sort_order", { ascending: true });

    const fileIds = (media || []).map((m: any) => m.file_id);
    let fileMap: Record<string, any> = {};
    if (fileIds.length > 0) {
      const { data: files } = await adminClient
        .from("files")
        .select("id, file_url, secure_url, original_file_name, mime_type")
        .in("id", fileIds);
      if (files) {
        for (const f of files) fileMap[f.id] = f;
      }
    }

    const enrichedMedia = (media || []).map((m: any) => ({
      ...m,
      file_url: fileMap[m.file_id]?.secure_url || fileMap[m.file_id]?.file_url || null,
      original_file_name: fileMap[m.file_id]?.original_file_name || null,
      mime_type: fileMap[m.file_id]?.mime_type || null,
    }));

    // Get category
    let category = null;
    if (product.category_id) {
      const { data: cat } = await adminClient
        .from("product_categories")
        .select("id, name, slug")
        .eq("id", product.category_id)
        .single();
      category = cat;
    }

    // Get seller verification
    const { data: verification } = await adminClient
      .from("account_verifications")
      .select("verification_level, email_verified, phone_verified, identity_verified")
      .eq("user_id", seller.id)
      .single();

    return jsonResponse({
      product: {
        id: product.id,
        title: product.title,
        slug: product.slug,
        short_description: product.short_description,
        description: product.description,
        condition_label: product.condition_label,
        brand: product.brand,
        model: product.model,
        currency_code: product.currency_code,
        unit_price: product.unit_price,
        stock_quantity: product.stock_quantity,
        agreement_terms: product.agreement_terms,
        delivery_method: product.delivery_method,
        verification_window_hours: product.verification_window_hours,
        published_at: product.published_at,
        media: enrichedMedia,
        category,
      },
      seller: {
        full_name: seller.full_name,
        avatar_url: seller.avatar_url,
        store_slug: seller.store_slug,
        verification_level: verification?.verification_level || "unverified",
        email_verified: verification?.email_verified || false,
        phone_verified: verification?.phone_verified || false,
        identity_verified: verification?.identity_verified || false,
      },
    });
  } catch (err) {
    console.error("public-product-detail error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
