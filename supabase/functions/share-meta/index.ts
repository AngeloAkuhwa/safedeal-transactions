// PUBLIC, unauthenticated: serves crawler-friendly OG HTML for public
// storefronts and published public products. It exposes ONLY data that is
// already visible on the public storefront pages (store name, product title,
// price, image). Never emails, phones or any private field.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  GENERIC_META,
  buildProductMeta,
  buildStoreMeta,
  renderShareHtml,
} from "../_shared/share-meta.ts";

const baseHeaders = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "public, max-age=300, s-maxage=300",
  "Access-Control-Allow-Origin": "*",
  "X-Content-Type-Options": "nosniff",
};

function html(body: string, status = 200) {
  return new Response(body, { status, headers: baseHeaders });
}

/** Unknown / private / unpublished → generic SafeDeal page. No leak, no 404. */
function generic() {
  return html(renderShareHtml(GENERIC_META));
}

async function primaryImage(admin: any, productIds: string[]): Promise<Record<string, string>> {
  if (productIds.length === 0) return {};
  const { data: media } = await admin
    .from("product_media")
    .select("product_id, file_id, is_primary, sort_order")
    .in("product_id", productIds)
    .order("sort_order", { ascending: true });
  if (!media || media.length === 0) return {};
  const fileIds = media.map((m: any) => m.file_id);
  const { data: files } = await admin
    .from("files")
    .select("id, file_url, secure_url")
    .in("id", fileIds);
  const fileUrls: Record<string, string> = {};
  for (const f of files || []) fileUrls[f.id] = f.secure_url || f.file_url;
  const out: Record<string, string> = {};
  for (const m of media) {
    const url = fileUrls[m.file_id];
    if (!url) continue;
    if (!out[m.product_id] || m.is_primary) out[m.product_id] = url;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: baseHeaders });
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    return generic();
  }

  try {
    const url = new URL(req.url);
    const type = url.searchParams.get("type");
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (type === "store") {
      const slug = (url.searchParams.get("slug") || "").trim();
      if (!slug) return generic();

      const { data: seller } = await admin
        .from("profiles")
        .select("id, full_name, avatar_url, store_slug, vendor_status")
        .eq("store_slug", slug)
        .maybeSingle();

      if (!seller || (seller.vendor_status && seller.vendor_status !== "active")) return generic();

      const { data: products, count } = await admin
        .from("products")
        .select("id, created_at", { count: "exact" })
        .eq("seller_id", seller.id)
        .eq("status", "published")
        .eq("visibility_type", "public")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1);

      const images = await primaryImage(admin, (products || []).map((p: any) => p.id));
      const cover = Object.values(images)[0] || seller.avatar_url || null;

      const { data: verification } = await admin
        .from("account_verifications")
        .select("identity_verified")
        .eq("user_id", seller.id)
        .maybeSingle();

      return html(
        renderShareHtml(
          buildStoreMeta({
            storeName: seller.full_name || "SafeDeal Store",
            slug,
            productCount: count || 0,
            imageUrl: cover,
            verified: !!verification?.identity_verified,
          }),
        ),
      );
    }

    if (type === "product") {
      const storeSlug = (url.searchParams.get("store") || "").trim();
      const productSlug = (url.searchParams.get("slug") || "").trim();
      if (!storeSlug || !productSlug) return generic();

      const { data: seller } = await admin
        .from("profiles")
        .select("id, full_name, store_slug, vendor_status")
        .eq("store_slug", storeSlug)
        .maybeSingle();
      if (!seller || (seller.vendor_status && seller.vendor_status !== "active")) return generic();

      const { data: product } = await admin
        .from("products")
        .select("id, title, slug, unit_price, currency_code")
        .eq("seller_id", seller.id)
        .eq("slug", productSlug)
        .eq("status", "published")
        .eq("visibility_type", "public")
        .eq("is_active", true)
        .maybeSingle();
      if (!product) return generic();

      const images = await primaryImage(admin, [product.id]);

      return html(
        renderShareHtml(
          buildProductMeta({
            title: product.title,
            priceMajor: Number(product.unit_price) || 0,
            currencyCode: product.currency_code,
            storeName: seller.full_name,
            storeSlug,
            productSlug,
            imageUrl: images[product.id] || null,
          }),
        ),
      );
    }

    return generic();
  } catch (err) {
    console.error("share-meta error:", err);
    return generic();
  }
});
