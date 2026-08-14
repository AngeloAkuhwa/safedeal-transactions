import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { checkShowcaseCapacity } from "../_shared/showcase-slots.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
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

/**
 * Inline inventory-log helper. Writes a row to product_inventory_logs.
 * Idempotency-aware: if `dedupe_reference` is provided and a log with the
 * same (reference_type, reference_id, change_type) already exists, this
 * is a no-op.
 */
async function logInventoryChange(
  adminClient: any,
  params: {
    product_id: string;
    change_type: "restock" | "reserve" | "release" | "sold" | "manual_adjustment";
    quantity_delta: number;
    balance_after: number;
    reference_type?: string | null;
    reference_id?: string | null;
    notes?: string | null;
    changed_by_user_id?: string | null;
    dedupe_reference?: boolean;
  }
) {
  if (params.dedupe_reference && params.reference_type && params.reference_id) {
    const { data: existing } = await adminClient
      .from("product_inventory_logs")
      .select("id")
      .eq("product_id", params.product_id)
      .eq("change_type", params.change_type)
      .eq("reference_type", params.reference_type)
      .eq("reference_id", params.reference_id)
      .maybeSingle();
    if (existing) return;
  }

  await adminClient.from("product_inventory_logs").insert({
    product_id: params.product_id,
    change_type: params.change_type,
    quantity_delta: params.quantity_delta,
    balance_after: params.balance_after,
    reference_type: params.reference_type ?? null,
    reference_id: params.reference_id ?? null,
    notes: params.notes ?? null,
    changed_by_user_id: params.changed_by_user_id ?? null,
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

    const url = new URL(req.url);
    const productId = url.searchParams.get("product_id");
    if (!productId) {
      return jsonResponse({ error: "product_id is required" }, 400);
    }

    // Sub-route: GET ?product_id=...&logs=1 → inventory logs
    if (req.method === "GET" && url.searchParams.get("logs") === "1") {
      return await handleGetLogs(adminClient, userId, productId);
    }

    if (req.method === "GET") {
      return await handleGet(adminClient, userId, productId);
    }
    if (req.method === "PATCH") {
      return await handlePatch(adminClient, userId, productId, req);
    }
    if (req.method === "DELETE") {
      return await handleDelete(adminClient, userId, productId);
    }

    return jsonResponse({ error: "Method not allowed" }, 405);
  } catch (err) {
    console.error("seller-product-detail error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});

async function handleGet(adminClient: any, userId: string, productId: string) {
  const { data: product, error } = await adminClient
    .from("products")
    .select("*")
    .eq("id", productId)
    .eq("seller_id", userId)
    .single();

  if (error || !product) {
    return jsonResponse({ error: "Product not found" }, 404);
  }

  // Fetch media with file URLs
  const { data: media } = await adminClient
    .from("product_media")
    .select("id, file_id, media_type, sort_order, is_primary")
    .eq("product_id", productId)
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

  // Fetch category
  let category = null;
  if (product.category_id) {
    const { data: cat } = await adminClient
      .from("product_categories")
      .select("id, name, slug")
      .eq("id", product.category_id)
      .single();
    category = cat;
  }

  // Get store slug
  const { data: profileData } = await adminClient
    .from("profiles")
    .select("store_slug")
    .eq("id", userId)
    .single();

  // Parse delivery_methods from JSON string
  let delivery_methods: string[] = [];
  if (product.delivery_method) {
    try { delivery_methods = JSON.parse(product.delivery_method); } catch { delivery_methods = [product.delivery_method]; }
  }

  return jsonResponse({
    product: {
      ...product,
      delivery_methods,
      media: enrichedMedia,
      category,
      store_slug: profileData?.store_slug || null,
    },
  });
}

async function handleGetLogs(adminClient: any, userId: string, productId: string) {
  // Verify ownership first
  const { data: product } = await adminClient
    .from("products")
    .select("id, seller_id")
    .eq("id", productId)
    .eq("seller_id", userId)
    .maybeSingle();

  if (!product) return jsonResponse({ error: "Product not found" }, 404);

  const { data: logs, error } = await adminClient
    .from("product_inventory_logs")
    .select("id, change_type, quantity_delta, balance_after, reference_type, reference_id, notes, created_at, changed_by_user_id")
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("inventory logs fetch error:", error);
    return jsonResponse({ error: "Failed to load inventory logs" }, 500);
  }

  return jsonResponse({ logs: logs || [] });
}

async function handlePatch(adminClient: any, userId: string, productId: string, req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return jsonResponse({ error: "Invalid request body" }, 400);

  // Verify ownership
  const { data: existing } = await adminClient
    .from("products")
    .select("id, slug, status, seller_id, stock_quantity, reserved_quantity")
    .eq("id", productId)
    .eq("seller_id", userId)
    .single();

  if (!existing) {
    return jsonResponse({ error: "Product not found" }, 404);
  }

  // ─── Sub-action: restock ───
  if (body.action === "restock") {
    const delta = Math.floor(Number(body.delta) || 0);
    if (delta <= 0) return jsonResponse({ error: "delta must be a positive integer" }, 400);
    if (delta > 100000) return jsonResponse({ error: "delta too large (max 100000)" }, 400);

    const newStock = existing.stock_quantity + delta;

    const { error: updErr } = await adminClient
      .from("products")
      .update({ stock_quantity: newStock })
      .eq("id", productId);

    if (updErr) {
      console.error("restock update error:", updErr);
      return jsonResponse({ error: "Failed to restock" }, 500);
    }

    await logInventoryChange(adminClient, {
      product_id: productId,
      change_type: "restock",
      quantity_delta: delta,
      balance_after: newStock,
      reference_type: "manual_restock",
      notes: body.notes ? String(body.notes).slice(0, 500) : null,
      changed_by_user_id: userId,
    });

    return jsonResponse({
      success: true,
      stock_quantity: newStock,
      reserved_quantity: existing.reserved_quantity,
      available_quantity: newStock - existing.reserved_quantity,
    });
  }

  // ─── Sub-action: manual_adjustment (absolute set) ───
  if (body.action === "manual_adjustment") {
    const newStock = Math.max(0, Math.floor(Number(body.new_stock_quantity) ?? -1));
    if (Number.isNaN(newStock) || newStock < 0) {
      return jsonResponse({ error: "new_stock_quantity must be a non-negative integer" }, 400);
    }
    const delta = newStock - existing.stock_quantity;

    const { error: updErr } = await adminClient
      .from("products")
      .update({ stock_quantity: newStock })
      .eq("id", productId);

    if (updErr) {
      console.error("manual_adjustment update error:", updErr);
      return jsonResponse({ error: "Failed to adjust stock" }, 500);
    }

    await logInventoryChange(adminClient, {
      product_id: productId,
      change_type: "manual_adjustment",
      quantity_delta: delta,
      balance_after: newStock,
      reference_type: "manual_adjustment",
      notes: body.notes ? String(body.notes).slice(0, 500) : null,
      changed_by_user_id: userId,
    });

    return jsonResponse({
      success: true,
      stock_quantity: newStock,
      reserved_quantity: existing.reserved_quantity,
      available_quantity: newStock - existing.reserved_quantity,
    });
  }

  // ─── Default: standard product update ───
  const updateData: Record<string, unknown> = {};

  const textFields = [
    "title", "short_description", "description", "condition_label",
    "sku", "brand", "model", "seller_notes", "agreement_terms",
    "currency_code",
  ];

  // Handle delivery_methods array
  if (Array.isArray(body.delivery_methods)) {
    updateData.delivery_method = body.delivery_methods.length > 0 ? JSON.stringify(body.delivery_methods) : null;
  }

  for (const field of textFields) {
    if (body[field] !== undefined) {
      updateData[field] = body[field] ? String(body[field]).trim() : null;
    }
  }

  if (body.category_id !== undefined) updateData.category_id = body.category_id || null;
  if (body.unit_price !== undefined) updateData.unit_price = Number(body.unit_price);

  // Track stock_quantity change for inventory log
  let stockDelta = 0;
  let newStockAfter = existing.stock_quantity;
  if (body.stock_quantity !== undefined) {
    const newStock = Math.max(0, parseInt(body.stock_quantity) || 0);
    updateData.stock_quantity = newStock;
    stockDelta = newStock - existing.stock_quantity;
    newStockAfter = newStock;
  }

  if (body.visibility_type !== undefined) updateData.visibility_type = body.visibility_type;
  if (body.verification_window_hours !== undefined) updateData.verification_window_hours = body.verification_window_hours;

  // Handle status transitions
  if (body.status !== undefined && body.status !== existing.status) {
    const validTransitions: Record<string, string[]> = {
      draft: ["published"],
      published: ["draft", "out_of_stock", "archived"],
      out_of_stock: ["published", "archived"],
      archived: ["draft"],
    };

    const allowed = validTransitions[existing.status] || [];
    if (!allowed.includes(body.status)) {
      return jsonResponse({ error: `Cannot transition from ${existing.status} to ${body.status}` }, 400);
    }

    updateData.status = body.status;
    if (body.status === "published" && existing.status !== "published") {
      updateData.published_at = new Date().toISOString();
    }
    if (body.status === "archived") {
      updateData.archived_at = new Date().toISOString();
    }
  }

  // Handle slug change if title changed
  if (body.title && body.title.trim() !== existing.title) {
    let baseSlug = slugify(body.title.trim());
    if (!baseSlug) baseSlug = "product";
    let slug = baseSlug;
    let attempt = 0;

    while (true) {
      const { data: dup } = await adminClient
        .from("products")
        .select("id")
        .eq("seller_id", userId)
        .eq("slug", slug)
        .neq("id", productId)
        .maybeSingle();

      if (!dup) break;
      attempt++;
      slug = `${baseSlug}-${attempt + 1}`;
      if (attempt > 20) { slug = `${baseSlug}-${Date.now()}`; break; }
    }
    updateData.slug = slug;
  }

  // Handle media updates
  if (Array.isArray(body.file_ids)) {
    // Showcase-slot enforcement (vendor plan). The images already attached to
    // THIS product are freed by the edit, so they don't count against the cap.
    const incomingImages = body.file_ids.filter(
      (f: any) => (typeof f === "object" ? (f.media_type ?? "image") : "image") === "image",
    ).length;
    const { count: currentImages } = await adminClient
      .from("product_media")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId)
      .eq("media_type", "image");
    if (incomingImages > 0) {
      const capacity = await checkShowcaseCapacity(adminClient, userId, incomingImages, currentImages ?? 0);
      if (!capacity.allowed) {
        return jsonResponse({
          error: capacity.message,
          code: "showcase_slot_limit",
          showcase_slots: capacity.state,
        }, 403);
      }
    }

    // Delete existing media
    await adminClient.from("product_media").delete().eq("product_id", productId);

    if (body.file_ids.length > 0) {
      const mediaRows = body.file_ids.map((fid: any, idx: number) => ({
        product_id: productId,
        file_id: typeof fid === "string" ? fid : fid.file_id,
        media_type: (typeof fid === "object" && fid.media_type) || "image",
        sort_order: idx,
        is_primary: idx === 0,
      }));

      await adminClient.from("product_media").insert(mediaRows);

      const ids = mediaRows.map((r: any) => r.file_id);
      await adminClient.from("files").update({ is_temporary: false }).in("id", ids);
    }
  }

  if (Object.keys(updateData).length > 0) {
    const { error: updateError } = await adminClient
      .from("products")
      .update(updateData)
      .eq("id", productId);

    if (updateError) {
      console.error("Product update error:", updateError);
      return jsonResponse({ error: "Failed to update product" }, 500);
    }

    // Log manual stock change made via the standard edit form
    if (stockDelta !== 0) {
      await logInventoryChange(adminClient, {
        product_id: productId,
        change_type: "manual_adjustment",
        quantity_delta: stockDelta,
        balance_after: newStockAfter,
        reference_type: "product_edit",
        notes: "Stock adjusted via product edit form",
        changed_by_user_id: userId,
      });
    }
  }

  return jsonResponse({ success: true, slug: updateData.slug || existing.slug });
}

async function handleDelete(adminClient: any, userId: string, productId: string) {
  const { error } = await adminClient
    .from("products")
    .update({ is_active: false, status: "archived", archived_at: new Date().toISOString() })
    .eq("id", productId)
    .eq("seller_id", userId);

  if (error) {
    console.error("Product delete error:", error);
    return jsonResponse({ error: "Failed to archive product" }, 500);
  }

  return jsonResponse({ success: true });
}
