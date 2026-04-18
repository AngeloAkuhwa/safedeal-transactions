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
  // 32-char URL-safe token
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
    if (!hasRole) {
      return jsonResponse({ error: "Seller role required" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    if (action === "save_draft") {
      return await handleSaveDraft(adminClient, userId, body);
    } else if (action === "publish") {
      return await handlePublish(adminClient, userId, body);
    } else {
      return jsonResponse({ error: "Invalid action" }, 400);
    }
  } catch (err) {
    console.error("create-transaction error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});

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
      console.error("Failed to create transaction:", txError);
      return jsonResponse({ error: "Failed to create transaction" }, 500);
    }

    transactionId = newTx.id;
  }

  const pricing = computePricing(price, currencyCode);
  const fileIds = (body.file_ids as string[]) ?? [];

  await Promise.all([
    adminClient
      .from("transaction_participants")
      .upsert(
        {
          transaction_id: transactionId,
          role: "buyer",
          display_name: buyerName || "Unknown Buyer",
          email: buyerEmail,
          phone: buyerPhone,
        },
        { onConflict: "transaction_id,role" }
      ),

    adminClient
      .from("transaction_participants")
      .upsert(
        {
          transaction_id: transactionId,
          role: "seller",
          display_name: "",
          user_id: userId,
        },
        { onConflict: "transaction_id,role" }
      ),

    upsertByTransaction(adminClient, "transaction_items", transactionId, {
      title: itemTitle || "Untitled",
      description: itemDescription || "",
      quantity: itemQuantity,
      condition_label: itemCondition,
    }),

    upsertByTransaction(adminClient, "transaction_pricing", transactionId, {
      currency_code: currencyCode,
      item_amount: price,
      platform_fee_amount: pricing.platform_fee_amount,
      processing_fee_amount: pricing.paystack_fee_amount,
      seller_net_amount: price - pricing.platform_fee_amount,
      buyer_total_amount: pricing.total_amount,
    }),

    expectedDeliveryDate
      ? upsertByTransaction(adminClient, "transaction_delivery_terms", transactionId, {
          delivery_method: deliveryMethod,
          expected_delivery_date: expectedDeliveryDate,
          verification_window_hours: verificationWindowHours,
        })
      : Promise.resolve(),

    upsertByTransaction(adminClient, "transaction_notes", transactionId, {
      seller_notes: sellerNotes,
    }),

    ...(fileIds.length > 0
      ? [adminClient
          .from("files")
          .update({ is_temporary: false })
          .in("id", fileIds)
          .eq("uploaded_by_user_id", userId)]
      : []),
  ]);

  return jsonResponse({ transaction_id: transactionId });
}

const SELLER_LIMIT_BY_LEVEL: Record<string, number> = {
  unverified: 0,
  basic_verified: 50_000,
  trusted_buyer: 200_000,
  high_trust_buyer: 500_000,
};

const SELLER_CONCURRENT_BY_LEVEL: Record<string, number> = {
  unverified: 0,
  basic_verified: 1,
  trusted_buyer: 3,
  high_trust_buyer: 5,
};

const SELLER_ACTIVE_STATUSES = [
  "awaiting_buyer",
  "awaiting_payment",
  "payment_secured",
  "seller_preparing_delivery",
  "seller_dispatched",
  "delivered_awaiting_verification",
  "disputed",
];

// Map wizard condition → product condition_label
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

// Map wizard delivery method → product delivery method
function mapDeliveryToProduct(m: string): string {
  const map: Record<string, string> = {
    courier: "courier_shipping",
    pickup: "pickup",
    meetup: "meetup",
    hand_delivery: "hand_delivery",
  };
  return map[m] ?? "courier_shipping";
}

async function handlePublish(adminClient: any, userId: string, body: any) {
  const transactionId = body.transaction_id as string;
  const expiresInDays = Math.max(1, Math.min(365, parseInt(body.expires_in_days) || 7));

  if (!transactionId) {
    return jsonResponse({ error: "transaction_id required" }, 400);
  }

  const { data: tx } = await adminClient
    .from("transactions")
    .select("id, status, seller_id, share_token, transaction_code, buyer_contact_email, buyer_contact_phone")
    .eq("id", transactionId)
    .single();

  if (!tx || tx.seller_id !== userId) {
    return jsonResponse({ error: "Transaction not found" }, 404);
  }

  if (tx.status !== "draft") {
    return jsonResponse({ error: "Transaction is not a draft" }, 400);
  }

  const { data: sellerVerif } = await adminClient
    .from("account_verifications")
    .select("verification_level")
    .eq("user_id", userId)
    .single();

  const sellerLevel = (sellerVerif?.verification_level as string) || "unverified";
  if (sellerLevel === "unverified") {
    return jsonResponse({
      error: "Complete phone verification and location setup before publishing transactions. Go to Profile Settings.",
    }, 403);
  }

  const sellerMaxConcurrent = SELLER_CONCURRENT_BY_LEVEL[sellerLevel] ?? 0;
  const { count: sellerActiveCount } = await adminClient
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("seller_id", userId)
    .in("status", SELLER_ACTIVE_STATUSES);

  if ((sellerActiveCount ?? 0) >= sellerMaxConcurrent) {
    return jsonResponse({
      error: `You've reached your active transaction limit (${sellerMaxConcurrent}). Complete or resolve existing transactions first.`,
    }, 403);
  }

  const [itemRes, pricingRes, deliveryRes, notesRes, participantsRes, mediaFilesRes] = await Promise.all([
    adminClient.from("transaction_items").select("*").eq("transaction_id", transactionId).single(),
    adminClient.from("transaction_pricing").select("*").eq("transaction_id", transactionId).single(),
    adminClient.from("transaction_delivery_terms").select("*").eq("transaction_id", transactionId).single(),
    adminClient.from("transaction_notes").select("*").eq("transaction_id", transactionId).maybeSingle(),
    adminClient.from("transaction_participants").select("*").eq("transaction_id", transactionId),
    adminClient.from("transaction_media").select("file_id, media_type, display_order").eq("transaction_id", transactionId).order("display_order"),
  ]);

  if (!itemRes.data?.title) {
    return jsonResponse({ error: "Item details are required" }, 400);
  }
  if (!pricingRes.data || pricingRes.data.item_amount <= 0) {
    return jsonResponse({ error: "Valid price is required" }, 400);
  }
  if (!deliveryRes.data) {
    return jsonResponse({ error: "Delivery details are required" }, 400);
  }

  const sellerAmountLimit = SELLER_LIMIT_BY_LEVEL[sellerLevel] ?? 0;
  if (pricingRes.data.item_amount > sellerAmountLimit) {
    return jsonResponse({
      error: `This transaction (₦${Number(pricingRes.data.item_amount).toLocaleString()}) exceeds your ₦${sellerAmountLimit.toLocaleString()} seller limit. Complete identity verification to unlock higher limits.`,
    }, 403);
  }

  const item = itemRes.data;
  const pricingData = pricingRes.data;
  const delivery = deliveryRes.data;
  const notes = notesRes.data;
  const buyerEmail = (tx.buyer_contact_email || "").trim().toLowerCase() || null;
  const buyerParticipant = (participantsRes.data || []).find((p: any) => p.role === "buyer");
  const buyerName = buyerParticipant?.display_name || "Buyer";

  // ── Step A: Create products row (visibility=buyer_specific) ──
  const offerToken = generateOfferToken();
  const productSlug = `po-${offerToken.substring(0, 8).toLowerCase()}`;

  const productData: Record<string, unknown> = {
    seller_id: userId,
    title: item.title,
    slug: productSlug,
    description: item.description || item.title,
    short_description: (item.description || "").substring(0, 200),
    condition_label: mapConditionToProduct(item.condition_label),
    currency_code: pricingData.currency_code,
    unit_price: Number(pricingData.item_amount),
    stock_quantity: Math.max(1, item.quantity || 1),
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
  };

  const { data: newProduct, error: productErr } = await adminClient
    .from("products")
    .insert(productData)
    .select("id")
    .single();

  if (productErr || !newProduct) {
    console.error("Failed to create private product:", productErr);
    return jsonResponse({ error: "Failed to create private product" }, 500);
  }

  // Link media files to product
  const mediaFiles = mediaFilesRes.data || [];
  if (mediaFiles.length > 0) {
    const productMediaRows = mediaFiles.map((m: any, idx: number) => ({
      product_id: newProduct.id,
      file_id: m.file_id,
      media_type: m.media_type === "video" ? "video" : "image",
      sort_order: idx,
      is_primary: idx === 0,
    }));
    await adminClient.from("product_media").insert(productMediaRows);
  }

  // ── Step B: Create buyer_specific_product_offers row ──
  // Lookup buyer profile by email if available
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
  const expiresAt = new Date(Date.now() + expiresInDays * 86400000).toISOString();

  const { data: newOffer, error: offerErr } = await adminClient
    .from("buyer_specific_product_offers")
    .insert({
      product_id: newProduct.id,
      seller_id: userId,
      buyer_id: linkedBuyerId,
      buyer_email: buyerEmail,
      offer_token: offerToken,
      status: offerStatus,
      expires_at: expiresAt,
      linked_at: linkedBuyerId ? new Date().toISOString() : null,
      created_via: "create_transaction_wizard",
      source_draft_id: transactionId,
    })
    .select("id")
    .single();

  if (offerErr || !newOffer) {
    console.error("Failed to create offer:", offerErr);
    return jsonResponse({ error: "Failed to create private offer" }, 500);
  }

  // Audit event
  await adminClient.from("offer_events").insert({
    offer_id: newOffer.id,
    event_type: linkedBuyerId ? "created_and_linked" : "created_pending_claim",
    actor_user_id: userId,
    metadata: { buyer_email: buyerEmail, buyer_name: buyerName, expires_at: expiresAt },
  });

  // ── Step C: Transition the transaction & link to offer ──
  const { error: updateError } = await adminClient
    .from("transactions")
    .update({
      status: "awaiting_buyer",
      source_product_id: newProduct.id,
      source_offer_id: newOffer.id,
      buyer_id: linkedBuyerId,
    })
    .eq("id", transactionId);

  if (updateError) {
    console.error("Failed to publish:", updateError);
    return jsonResponse({ error: "Failed to publish transaction" }, 500);
  }

  // Create transaction link
  const shareUrl = `/t/${tx.share_token}`;
  await adminClient
    .from("transaction_links")
    .upsert(
      {
        transaction_id: transactionId,
        share_token: tx.share_token,
        url: shareUrl,
        is_active: true,
      },
      { onConflict: "transaction_id" }
    );

  const offerUrl = `/offer/${offerToken}`;

  return jsonResponse({
    share_url: shareUrl,
    offer_url: offerUrl,
    offer_token: offerToken,
    offer_id: newOffer.id,
    product_id: newProduct.id,
    transaction_id: transactionId,
    transaction_code: tx.transaction_code,
    buyer_linked: !!linkedBuyerId,
    expires_at: expiresAt,
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
