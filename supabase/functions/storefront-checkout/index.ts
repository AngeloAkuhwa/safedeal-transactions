import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { computePricing } from "../_shared/pricing.ts";
import { buildPricingSnapshot } from "../_shared/safedeal-money-policy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
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

/**
 * Map product condition_label → transaction item_condition enum.
 * Products use strings like "brand_new", "used_good", "used_fair", "refurbished", "like_new".
 * Transaction items use enum: brand_new, like_new, excellent, good, fair, used.
 */
function mapCondition(productCondition: string | null): string {
  const map: Record<string, string> = {
    brand_new: "brand_new",
    like_new: "like_new",
    refurbished: "excellent",
    used_good: "good",
    used_fair: "fair",
  };
  return map[productCondition ?? ""] ?? "brand_new";
}

/**
 * Map product delivery_method string → transaction delivery_method_type enum.
 * Product uses: pickup, delivery, courier_shipping, digital, hand_delivery, meetup
 * Transaction enum: courier, pickup, meetup, hand_delivery
 */
function mapDeliveryMethod(productMethod: string | null): string {
  const map: Record<string, string> = {
    pickup: "pickup",
    delivery: "courier",
    courier_shipping: "courier",
    digital: "hand_delivery",
    hand_delivery: "hand_delivery",
    meetup: "meetup",
  };
  return map[productMethod ?? ""] ?? "courier";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
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

    // Authenticate buyer
    const { data: userData, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !userData?.user) {
      return jsonResponse({ error: "Invalid session" }, 401);
    }
    const buyerId = userData.user.id;

    // Verify buyer role
    const { data: hasBuyerRole } = await adminClient.rpc("has_role", {
      _user_id: buyerId,
      _role: "buyer",
    });
    if (!hasBuyerRole) {
      return jsonResponse({ error: "Buyer role required" }, 403);
    }

    // Parse body
    const body = await req.json().catch(() => ({}));
    const productId = body.product_id as string;
    const quantity = Math.max(1, Math.floor(Number(body.quantity) || 1));

    if (!productId) {
      return jsonResponse({ error: "product_id is required" }, 400);
    }

    // Check for existing awaiting_payment transaction (idempotency)
    const { data: existingTx } = await adminClient
      .from("transactions")
      .select("id, share_token, transaction_code, status")
      .eq("buyer_id", buyerId)
      .eq("source_product_id", productId)
      .eq("status", "awaiting_payment")
      .maybeSingle();

    if (existingTx) {
      // Reuse existing transaction — return same share_token
      console.log(`Reusing existing transaction ${existingTx.id} for product ${productId}`);
      return jsonResponse({
        transaction_id: existingTx.id,
        share_token: existingTx.share_token,
        transaction_code: existingTx.transaction_code,
      });
    }

    // Fetch product
    const { data: product, error: productError } = await adminClient
      .from("products")
      .select("id, title, short_description, description, condition_label, brand, model, unit_price, currency_code, stock_quantity, reserved_quantity, seller_id, status, visibility_type, is_active, delivery_method, verification_window_hours, agreement_terms, estimated_delivery_days, slug")
      .eq("id", productId)
      .single();

    if (productError || !product) {
      return jsonResponse({ error: "Product not found" }, 404);
    }

    if (product.status !== "published" || product.visibility_type !== "public" || !product.is_active) {
      return jsonResponse({ error: "Product is not available for purchase" }, 400);
    }

    // Check stock
    const availableStock = product.stock_quantity - product.reserved_quantity;
    if (availableStock < quantity) {
      return jsonResponse({ error: `Only ${availableStock} units available` }, 400);
    }

    // Prevent self-purchase
    if (product.seller_id === buyerId) {
      return jsonResponse({ error: "You cannot purchase your own product" }, 400);
    }

    // Fetch seller profile
    const { data: sellerProfile } = await adminClient
      .from("profiles")
      .select("id, full_name, email, phone")
      .eq("id", product.seller_id)
      .single();

    if (!sellerProfile) {
      return jsonResponse({ error: "Seller not found" }, 404);
    }

    // Fetch buyer profile
    const { data: buyerProfile } = await adminClient
      .from("profiles")
      .select("id, full_name, email, phone")
      .eq("id", buyerId)
      .single();

    if (!buyerProfile) {
      return jsonResponse({ error: "Buyer profile not found" }, 404);
    }

    // Calculate pricing
    const itemAmount = product.unit_price * quantity;
    const pricing = computePricing(itemAmount, product.currency_code);
    const snapshot = buildPricingSnapshot(itemAmount, product.currency_code);

    // Generate transaction code + share token
    const { data: transactionCode } = await adminClient.rpc("generate_transaction_code");
    const shareToken = generateShareToken();

    // Create the transaction — insert directly as awaiting_payment
    // (INSERT bypasses the state-machine trigger which only fires on UPDATE)
    const { data: newTx, error: txError } = await adminClient
      .from("transactions")
      .insert({
        transaction_code: transactionCode ?? `SD-${Date.now()}`,
        seller_id: product.seller_id,
        buyer_id: buyerId,
        created_by_user_id: buyerId,
        buyer_contact_email: buyerProfile.email,
        share_token: shareToken,
        status: "awaiting_payment",
        money_status: "not_secured",
        dispute_status: "none",
        source_product_id: productId,
      })
      .select("id")
      .single();

    if (txError || !newTx) {
      console.error("Failed to create transaction:", txError);
      return jsonResponse({ error: "Failed to create transaction" }, 500);
    }

    const transactionId = newTx.id;

    // Parse delivery method (product may store JSON array or single string)
    let primaryDeliveryMethod = "courier";
    if (product.delivery_method) {
      try {
        const methods = JSON.parse(product.delivery_method);
        primaryDeliveryMethod = mapDeliveryMethod(Array.isArray(methods) ? methods[0] : product.delivery_method);
      } catch {
        primaryDeliveryMethod = mapDeliveryMethod(product.delivery_method);
      }
    }

    // Calculate expected delivery date (today + estimated days or default 7 days)
    const deliveryDays = parseInt(product.estimated_delivery_days || "7", 10) || 7;
    const expectedDate = new Date();
    expectedDate.setDate(expectedDate.getDate() + deliveryDays);
    const expectedDeliveryDate = expectedDate.toISOString().split("T")[0];

    // Create all related records in parallel
    await Promise.all([
      // Transaction items
      adminClient.from("transaction_items").insert({
        transaction_id: transactionId,
        title: product.title,
        description: product.short_description || product.description || "",
        quantity,
        condition_label: mapCondition(product.condition_label),
        brand: product.brand,
        model: product.model,
      }),

      // Transaction pricing
      adminClient.from("transaction_pricing").insert({
        transaction_id: transactionId,
        currency_code: product.currency_code,
        item_amount: itemAmount,
        platform_fee_amount: pricing.platform_fee_amount,
        processing_fee_amount: pricing.paystack_fee_amount,
        seller_net_amount: itemAmount,
        buyer_total_amount: pricing.total_amount,
        payment_processing_fee_amount: snapshot.payment_processing_fee_amount,
        seller_payout_amount: snapshot.seller_payout_amount,
        is_total_service_fee_capped: snapshot.is_total_service_fee_capped,
        pricing_model_version: snapshot.pricing_model_version,
      }),

      // Delivery terms
      adminClient.from("transaction_delivery_terms").insert({
        transaction_id: transactionId,
        delivery_method: primaryDeliveryMethod,
        expected_delivery_date: expectedDeliveryDate,
        verification_window_hours: product.verification_window_hours || 48,
      }),

      // Buyer participant
      adminClient.from("transaction_participants").insert({
        transaction_id: transactionId,
        role: "buyer",
        user_id: buyerId,
        display_name: buyerProfile.full_name || "Buyer",
        email: buyerProfile.email,
        phone: buyerProfile.phone,
      }),

      // Seller participant
      adminClient.from("transaction_participants").insert({
        transaction_id: transactionId,
        role: "seller",
        user_id: product.seller_id,
        display_name: sellerProfile.full_name || "Seller",
        email: sellerProfile.email,
        phone: sellerProfile.phone,
      }),

      // Transaction link
      adminClient.from("transaction_links").insert({
        transaction_id: transactionId,
        share_token: shareToken,
        url: `/t/${shareToken}`,
        is_active: true,
      }),

      // Reserve stock (increment reserved_quantity)
      adminClient
        .from("products")
        .update({ reserved_quantity: product.reserved_quantity + quantity })
        .eq("id", productId),

      // Log reserve in inventory audit trail
      adminClient.from("product_inventory_logs").insert({
        product_id: productId,
        change_type: "reserve",
        quantity_delta: quantity,
        balance_after: product.stock_quantity - (product.reserved_quantity + quantity),
        reference_type: "transaction",
        reference_id: transactionId,
        notes: "Stock reserved at storefront checkout",
        changed_by_user_id: buyerId,
      }),

      // Escrow state
      adminClient.from("escrow_states").insert({
        transaction_id: transactionId,
        state: "awaiting_payment",
        held_amount: 0,
      }),
    ]);

    console.log(`Storefront checkout: transaction ${transactionId} created for product ${productId}, qty ${quantity}`);

    return jsonResponse({
      transaction_id: transactionId,
      share_token: shareToken,
      transaction_code: transactionCode,
    });
  } catch (err) {
    console.error("storefront-checkout error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
