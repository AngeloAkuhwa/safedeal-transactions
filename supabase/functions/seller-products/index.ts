import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { checkShowcaseCapacity } from "../_shared/showcase-slots.ts";

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

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 80);
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

    const { data: userData, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !userData?.user) {
      return jsonResponse({ error: "Invalid session" }, 401);
    }
    const userId = userData.user.id;

    const { data: hasRole } = await adminClient.rpc("has_role", {
      _user_id: userId,
      _role: "seller",
    });
    if (!hasRole) {
      return jsonResponse({ error: "Seller role required" }, 403);
    }

    if (req.method === "POST") {
      // Peek at body to route between create and duplicate
      const cloned = req.clone();
      const peek = await cloned.json().catch(() => null);
      if (peek && peek.action === "duplicate") {
        return await handleDuplicate(adminClient, userId, peek);
      }
      // Replay original handler with the parsed body
      return await handleCreate(adminClient, userId, peek);
    }

    if (req.method === "GET") {
      return await handleList(adminClient, userId, req);
    }

    return jsonResponse({ error: "Method not allowed" }, 405);
  } catch (err) {
    console.error("seller-products error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});

async function handleCreate(adminClient: any, userId: string, body: any) {
  if (!body) return jsonResponse({ error: "Invalid request body" }, 400);

  const {
    title, category_id, short_description, description, condition_label,
    sku, brand, model, currency_code, unit_price, original_price, stock_quantity,
    visibility_type, seller_notes, agreement_terms, delivery_methods,
    verification_window_hours, file_ids, status: requestedStatus,
    feature_highlights, delivery_scope, estimated_delivery_days,
  } = body;

  if (!title || typeof title !== "string" || title.trim().length < 2) {
    return jsonResponse({ error: "Title is required (min 2 characters)" }, 400);
  }
  if (!description || typeof description !== "string" || description.trim().length < 10) {
    return jsonResponse({ error: "Description is required (min 10 characters)" }, 400);
  }
  if (unit_price == null || isNaN(Number(unit_price)) || Number(unit_price) <= 0) {
    return jsonResponse({ error: "Valid unit price is required" }, 400);
  }

  // Generate slug with collision handling
  let baseSlug = slugify(title.trim());
  if (!baseSlug) baseSlug = "product";
  let slug = baseSlug;
  let attempt = 0;

  while (true) {
    const { data: existing } = await adminClient
      .from("products")
      .select("id")
      .eq("seller_id", userId)
      .eq("slug", slug)
      .maybeSingle();

    if (!existing) break;
    attempt++;
    slug = `${baseSlug}-${attempt + 1}`;
    if (attempt > 20) {
      slug = `${baseSlug}-${Date.now()}`;
      break;
    }
  }

  // Auto-generate store_slug if missing
  const { data: profile } = await adminClient
    .from("profiles")
    .select("store_slug, full_name")
    .eq("id", userId)
    .single();

  if (!profile?.store_slug) {
    let storeSlug = slugify(profile?.full_name || "store");
    if (!storeSlug) storeSlug = "store";
    let storeAttempt = 0;

    while (true) {
      const { data: existing } = await adminClient
        .from("profiles")
        .select("id")
        .eq("store_slug", storeSlug)
        .maybeSingle();

      if (!existing) break;
      storeAttempt++;
      storeSlug = `${slugify(profile?.full_name || "store")}-${storeAttempt + 1}`;
      if (storeAttempt > 20) {
        storeSlug = `store-${Date.now()}`;
        break;
      }
    }

    await adminClient
      .from("profiles")
      .update({ store_slug: storeSlug })
      .eq("id", userId);
  }

  const finalStatus = requestedStatus === "published" ? "published" : "draft";

  // ── Media publish gate ──
  // Draft saving is ALWAYS allowed regardless of media state. Only a publish
  // must satisfy the configured minimum/maximum media counts. Products that
  // already exist are untouched by this path.
  if (finalStatus === "published") {
    const { loadMediaConfig } = await import("../_shared/media-config.ts");
    const { validateProductMediaForPublish } = await import("../_shared/media-rules.ts");
    const mediaCfg = await loadMediaConfig();
    const linked = Array.isArray(file_ids) ? file_ids : [];
    const images = linked.filter((f: any) => (typeof f === "object" ? f.media_type !== "video" : true)).length;
    const videos = linked.filter((f: any) => typeof f === "object" && f.media_type === "video").length;
    const check = validateProductMediaForPublish({ images, videos }, mediaCfg);
    if (!check.ok) {
      return jsonResponse({
        error: check.errors.map((e: any) => e.message).join(" "),
        code: "media_publish_requirements",
        issues: check.errors,
      }, 400);
    }
    // Every linked file must belong to this seller.
    const fileIds = linked.map((f: any) => (typeof f === "string" ? f : f.file_id));
    if (fileIds.length > 0) {
      const { data: ownedFiles } = await adminClient
        .from("files")
        .select("id")
        .in("id", fileIds)
        .eq("uploaded_by_user_id", userId);
      if ((ownedFiles?.length ?? 0) !== fileIds.length) {
        return jsonResponse({ error: "One or more media files are not yours.", code: "media_ownership" }, 403);
      }
    }
  }

  // Showcase-slot enforcement (vendor plan). Authoritative, server-side.
  const incomingImages = Array.isArray(file_ids)
    ? file_ids.filter((f: any) => (typeof f === "object" ? (f.media_type ?? "image") : "image") === "image").length
    : 0;
  if (incomingImages > 0) {
    const capacity = await checkShowcaseCapacity(adminClient, userId, incomingImages);
    if (!capacity.allowed) {
      return jsonResponse({
        error: capacity.message,
        code: "showcase_slot_limit",
        showcase_slots: capacity.state,
      }, 403);
    }
  }

  const productData: Record<string, unknown> = {
    seller_id: userId,
    title: title.trim(),
    slug,
    description: description.trim(),
    currency_code: currency_code || "NGN",
    unit_price: Number(unit_price),
    stock_quantity: Math.max(0, parseInt(stock_quantity) || 0),
    visibility_type: visibility_type || "public",
    status: finalStatus,
    is_active: true,
  };

  if (category_id) productData.category_id = category_id;
  if (short_description) productData.short_description = short_description.trim();
  if (condition_label) productData.condition_label = condition_label.trim();
  if (sku) productData.sku = sku.trim();
  if (brand) productData.brand = brand.trim();
  if (model) productData.model = model.trim();
  if (seller_notes) productData.seller_notes = seller_notes.trim();
  if (agreement_terms) productData.agreement_terms = agreement_terms.trim();
  if (Array.isArray(delivery_methods) && delivery_methods.length > 0) productData.delivery_method = JSON.stringify(delivery_methods);
  if (verification_window_hours != null) productData.verification_window_hours = parseInt(verification_window_hours);
  if (Array.isArray(feature_highlights)) productData.feature_highlights = feature_highlights;
  if (delivery_scope) productData.delivery_scope = delivery_scope.trim();
  if (estimated_delivery_days) productData.estimated_delivery_days = estimated_delivery_days.trim();
  if (original_price != null && !isNaN(Number(original_price)) && Number(original_price) > 0) productData.original_price = Number(original_price);
  if (finalStatus === "published") productData.published_at = new Date().toISOString();

  const { data: product, error: insertError } = await adminClient
    .from("products")
    .insert(productData)
    .select("id, slug")
    .single();

  if (insertError) {
    console.error("Product insert error:", insertError);
    return jsonResponse({ error: "Failed to create product" }, 500);
  }

  // Link media files
  if (Array.isArray(file_ids) && file_ids.length > 0) {
    const mediaRows = file_ids.map((fid: { file_id: string; media_type?: string }, idx: number) => ({
      product_id: product.id,
      file_id: typeof fid === "string" ? fid : fid.file_id,
      media_type: (typeof fid === "object" && fid.media_type) || "image",
      sort_order: idx,
      is_primary: idx === 0,
    }));

    await adminClient.from("product_media").insert(mediaRows);

    // Mark files as non-temporary
    const ids = mediaRows.map((r: any) => r.file_id);
    await adminClient
      .from("files")
      .update({ is_temporary: false })
      .in("id", ids);
  }

  return jsonResponse({ product_id: product.id, slug: product.slug }, 201);
}

async function handleList(adminClient: any, userId: string, req: Request) {
  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status") || "all";
  const visibilityFilter = url.searchParams.get("visibility") || "all";
  const categoryFilter = url.searchParams.get("category") || "all";
  const search = (url.searchParams.get("search") || "").trim().toLowerCase();
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
  const pageSize = 20;
  const offset = (page - 1) * pageSize;

  // Build product list query
  let query = adminClient
    .from("products")
    .select(`
      id, title, slug, short_description, unit_price, currency_code,
      stock_quantity, reserved_quantity, status, visibility_type, is_active,
      category_id, published_at, created_at, updated_at
    `, { count: "exact" })
    .eq("seller_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (statusFilter !== "all") {
    query = query.eq("status", statusFilter);
  }
  if (visibilityFilter !== "all") {
    query = query.eq("visibility_type", visibilityFilter);
  }
  if (categoryFilter !== "all") {
    query = query.eq("category_id", categoryFilter);
  }
  if (search) {
    query = query.or(`title.ilike.%${search}%,short_description.ilike.%${search}%`);
  }

  // Run product query + trust summary queries in parallel
  const [
    productsResult,
    verificationResult,
    publishedCountResult,
    profileResult,
  ] = await Promise.all([
    query,
    adminClient
      .from("account_verifications")
      .select("verification_level, identity_verified")
      .eq("user_id", userId)
      .maybeSingle(),
    adminClient
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("seller_id", userId)
      .eq("status", "published")
      .eq("is_active", true),
    adminClient
      .from("profiles")
      .select("store_slug")
      .eq("id", userId)
      .maybeSingle(),
  ]);

  const { data: products, error, count } = productsResult;
  if (error) {
    console.error("Products list error:", error);
    return jsonResponse({ error: "Failed to load products" }, 500);
  }

  // Fetch primary media for each product
  const productIds = (products || []).map((p: any) => p.id);
  let mediaMap: Record<string, any> = {};

  if (productIds.length > 0) {
    const { data: mediaRows } = await adminClient
      .from("product_media")
      .select("product_id, file_id, media_type, is_primary, sort_order")
      .in("product_id", productIds)
      .eq("is_primary", true);

    if (mediaRows) {
      for (const m of mediaRows) {
        mediaMap[m.product_id] = m;
      }
    }

    // Fetch file URLs for primary media
    const fileIds = Object.values(mediaMap).map((m: any) => m.file_id);
    if (fileIds.length > 0) {
      const { data: files } = await adminClient
        .from("files")
        .select("id, file_url, secure_url")
        .in("id", fileIds);

      if (files) {
        const fileUrlMap: Record<string, string> = {};
        for (const f of files) {
          fileUrlMap[f.id] = f.secure_url || f.file_url;
        }
        for (const pid of Object.keys(mediaMap)) {
          mediaMap[pid].file_url = fileUrlMap[mediaMap[pid].file_id] || null;
        }
      }
    }
  }

  // Fetch category names for all products
  const categoryIds = [...new Set((products || []).map((p: any) => p.category_id).filter(Boolean))];
  let categoryMap: Record<string, string> = {};
  if (categoryIds.length > 0) {
    const { data: categories } = await adminClient
      .from("product_categories")
      .select("id, name")
      .in("id", categoryIds);
    if (categories) {
      for (const c of categories) categoryMap[c.id] = c.name;
    }
  }

  const enriched = (products || []).map((p: any) => ({
    ...p,
    primary_image_url: mediaMap[p.id]?.file_url || null,
    category_name: p.category_id ? categoryMap[p.category_id] || null : null,
  }));

  // Build trust_summary from DB data
  const trustSummary = {
    verification_level: verificationResult.data?.verification_level || "unverified",
    identity_verified: verificationResult.data?.identity_verified === true,
    published_count: publishedCountResult.count || 0,
    rating: null, // No reviews table yet
    review_count: 0,
  };

  return jsonResponse({
    products: enriched,
    total: count || 0,
    page,
    page_size: pageSize,
    store_slug: profileResult.data?.store_slug || null,
    trust_summary: trustSummary,
  });
}

async function handleDuplicate(adminClient: any, userId: string, body: any) {
  const productId = body.product_id;
  if (!productId || typeof productId !== "string") {
    return jsonResponse({ error: "product_id is required" }, 400);
  }

  // Load source product, scoped to seller
  const { data: src, error: srcErr } = await adminClient
    .from("products")
    .select("*")
    .eq("id", productId)
    .eq("seller_id", userId)
    .maybeSingle();
  if (srcErr || !src) {
    return jsonResponse({ error: "Product not found" }, 404);
  }

  // Generate unique slug honouring UNIQUE(seller_id, slug)
  const baseSlug = `${src.slug ?? slugify(src.title ?? "product")}-copy`.substring(0, 80);
  let slug = baseSlug;
  let attempt = 0;
  while (true) {
    const { data: existing } = await adminClient
      .from("products")
      .select("id")
      .eq("seller_id", userId)
      .eq("slug", slug)
      .maybeSingle();
    if (!existing) break;
    attempt++;
    slug = `${baseSlug}-${attempt + 1}`.substring(0, 80);
    if (attempt > 50) {
      slug = `${baseSlug}-${Date.now()}`.substring(0, 80);
      break;
    }
  }

  // Build new product row by copying safe fields and resetting lifecycle ones
  const carryFields = [
    "category_id", "short_description", "description", "currency_code",
    "unit_price", "original_price", "stock_quantity",
    "condition_label", "sku", "brand", "model",
    "seller_notes", "agreement_terms",
    "delivery_method", "delivery_scope", "estimated_delivery_days",
    "verification_window_hours", "visibility_type", "feature_highlights",
  ];
  const newRow: Record<string, unknown> = {
    seller_id: userId,
    title: `${src.title ?? "Untitled"} Copy`,
    slug,
    status: "draft",
    is_active: false,
    reserved_quantity: 0,
    published_at: null,
    archived_at: null,
  };
  for (const f of carryFields) {
    if (src[f] !== undefined && src[f] !== null) newRow[f] = src[f];
  }

  const { data: created, error: insErr } = await adminClient
    .from("products")
    .insert(newRow)
    .select("id, slug")
    .single();
  if (insErr) {
    console.error("Duplicate insert error:", insErr);
    return jsonResponse({ error: "Failed to duplicate product" }, 500);
  }

  // Clone product_media (point new rows at the same file_id. Files are immutable)
  const { data: mediaRows } = await adminClient
    .from("product_media")
    .select("file_id, media_type, sort_order, is_primary")
    .eq("product_id", productId);
  if (mediaRows && mediaRows.length > 0) {
    const cloned = mediaRows.map((m: any) => ({
      product_id: created.id,
      file_id: m.file_id,
      media_type: m.media_type,
      sort_order: m.sort_order,
      is_primary: m.is_primary,
    }));
    const { error: mediaErr } = await adminClient.from("product_media").insert(cloned);
    if (mediaErr) console.error("Duplicate media insert error:", mediaErr);
  }


  return jsonResponse({ id: created.id, slug: created.slug }, 201);
}
