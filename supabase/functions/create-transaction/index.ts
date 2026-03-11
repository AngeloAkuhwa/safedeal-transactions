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

    // Verify seller role
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

  // Determine buyer contact type
  const isEmail = buyerContact.includes("@");
  const buyerEmail = isEmail ? buyerContact : null;
  const buyerPhone = !isEmail && buyerContact ? buyerContact : null;

  if (transactionId) {
    // Verify ownership and draft status
    const { data: existing } = await adminClient
      .from("transactions")
      .select("id, status, seller_id")
      .eq("id", transactionId)
      .single();

    if (!existing || existing.seller_id !== userId || existing.status !== "draft") {
      return jsonResponse({ error: "Draft not found or not editable" }, 404);
    }

    // Update transaction
    await adminClient
      .from("transactions")
      .update({
        buyer_contact_email: buyerEmail,
        buyer_contact_phone: buyerPhone,
      })
      .eq("id", transactionId);
  } else {
    // Generate transaction code
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

  // Upsert related tables in parallel
  const pricing = computePricing(price, currencyCode);
  const fileIds = (body.file_ids as string[]) ?? [];

  await Promise.all([
    // Buyer participant
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

    // Seller participant
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

    // Item
    upsertByTransaction(adminClient, "transaction_items", transactionId, {
      title: itemTitle || "Untitled",
      description: itemDescription || "",
      quantity: itemQuantity,
      condition_label: itemCondition,
    }),

    // Pricing
    upsertByTransaction(adminClient, "transaction_pricing", transactionId, {
      currency_code: currencyCode,
      item_amount: price,
      platform_fee_amount: pricing.platform_fee_amount,
      processing_fee_amount: pricing.paystack_fee_amount,
      seller_net_amount: price - pricing.platform_fee_amount,
      buyer_total_amount: pricing.total_amount,
    }),

    // Delivery terms (only if we have a date)
    expectedDeliveryDate
      ? upsertByTransaction(adminClient, "transaction_delivery_terms", transactionId, {
          delivery_method: deliveryMethod,
          expected_delivery_date: expectedDeliveryDate,
          verification_window_hours: verificationWindowHours,
        })
      : Promise.resolve(),

    // Notes
    upsertByTransaction(adminClient, "transaction_notes", transactionId, {
      seller_notes: sellerNotes,
    }),

    // Link uploaded files to this transaction
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

async function handlePublish(adminClient: any, userId: string, body: any) {
  const transactionId = body.transaction_id as string;
  if (!transactionId) {
    return jsonResponse({ error: "transaction_id required" }, 400);
  }

  // Fetch transaction
  const { data: tx } = await adminClient
    .from("transactions")
    .select("id, status, seller_id, share_token, transaction_code")
    .eq("id", transactionId)
    .single();

  if (!tx || tx.seller_id !== userId) {
    return jsonResponse({ error: "Transaction not found" }, 404);
  }

  if (tx.status !== "draft") {
    return jsonResponse({ error: "Transaction is not a draft" }, 400);
  }

  // Validate required data exists
  const [itemRes, pricingRes, deliveryRes] = await Promise.all([
    adminClient.from("transaction_items").select("id, title").eq("transaction_id", transactionId).single(),
    adminClient.from("transaction_pricing").select("id, item_amount").eq("transaction_id", transactionId).single(),
    adminClient.from("transaction_delivery_terms").select("id").eq("transaction_id", transactionId).single(),
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

  // Transition to awaiting_buyer
  const { error: updateError } = await adminClient
    .from("transactions")
    .update({ status: "awaiting_buyer" })
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

  return jsonResponse({ share_url: shareUrl, transaction_id: transactionId });
}

async function upsertByTransaction(client: any, table: string, transactionId: string, data: Record<string, any>) {
  // Check if row exists
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
