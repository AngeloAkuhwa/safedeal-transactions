import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { computePricing } from "../_shared/pricing.ts";

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

function generateShareToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  for (const b of bytes) result += chars[b % chars.length];
  return result;
}

function generateOfferToken(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let result = "";
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  for (const b of bytes) result += chars[b % chars.length];
  return result;
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
    if (!hasRole) return jsonResponse({ error: "Seller role required" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    if (action === "save_draft") return await handleSaveDraft(adminClient, userId, body);
    if (action === "publish") return await handlePublish(adminClient, userId, body);
    return jsonResponse({ error: "Invalid action" }, 400);
  } catch (err) {
    console.error("create-transaction error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SAVE DRAFT — preserved for backward compatibility (single-item wizard draft).
// Multi-item items are kept in the wizard and serialized at publish time.
// ─────────────────────────────────────────────────────────────────────────────
async function handleSaveDraft(adminClient: any, userId: string, body: any) {
  let transactionId = body.transaction_id as string | undefined;
  const buyerName = (body.buyer_name as string) ?? "";
  const buyerContact = (body.buyer_contact as string) ?? "";
  const itemTitle = (body.item_title as string) ?? "";
  const itemDescription = (body.item_description as string) ?? "";
  const itemQuantity = (body.item_quantity as number) ?? 1;
  const itemCondition = (body.item_condition as string) ?? "brand_new";
  const price = (body.price as number) ?? 0;
  const currencyCode = (body.currency_code as string) ?? "NGN";
  const deliveryMethod = (body.delivery_method as string) ?? "courier";
  const expectedDeliveryDate = (body.expected_delivery_date as string) ?? "";
  const verificationWindowHours = (body.verification_window_hours as number) ?? 72;
  const sellerNotes = (body.seller_notes as string) ?? "";

  const isEmail = buyerContact.includes("@");
  const buyerEmail = isEmail ? buyerContact : null;
  const buyerPhone = !isEmail && buyerContact ? buyerContact : null;

  if (transactionId) {
    const { data: existing } = await adminClient
      .from("transactions")
      .select("id, status, seller_id")
      .eq("id", transactionId)
      .single();

    if (!existing || existing.seller_id !== userId || existing.status !== "draft") {
      return jsonResponse({ error: "Draft not found or not editable" }, 404);
    }

    await adminClient
      .from("transactions")
      .update({
        buyer_contact_email: buyerEmail,
        buyer_contact_phone: buyerPhone,
      })
      .eq("id", transactionId);
  } else {
    const { data: codeData } = await adminClient.rpc("generate_transaction_code");
    const transactionCode = codeData ?? `SD-${Date.now()}`;
    const shareToken = generateShareToken();

    const { data: newTx, error: txError } = await adminClient
      .from("transactions")
      .insert({
        transaction_code: transactionCode,
        seller_id: userId,
        created_by_user_id: userId,
        buyer_contact_email: buyerEmail,
        buyer_contact_phone: buyerPhone,
        share_token: shareToken,
        status: "draft",
        money_status: "not_secured",
        dispute_status: "none",
      })
      .select("id")
      .single();

    if (txError || !newTx) {
      console.error("Failed to create draft tx:", txError);
      return jsonResponse({ error: "Failed to create draft" }, 500);
    }
    transactionId = newTx.id;
  }

  const pricing = computePricing(price, currencyCode);
  const fileIds = (body.file_ids as string[]) ?? [];

  await Promise.all([
    adminClient.from("transaction_participants").upsert(
      {
        transaction_id: transactionId,
        role: "buyer",
        display_name: buyerName || "Unknown Buyer",
        email: buyerEmail,
        phone: buyerPhone,
      },
      { onConflict: "transaction_id,role" },
    ),
    adminClient.from("transaction_participants").upsert(
      { transaction_id: transactionId, role: "seller", display_name: "", user_id: userId },
      { onConflict: "transaction_id,role" },
    ),
    upsertByTransaction(adminClient, "transaction_items", transactionId!, {
      title: itemTitle || "Untitled",
      description: itemDescription || "",
      quantity: itemQuantity,
      condition_label: itemCondition,
    }),
    upsertByTransaction(adminClient, "transaction_pricing", transactionId!, {
      currency_code: currencyCode,
      item_amount: price,
      platform_fee_amount: pricing.platform_fee_amount,
      processing_fee_amount: pricing.paystack_fee_amount,
      seller_net_amount: price - pricing.platform_fee_amount,
      buyer_total_amount: pricing.total_amount,
    }),
    expectedDeliveryDate
      ? upsertByTransaction(adminClient, "transaction_delivery_terms", transactionId!, {
          delivery_method: deliveryMethod,
          expected_delivery_date: expectedDeliveryDate,
          verification_window_hours: verificationWindowHours,
        })
      : Promise.resolve(),
    upsertByTransaction(adminClient, "transaction_notes", transactionId!, { seller_notes: sellerNotes }),
    ...(fileIds.length > 0
      ? [adminClient.from("files").update({ is_temporary: false }).in("id", fileIds).eq("uploaded_by_user_id", userId)]
      : []),
  ]);

  // Link uploaded files to the draft via transaction_media so they survive into product_media on publish
  if (fileIds.length > 0) {
    // Remove any previously-linked files no longer in the list
    await adminClient
      .from("transaction_media")
      .delete()
      .eq("transaction_id", transactionId)
      .not("file_id", "in", `(${fileIds.map((id) => `"${id}"`).join(",")})`);

    // Look up mime types so we can infer media_type
    const { data: filesMeta } = await adminClient
      .from("files")
      .select("id, mime_type")
      .in("id", fileIds);
    const mimeById = new Map<string, string>(
      (filesMeta || []).map((f: any) => [f.id as string, (f.mime_type as string) || ""]),
    );

    const mediaRows = fileIds.map((fid, idx) => {
      const mime = mimeById.get(fid) || "";
      const media_type = mime.startsWith("video/") ? "video" : "image";
      return {
        transaction_id: transactionId,
        file_id: fid,
        media_type,
        sort_order: idx,
      };
    });

    const { error: mediaErr } = await adminClient
      .from("transaction_media")
      .upsert(mediaRows, { onConflict: "transaction_id,file_id" });
    if (mediaErr) console.error("transaction_media upsert error:", mediaErr);
  }

  return jsonResponse({ transaction_id: transactionId });
}

const SELLER_LIMIT_BY_LEVEL: Record<string, number> = {
  unverified: 0,
  basic_verified: 200_000,
  trusted_buyer: 5_000_000,
  high_trust_buyer: Number.MAX_SAFE_INTEGER,
};

function mapConditionToProduct(c: string): string {
  const map: Record<string, string> = {
    brand_new: "brand_new",
    like_new: "like_new",
    excellent: "refurbished",
    good: "used_good",
    fair: "used_fair",
    used: "used_good",
  };
  return map[c] ?? "brand_new";
}

function mapDeliveryToProduct(m: string): string {
  const map: Record<string, string> = {
    courier: "courier_shipping",
    pickup: "pickup",
    meetup: "meetup",
    hand_delivery: "hand_delivery",
  };
  return map[m] ?? "courier_shipping";
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLISH — creates products + offer + offer_items. NO transaction created.
//
// Body shape (multi-item):
//   {
//     action: "publish",
//     transaction_id: <draft id, used to read shared fields>,
//     expires_in_days?: number,
//     items?: [{ title, description, quantity, condition, price, file_ids[] }]
//   }
//
// If `items` is missing, falls back to the single transaction_items row from
// the legacy draft for backwards compatibility.
// ─────────────────────────────────────────────────────────────────────────────
async function handlePublish(adminClient: any, userId: string, body: any) {
  const draftId = body.transaction_id as string;
  const expiresInDays = Math.max(1, Math.min(365, parseInt(body.expires_in_days) || 7));

  if (!draftId) {
    return jsonResponse({ error: "transaction_id required" }, 400);
  }

  // The draft transaction is used as a staging container only. We read shared
  // fields off it and then DELETE it (no dormant transactions).
  const { data: draft } = await adminClient
    .from("transactions")
    .select("id, status, seller_id, buyer_contact_email, buyer_contact_phone")
    .eq("id", draftId)
    .single();

  if (!draft || draft.seller_id !== userId) {
    return jsonResponse({ error: "Draft not found" }, 404);
  }
  if (draft.status !== "draft") {
    return jsonResponse({ error: "Draft already published" }, 400);
  }

  // Verify seller is allowed to publish
  const { data: sellerVerif } = await adminClient
    .from("account_verifications")
    .select("verification_level")
    .eq("user_id", userId)
    .single();
  const sellerLevel = (sellerVerif?.verification_level as string) || "unverified";
  if (sellerLevel === "unverified") {
    return jsonResponse({
      error: "Complete phone verification and location setup before publishing offers.",
    }, 403);
  }
  const sellerAmountLimit = SELLER_LIMIT_BY_LEVEL[sellerLevel] ?? 0;

  // Fetch shared draft data
  const [pricingRes, deliveryRes, notesRes, mediaFilesRes, draftItemRes] = await Promise.all([
    adminClient.from("transaction_pricing").select("*").eq("transaction_id", draftId).maybeSingle(),
    adminClient.from("transaction_delivery_terms").select("*").eq("transaction_id", draftId).maybeSingle(),
    adminClient.from("transaction_notes").select("*").eq("transaction_id", draftId).maybeSingle(),
    adminClient
      .from("transaction_media")
      .select("file_id, media_type, sort_order")
      .eq("transaction_id", draftId)
      .order("sort_order"),
    adminClient.from("transaction_items").select("*").eq("transaction_id", draftId).maybeSingle(),
  ]);

  if (!deliveryRes.data) {
    return jsonResponse({ error: "Delivery details are required" }, 400);
  }

  const delivery = deliveryRes.data;
  const notes = notesRes.data;
  const mediaFiles = mediaFilesRes.data || [];
  const buyerEmail = (draft.buyer_contact_email || "").trim().toLowerCase() || null;
  const currencyCode = pricingRes.data?.currency_code || "NGN";

  // Build items list. Either from request (multi-item) or fallback to draft single item.
  let items: any[] = Array.isArray(body.items) && body.items.length > 0
    ? body.items
    : (draftItemRes.data
      ? [{
          title: draftItemRes.data.title,
          description: draftItemRes.data.description || "",
          quantity: draftItemRes.data.quantity || 1,
          condition: draftItemRes.data.condition_label || "brand_new",
          price: Number(pricingRes.data?.item_amount) || 0,
          currency_code: currencyCode,
        }]
      : []);

  if (items.length === 0) {
    return jsonResponse({ error: "At least one item is required" }, 400);
  }

  // Validate each item & accumulate total
  let totalAmount = 0;
  for (const it of items) {
    const p = Number(it.price);
    if (!it.title || !p || p <= 0 || !it.quantity || it.quantity < 1) {
      return jsonResponse({ error: "Each item needs a title, quantity, and positive price" }, 400);
    }
    totalAmount += p * it.quantity;
  }
  if (totalAmount > sellerAmountLimit) {
    return jsonResponse({
      error: `Total offer (₦${totalAmount.toLocaleString()}) exceeds your ₦${sellerAmountLimit.toLocaleString()} seller limit.`,
    }, 403);
  }

  // ── Step 1: Create the offer first (we need offer_token for slug prefix) ──
  const offerToken = generateOfferToken();
  const expiresAt = new Date(Date.now() + expiresInDays * 86400000).toISOString();

  // Auto-link buyer if email matches
  let linkedBuyerId: string | null = null;
  if (buyerEmail) {
    const { data: existingBuyer } = await adminClient
      .from("profiles")
      .select("id")
      .ilike("email", buyerEmail)
      .maybeSingle();
    linkedBuyerId = existingBuyer?.id ?? null;
  }
  const offerStatus = linkedBuyerId ? "linked" : "pending_claim";

  // ── Create products first, then offer with first product as anchor ──
  const createdProducts: { id: string; item: any; index: number }[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const slug = `po-${offerToken.substring(0, 8).toLowerCase()}${items.length > 1 ? `-${i + 1}` : ""}`;
    const { data: prod, error: prodErr } = await adminClient
      .from("products")
      .insert({
        seller_id: userId,
        title: it.title,
        slug,
        description: it.description || it.title,
        short_description: (it.description || "").substring(0, 200),
        condition_label: mapConditionToProduct(it.condition || "brand_new"),
        currency_code: it.currency_code || currencyCode,
        unit_price: Number(it.price),
        stock_quantity: Math.max(1, parseInt(it.quantity) || 1),
        visibility_type: "buyer_specific",
        status: "published",
        is_active: true,
        delivery_method: JSON.stringify([mapDeliveryToProduct(delivery.delivery_method)]),
        verification_window_hours: delivery.verification_window_hours || 72,
        seller_notes: notes?.seller_notes || null,
        estimated_delivery_days: delivery.expected_delivery_date
          ? String(Math.max(1, Math.ceil((new Date(delivery.expected_delivery_date).getTime() - Date.now()) / 86400000)))
          : "7",
        published_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (prodErr || !prod) {
      console.error("Failed to create product:", prodErr);
      return jsonResponse({ error: `Failed to create product ${i + 1}: ${prodErr?.message || "unknown"}` }, 500);
    }
    createdProducts.push({ id: prod.id, item: it, index: i });
  }

  // Link media (shared across all products on multi-item; primary on first)
  if (mediaFiles.length > 0) {
    for (const cp of createdProducts) {
      const rows = mediaFiles.map((m: any, idx: number) => ({
        product_id: cp.id,
        file_id: m.file_id,
        media_type: m.media_type === "video" ? "video" : "image",
        sort_order: idx,
        is_primary: idx === 0,
      }));
      await adminClient.from("product_media").insert(rows);
    }
  }

  // Get primary media URL for snapshots
  let primaryMediaUrl: string | null = null;
  if (mediaFiles.length > 0) {
    const { data: f } = await adminClient
      .from("files")
      .select("file_url, secure_url")
      .eq("id", mediaFiles[0].file_id)
      .maybeSingle();
    primaryMediaUrl = f?.secure_url || f?.file_url || null;
  }

  // Create offer pointing to first product
  const { data: realOffer, error: realOfferErr } = await adminClient
    .from("buyer_specific_product_offers")
    .insert({
      product_id: createdProducts[0].id,
      seller_id: userId,
      buyer_id: linkedBuyerId,
      buyer_email: buyerEmail,
      offer_token: offerToken,
      status: offerStatus,
      expires_at: expiresAt,
      linked_at: linkedBuyerId ? new Date().toISOString() : null,
      created_via: "create_transaction_wizard",
      source_draft_id: draftId,
    })
    .select("id")
    .single();

  if (realOfferErr || !realOffer) {
    console.error("Failed to create offer:", realOfferErr);
    return jsonResponse({ error: `Failed to create private offer: ${realOfferErr?.message || "unknown"}` }, 500);
  }

  // Snapshot items
  const itemRows = createdProducts.map((cp) => ({
    offer_id: realOffer.id,
    product_id: cp.id,
    product_title: cp.item.title,
    short_description: (cp.item.description || "").substring(0, 200),
    condition_summary: cp.item.condition || "brand_new",
    quantity: Math.max(1, parseInt(cp.item.quantity) || 1),
    unit_price_snapshot: Number(cp.item.price),
    currency_code: cp.item.currency_code || currencyCode,
    primary_media_url: primaryMediaUrl,
    position: cp.index,
  }));
  await adminClient.from("buyer_specific_offer_items").insert(itemRows);

  // Audit
  await adminClient.from("offer_events").insert({
    offer_id: realOffer.id,
    event_type: linkedBuyerId ? "created_and_linked" : "created_pending_claim",
    actor_user_id: userId,
    metadata: {
      buyer_email: buyerEmail,
      items_count: items.length,
      total_amount: totalAmount,
      currency: currencyCode,
      delivery_terms: delivery,
    },
  });

  // Mark all uploaded files non-temporary
  const fileIds = mediaFiles.map((m: any) => m.file_id);
  if (fileIds.length > 0) {
    await adminClient.from("files").update({ is_temporary: false }).in("id", fileIds);
  }

  // ── Delete the draft staging transaction ──
  await adminClient.from("transaction_items").delete().eq("transaction_id", draftId);
  await adminClient.from("transaction_pricing").delete().eq("transaction_id", draftId);
  await adminClient.from("transaction_delivery_terms").delete().eq("transaction_id", draftId);
  await adminClient.from("transaction_notes").delete().eq("transaction_id", draftId);
  await adminClient.from("transaction_media").delete().eq("transaction_id", draftId);
  await adminClient.from("transaction_participants").delete().eq("transaction_id", draftId);
  await adminClient.from("transactions").delete().eq("id", draftId);

  return jsonResponse({
    offer_url: `/offer/${offerToken}`,
    offer_token: offerToken,
    offer_id: realOffer.id,
    buyer_linked: !!linkedBuyerId,
    expires_at: expiresAt,
    items_count: items.length,
    total_amount: totalAmount,
    currency_code: currencyCode,
  });
}

async function upsertByTransaction(client: any, table: string, transactionId: string, data: Record<string, any>) {
  const { data: existing } = await client
    .from(table)
    .select("id")
    .eq("transaction_id", transactionId)
    .maybeSingle();

  if (existing) {
    await client.from(table).update(data).eq("transaction_id", transactionId);
  } else {
    await client.from(table).insert({ transaction_id: transactionId, ...data });
  }
}
