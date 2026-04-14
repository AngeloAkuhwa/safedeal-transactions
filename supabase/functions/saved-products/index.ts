import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const userId = user.id;

    // ── GET ──
    if (req.method === "GET") {
      const url = new URL(req.url);
      const checkId = url.searchParams.get("check");

      // Lightweight single-product check
      if (checkId) {
        const { data } = await admin
          .from("saved_products")
          .select("id")
          .eq("buyer_id", userId)
          .eq("product_id", checkId)
          .maybeSingle();
        return json({ saved: !!data });
      }

      // Bulk check: return array of saved product_ids
      const idsOnly = url.searchParams.get("ids_only");
      if (idsOnly === "true") {
        const { data, error } = await admin
          .from("saved_products")
          .select("product_id")
          .eq("buyer_id", userId);
        if (error) return json({ error: error.message }, 500);
        return json({ product_ids: (data || []).map((r: any) => r.product_id) });
      }

      // Full enriched list
      const { data: saved, error: savedErr } = await admin
        .from("saved_products")
        .select("id, product_id, created_at")
        .eq("buyer_id", userId)
        .order("created_at", { ascending: false });

      if (savedErr) return json({ error: savedErr.message }, 500);
      if (!saved || saved.length === 0) return json({ items: [], count: 0 });

      const productIds = saved.map((s: any) => s.product_id);

      // Products
      const { data: products } = await admin
        .from("products")
        .select("id, title, slug, short_description, unit_price, currency_code, stock_quantity, condition_label, category_id, seller_id, is_active, status")
        .in("id", productIds);

      // Primary images
      const { data: media } = await admin
        .from("product_media")
        .select("product_id, file_id")
        .in("product_id", productIds)
        .eq("is_primary", true);

      const fileIds = (media || []).map((m: any) => m.file_id);
      let fileMap: Record<string, string> = {};
      if (fileIds.length) {
        const { data: files } = await admin.from("files").select("id, file_url").in("id", fileIds);
        (files || []).forEach((f: any) => { fileMap[f.id] = f.file_url; });
      }

      const mediaMap: Record<string, string | null> = {};
      (media || []).forEach((m: any) => {
        mediaMap[m.product_id] = fileMap[m.file_id] || null;
      });

      // Seller profiles
      const sellerIds = [...new Set((products || []).map((p: any) => p.seller_id))];
      let sellerMap: Record<string, any> = {};
      if (sellerIds.length) {
        const { data: profiles } = await admin
          .from("profiles")
          .select("id, full_name, store_slug, avatar_url")
          .in("id", sellerIds);
        const { data: verifs } = await admin
          .from("account_verifications")
          .select("user_id, email_verified, phone_verified, identity_verified, verification_level")
          .in("user_id", sellerIds);
        const verifMap: Record<string, any> = {};
        (verifs || []).forEach((v: any) => { verifMap[v.user_id] = v; });
        (profiles || []).forEach((p: any) => {
          const v = verifMap[p.id] || {};
          sellerMap[p.id] = {
            full_name: p.full_name,
            store_slug: p.store_slug,
            avatar_url: p.avatar_url,
            trust_summary: {
              verification_level: v.verification_level || "unverified",
              email_verified: v.email_verified || false,
              phone_verified: v.phone_verified || false,
              identity_verified: v.identity_verified || false,
            },
          };
        });
      }

      // Categories
      const catIds = [...new Set((products || []).filter((p: any) => p.category_id).map((p: any) => p.category_id))];
      let catMap: Record<string, any> = {};
      if (catIds.length) {
        const { data: cats } = await admin.from("product_categories").select("id, name, slug").in("id", catIds);
        (cats || []).forEach((c: any) => { catMap[c.id] = c; });
      }

      // Assemble
      const productMap: Record<string, any> = {};
      (products || []).forEach((p: any) => { productMap[p.id] = p; });

      const items = saved.map((s: any) => {
        const p = productMap[s.product_id];
        if (!p) return null;
        return {
          saved_id: s.id,
          saved_at: s.created_at,
          id: p.id,
          title: p.title,
          slug: p.slug,
          short_description: p.short_description,
          unit_price: p.unit_price,
          currency_code: p.currency_code,
          stock_quantity: p.stock_quantity,
          condition_label: p.condition_label,
          is_active: p.is_active,
          status: p.status,
          primary_image_url: mediaMap[p.id] || null,
          category: p.category_id ? catMap[p.category_id] || null : null,
          seller: sellerMap[p.seller_id] || { full_name: "Unknown", store_slug: null, avatar_url: null, trust_summary: {} },
        };
      }).filter(Boolean);

      return json({ items, count: items.length });
    }

    // ── POST (save) ──
    if (req.method === "POST") {
      const { product_id } = await req.json();
      if (!product_id) return json({ error: "product_id required" }, 400);

      const { error } = await admin
        .from("saved_products")
        .upsert({ buyer_id: userId, product_id }, { onConflict: "buyer_id,product_id" });

      if (error) return json({ error: error.message }, 500);
      return json({ saved: true });
    }

    // ── DELETE (unsave) ──
    if (req.method === "DELETE") {
      const { product_id } = await req.json();
      if (!product_id) return json({ error: "product_id required" }, 400);

      const { error } = await admin
        .from("saved_products")
        .delete()
        .eq("buyer_id", userId)
        .eq("product_id", product_id);

      if (error) return json({ error: error.message }, 500);
      return json({ saved: false });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
