import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { computePricing } from "../_shared/pricing.ts";
import { shareLinkExpiresAt } from "../_shared/share-links.ts";
import { buildPricingSnapshot } from "../_shared/safedeal-money-policy.ts";
import { loadPricingConfig, resolveEffectiveTimeoutHours } from "../_shared/settings-resolver.ts";
import { checkIdVerificationRequirement } from "../_shared/security-resolver.ts";
import { checkCheckoutAllowed } from "../_shared/commerce-gate.ts";

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
 * FAIL CLOSED (mirrors `cart-checkout`): an unmapped condition or delivery
 * method is a fact about someone else's goods, persisted into the agreement
 * the buyer is asked to accept. We refuse rather than invent "brand new" or
 * "courier". Both maps must stay identical to the cart-checkout twin.
 */
const CONDITION_MAP: Record<string, string> = {
  brand_new: "brand_new",
  like_new: "like_new",
  refurbished: "excellent",
  used_good: "good",
  used_fair: "fair",
};
function mapCondition(productCondition: string | null): string | null {
  return CONDITION_MAP[productCondition ?? ""] ?? null;
}

const DELIVERY_METHOD_MAP: Record<string, string> = {
  pickup: "pickup",
  delivery: "courier",
  courier_shipping: "courier",
  digital: "hand_delivery",
  hand_delivery: "hand_delivery",
  meetup: "meetup",
};
function mapDeliveryMethod(productMethod: string | null): string | null {
  return DELIVERY_METHOD_MAP[productMethod ?? ""] ?? null;
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
    const buyerDeliveryMethod = typeof body.delivery_method === "string" ? body.delivery_method : null;
    const buyerAddress = (body.delivery_address && typeof body.delivery_address === "object") ? body.delivery_address : null;
    const buyerContactPhone = typeof body.contact_phone === "string" ? body.contact_phone.trim() : null;

    if (!productId) {
      return jsonResponse({ error: "product_id is required" }, 400);
    }

    // Check for existing awaiting_payment transaction (idempotency)
    const { data: existingCandidate } = await adminClient
      .from("transactions")
      .select("id, share_token, transaction_code, status")
      .eq("buyer_id", buyerId)
      .eq("source_product_id", productId)
      .eq("status", "awaiting_payment")
      .maybeSingle();

    // Only ADOPT a complete transaction. An incomplete one (no pricing, no
    // share link, no escrow row) would be handed back as a 200 whose review
    // page has nothing to show, whose payment initiation fails, or. Worse —
    // which funds with no escrow row and is invisible to every admin escrow
    // surface. The escrow probe matters for records created before the escrow
    // insert existed on this path.
    let existingTx: typeof existingCandidate = null;
    if (existingCandidate) {
      const [{ count: pricingCount }, { count: linkCount }, { count: escrowCount }] = await Promise.all([
        adminClient.from("transaction_pricing").select("transaction_id", { count: "exact", head: true })
          .eq("transaction_id", existingCandidate.id),
        adminClient.from("transaction_links").select("transaction_id", { count: "exact", head: true })
          .eq("transaction_id", existingCandidate.id),
        adminClient.from("escrow_states").select("transaction_id", { count: "exact", head: true })
          .eq("transaction_id", existingCandidate.id),
      ]);
      if ((pricingCount ?? 0) > 0 && (linkCount ?? 0) > 0 && (escrowCount ?? 0) > 0 && existingCandidate.share_token) {
        existingTx = existingCandidate;
      } else if ((pricingCount ?? 0) > 0 && (linkCount ?? 0) > 0 && existingCandidate.share_token) {
        // Everything else is present: backfill the missing escrow row rather
        // than orphaning the record (parity with `claim-offer`'s reuse path).
        const { error: escrowErr } = await adminClient.from("escrow_states").insert({
          transaction_id: existingCandidate.id,
          state: "awaiting_payment",
          held_amount: 0,
        });
        if (escrowErr) {
          console.warn(`storefront-checkout: could not backfill the protection record for ${existingCandidate.id}; creating a fresh transaction`, escrowErr);
        } else {
          existingTx = existingCandidate;
        }
      } else {
        console.warn(`storefront-checkout: ignoring incomplete transaction ${existingCandidate.id}; creating a fresh one`);
      }
    }

    // (Reuse handling moved below: needs product + pricing context to
    // reconcile quantity/pricing/reservation when the buyer changes intent.)

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

    // Stock check accounting for any quantity already reserved by an
    // existing awaiting_payment transaction we'd be reusing.
    let existingReservedForReuse = 0;
    if (existingTx) {
      const { data: existingItems } = await adminClient
        .from("transaction_items")
        .select("quantity")
        .eq("transaction_id", existingTx.id);
      existingReservedForReuse = (existingItems || []).reduce(
        (s: number, r: any) => s + (Number(r.quantity) || 0),
        0,
      );
    }
    const effectiveReserved = Math.max(0, product.reserved_quantity - existingReservedForReuse);
    const availableStock = product.stock_quantity - effectiveReserved;
    if (availableStock < quantity) {
      return jsonResponse({ error: `Only ${availableStock} units available` }, 400);
    }

    // Prevent self-purchase
    if (product.seller_id === buyerId) {
      return jsonResponse({ error: "You cannot purchase your own product" }, 400);
    }

    // Commerce gate: platform kill switch + vendor active check
    const gate = await checkCheckoutAllowed(product.seller_id);
    if (gate) return jsonResponse(gate.body, gate.status);

    // Fetch seller profile
    const { data: sellerProfile } = await adminClient
      .from("profiles")
      .select("id, full_name, email, phone, country_code, state_name, city_name")
      .eq("id", product.seller_id)
      .single();

    if (!sellerProfile) {
      return jsonResponse({ error: "Seller not found" }, 404);
    }

    // Fetch buyer profile
    const { data: buyerProfile } = await adminClient
      .from("profiles")
      .select("id, full_name, email, phone, country_code, state_name, city_name")
      .eq("id", buyerId)
      .single();

    if (!buyerProfile) {
      return jsonResponse({ error: "Buyer profile not found" }, 404);
    }

    // Calculate pricing
    const itemAmount = product.unit_price * quantity;
    const vendorConfig = await loadPricingConfig(product.seller_id);
    const pricing = computePricing(itemAmount, product.currency_code, "local", vendorConfig);
    const snapshot = buildPricingSnapshot(itemAmount, product.currency_code, vendorConfig);
    // The verification window IS a commitment (the clock the buyer is held to),
    // so it must come from the product or the vendor's effective settings —
    // never a literal. Resolved before any write.
    const productWindow =
      product.verification_window_hours === null || product.verification_window_hours === undefined
        ? null
        : Number(product.verification_window_hours);
    const verificationWindowHours =
      productWindow !== null && Number.isFinite(productWindow) && productWindow > 0
        ? productWindow
        : await resolveEffectiveTimeoutHours(product.seller_id, "buyer_verification_timeout");
    if (verificationWindowHours === null) {
      return jsonResponse(
        {
          error: "verification_window_unresolved",
          reason: "No buyer verification window is configured for this seller.",
        },
        409,
      );
    }

    // Gate: identity verification required above vendor/platform threshold
    const kyc = await checkIdVerificationRequirement(
      buyerId,
      product.seller_id,
      product.currency_code,
      pricing.total_amount,
    );
    if (kyc) return jsonResponse(kyc.body, kyc.status);

    // Resolve buyer's delivery selection (also used by the reuse path below)
    let enabledMethods: string[] = [];
    if (product.delivery_method) {
      try {
        const parsed = JSON.parse(product.delivery_method);
        enabledMethods = Array.isArray(parsed) ? parsed : [String(parsed)];
      } catch {
        enabledMethods = [String(product.delivery_method)];
      }
    }
    if (enabledMethods.length === 0) {
      return jsonResponse({ error: "Seller has not configured any delivery methods" }, 400);
    }
    let chosenRawMethod: string;
    if (buyerDeliveryMethod) {
      if (!enabledMethods.includes(buyerDeliveryMethod)) {
        return jsonResponse({ error: `Delivery method '${buyerDeliveryMethod}' is not offered for this product` }, 400);
      }
      chosenRawMethod = buyerDeliveryMethod;
    } else if (enabledMethods.length === 1) {
      chosenRawMethod = enabledMethods[0];
    } else {
      return jsonResponse({ error: "delivery_method is required (multiple options available)" }, 400);
    }
    const needsAddress = chosenRawMethod === "courier_shipping" || chosenRawMethod === "delivery";
    const needsPhone = chosenRawMethod === "pickup" || chosenRawMethod === "meetup" || chosenRawMethod === "hand_delivery";
    if (needsAddress) {
      if (!buyerAddress?.line1 || !buyerAddress?.city || !buyerAddress?.state) {
        return jsonResponse({ error: "delivery_address (line1, city, state) is required for this delivery method" }, 400);
      }
    }
    if (needsPhone && !buyerContactPhone && !buyerProfile.phone) {
      return jsonResponse({ error: "contact_phone is required for this delivery method" }, 400);
    }

    // Serviceability, checked here and on the thing it is actually about.
    //
    // Until now this function applied no region gate at all. It validated auth,
    // role, stock, self-purchase, delivery method and whether an address was
    // present: but never whether SafeDeal serves the place the goods are going.
    // The check existed only in the UI, in the permissions object behind the pay
    // button, which means any caller that skips the UI could create a protected
    // transaction into a region we cannot deliver to or adjudicate a dispute in.
    //
    // It is deliberately asked about the DELIVERY ADDRESS, not the buyer's
    // profile. Where the goods go is a property of this deal; where the buyer
    // happens to live is not. For an in-person method there is no address, so
    // the seller's own region is what governs: that is where the handover
    // happens.
    {
      const place = needsAddress
        ? { country: buyerProfile.country_code ?? "NG", state: buyerAddress!.state, city: buyerAddress!.city }
        : { country: seller.country_code ?? "NG", state: seller.state_name, city: seller.city_name };

      const { data: serviceable, error: serviceabilityError } = await adminClient.rpc(
        "is_region_serviceable",
        { _country_code: place.country, _state_name: place.state, _city_name: place.city },
      );

      // Fail closed: an error resolving serviceability is not permission.
      if (serviceabilityError || !serviceable) {
        return jsonResponse(
          {
            error: "region_not_serviceable",
            reason: needsAddress
              ? `SafeDeal does not yet cover deliveries to ${place.city}, ${place.state}.`
              : `SafeDeal does not yet cover in-person handover in ${place.city}, ${place.state}.`,
          },
          409,
        );
      }
    }
    const primaryDeliveryMethod = mapDeliveryMethod(chosenRawMethod);
    if (!primaryDeliveryMethod) {
      return jsonResponse(
        { error: "delivery_method_unmapped", reason: `'${chosenRawMethod}' is not a delivery method SafeDeal can record.` },
        409,
      );
    }
    const conditionLabel = mapCondition(product.condition_label);
    if (!conditionLabel) {
      return jsonResponse(
        { error: "condition_unmapped", reason: `"${product.title}" has no recognised condition recorded.`, product_id: product.id },
        409,
      );
    }

    // The delivery estimate is NOT a commitment. It is optional seller-supplied
    // information. Absent an estimate we carry `null` through and show none,
    // rather than promising a week nobody agreed to or blocking the sale.
    const rawDeliveryDays = product.estimated_delivery_days;
    const parsedDays =
      rawDeliveryDays === null || rawDeliveryDays === undefined || rawDeliveryDays === ""
        ? null
        : Number.parseInt(String(rawDeliveryDays), 10);
    let expectedDeliveryDate: string | null = null;
    if (parsedDays !== null && Number.isFinite(parsedDays) && parsedDays >= 0) {
      const expectedDate = new Date();
      expectedDate.setDate(expectedDate.getDate() + parsedDays);
      expectedDeliveryDate = expectedDate.toISOString().split("T")[0];
    }

    // ── Reuse path: existing awaiting_payment transaction ──
    // Reconcile quantity, pricing, delivery terms and stock reservation so
    // the existing record matches the buyer's latest intent.
    if (existingTx) {
      const reservationDelta = quantity - existingReservedForReuse;

      // 1. Update transaction item quantity (delete + insert single row)
      await adminClient.from("transaction_items").delete().eq("transaction_id", existingTx.id);
      await adminClient.from("transaction_items").insert({
        transaction_id: existingTx.id,
        title: product.title,
        description: product.short_description || product.description || "",
        quantity,
        condition_label: conditionLabel,
        brand: product.brand,
        model: product.model,
      });

      // 2. Update pricing snapshot
      await adminClient.from("transaction_pricing").update({
        currency_code: product.currency_code,
        item_amount: itemAmount,
        platform_fee_amount: pricing.platform_fee_amount,
        buyer_total_amount: pricing.total_amount,
        payment_processing_fee_amount: snapshot.payment_processing_fee_amount,
        seller_payout_amount: snapshot.seller_payout_amount,
        is_total_service_fee_capped: snapshot.is_total_service_fee_capped,
        pricing_model_version: snapshot.pricing_model_version,
      }).eq("transaction_id", existingTx.id);

      // 3. Update delivery terms (delete + insert is simplest)
      await adminClient.from("transaction_delivery_terms").delete().eq("transaction_id", existingTx.id);
      await adminClient.from("transaction_delivery_terms").insert({
        transaction_id: existingTx.id,
        delivery_method: primaryDeliveryMethod,
        expected_delivery_date: expectedDeliveryDate,
        verification_window_hours: verificationWindowHours,
        delivery_address_line1: needsAddress ? (buyerAddress?.line1 ?? null) : null,
        delivery_address_line2: needsAddress ? (buyerAddress?.line2 ?? null) : null,
        delivery_city: needsAddress ? (buyerAddress?.city ?? null) : null,
        delivery_state: needsAddress ? (buyerAddress?.state ?? null) : null,
        delivery_postal_code: needsAddress ? (buyerAddress?.postal_code ?? null) : null,
        delivery_country_code: needsAddress ? (buyerAddress?.country_code ?? null) : null,
      });

      // 4. Adjust product reservation by delta (may be 0, positive or negative)
      if (reservationDelta !== 0) {
        const newReserved = Math.max(0, product.reserved_quantity + reservationDelta);
        await adminClient
          .from("products")
          .update({ reserved_quantity: newReserved })
          .eq("id", productId);

        await adminClient.from("product_inventory_logs").insert({
          product_id: productId,
          change_type: reservationDelta > 0 ? "reserve" : "release",
          quantity_delta: reservationDelta,
          balance_after: product.stock_quantity - newReserved,
          reference_type: "transaction",
          reference_id: existingTx.id,
          notes: `Reservation adjusted on storefront checkout retry (${existingReservedForReuse} → ${quantity})`,
          changed_by_user_id: buyerId,
        });
      }

      console.log(`Reused tx ${existingTx.id}: qty ${existingReservedForReuse} → ${quantity}`);
      return jsonResponse({
        transaction_id: existingTx.id,
        share_token: existingTx.share_token,
        transaction_code: existingTx.transaction_code,
      });
    }

    // Generate transaction code + share token
    const { data: transactionCode } = await adminClient.rpc("generate_transaction_code");
    const shareToken = generateShareToken();

    // Create the transaction: insert directly as awaiting_payment
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

    // Create all related records in parallel
    await Promise.all([
      // Transaction items
      adminClient.from("transaction_items").insert({
        transaction_id: transactionId,
        title: product.title,
        description: product.short_description || product.description || "",
        quantity,
        condition_label: conditionLabel,
        brand: product.brand,
        model: product.model,
      }),

      // Transaction pricing
      adminClient.from("transaction_pricing").insert({
        transaction_id: transactionId,
        currency_code: product.currency_code,
        item_amount: itemAmount,
        platform_fee_amount: pricing.platform_fee_amount,
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
        verification_window_hours: verificationWindowHours,
        delivery_address_line1: needsAddress ? (buyerAddress?.line1 ?? null) : null,
        delivery_address_line2: needsAddress ? (buyerAddress?.line2 ?? null) : null,
        delivery_city: needsAddress ? (buyerAddress?.city ?? null) : null,
        delivery_state: needsAddress ? (buyerAddress?.state ?? null) : null,
        delivery_postal_code: needsAddress ? (buyerAddress?.postal_code ?? null) : null,
        delivery_country_code: needsAddress ? (buyerAddress?.country_code ?? null) : null,
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
        expires_at: shareLinkExpiresAt(),
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
