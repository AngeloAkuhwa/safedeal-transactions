import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
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
 * FAIL CLOSED: an unmapped condition or delivery method is a fact about someone
 * else's goods. We refuse the checkout rather than inventing "brand new" or
 * "courier".
 */
const CONDITION_MAP: Record<string, string> = {
  brand_new: "brand_new",
  like_new: "like_new",
  refurbished: "excellent",
  used_good: "good",
  used_fair: "fair",
};
function mapCondition(c: string | null): string | null {
  return CONDITION_MAP[c ?? ""] ?? null;
}

const DELIVERY_METHOD_MAP: Record<string, string> = {
  pickup: "pickup",
  delivery: "courier",
  courier_shipping: "courier",
  digital: "hand_delivery",
  hand_delivery: "hand_delivery",
  meetup: "meetup",
};
function mapDeliveryMethod(d: string | null): string | null {
  return DELIVERY_METHOD_MAP[d ?? ""] ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Not authenticated" }, 401);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData?.user) return json({ error: "Invalid session" }, 401);
    const buyerId = userData.user.id;

    const { data: hasBuyer } = await admin.rpc("has_role", { _user_id: buyerId, _role: "buyer" });
    if (!hasBuyer) return json({ error: "Buyer role required" }, 403);

    const body = await req.json().catch(() => ({}));
    const cartItemIds: string[] = body.cart_item_ids || [];
    type DeliverySelection = {
      cart_item_id?: string;
      product_id?: string;
      delivery_method?: string;
      delivery_address?: {
        line1?: string; line2?: string; city?: string; state?: string; postal_code?: string; country_code?: string;
      } | null;
      contact_phone?: string | null;
    };
    const deliverySelections: DeliverySelection[] = Array.isArray(body.delivery_selections) ? body.delivery_selections : [];
    const selectionByCartItem = new Map<string, DeliverySelection>();
    const selectionByProduct = new Map<string, DeliverySelection>();
    for (const s of deliverySelections) {
      if (s?.cart_item_id) selectionByCartItem.set(s.cart_item_id, s);
      if (s?.product_id) selectionByProduct.set(s.product_id, s);
    }
    if (!cartItemIds.length) return json({ error: "cart_item_ids required" }, 400);

    // 1. Fetch cart items
    const { data: cartItems, error: ciErr } = await admin
      .from("cart_items")
      .select("id, product_id, quantity")
      .eq("buyer_id", buyerId)
      .in("id", cartItemIds);

    if (ciErr) throw ciErr;
    if (!cartItems || cartItems.length === 0) return json({ error: "No valid cart items found" }, 400);

    const productIds = cartItems.map((ci: any) => ci.product_id);

    // 2. Fetch all products
    const { data: products, error: pErr } = await admin
      .from("products")
      .select("id, title, short_description, description, condition_label, brand, model, unit_price, currency_code, stock_quantity, reserved_quantity, seller_id, status, visibility_type, is_active, delivery_method, verification_window_hours, agreement_terms, estimated_delivery_days, slug")
      .in("id", productIds);

    if (pErr) throw pErr;
    const productMap = new Map((products || []).map((p: any) => [p.id, p]));

    // Buyer profile is needed DURING validation (phone fallback), so it is
    // fetched before the validation loop rather than after it.
    const { data: buyerProfile } = await admin.from("profiles").select("id, full_name, email, phone").eq("id", buyerId).single();
    if (!buyerProfile) return json({ error: "Buyer profile not found" }, 404);

    // 3. Validate ALL items. Block entire checkout if any fail
    const errors: Array<{ product_id: string; error: string; code?: string }> = [];
    // Resolved selection per cart item, populated during validation
    const resolvedByCartItem = new Map<
      string,
      { rawMethod: string; mappedMethod: string; condition: string; address: any; phone: string | null }
    >();
    for (const ci of cartItems) {
      const product = productMap.get(ci.product_id);
      if (!product) { errors.push({ product_id: ci.product_id, error: "Product not found" }); continue; }
      if (product.status !== "published" || !product.is_active || product.visibility_type !== "public") {
        errors.push({ product_id: ci.product_id, error: "Product not available" }); continue;
      }
      if (product.seller_id === buyerId) {
        errors.push({ product_id: ci.product_id, error: "Cannot purchase own product" }); continue;
      }
      const available = product.stock_quantity - product.reserved_quantity;
      if (ci.quantity > available) {
        errors.push({ product_id: ci.product_id, error: available > 0 ? `Only ${available} available` : "Sold out" }); continue;
      }

      // Commerce gate: platform kill switch + vendor active check (per item / seller)
      const gate = await checkCheckoutAllowed(product.seller_id);
      if (gate) {
        errors.push({ product_id: ci.product_id, error: String(gate.body.reason ?? "Checkout not available") });
        continue;
      }

      // Validate delivery selection per item
      let enabled: string[] = [];
      if (product.delivery_method) {
        try {
          const parsed = JSON.parse(product.delivery_method);
          enabled = Array.isArray(parsed) ? parsed : [String(parsed)];
        } catch {
          enabled = [String(product.delivery_method)];
        }
      }
      if (enabled.length === 0) {
        errors.push({ product_id: ci.product_id, error: "Seller has not configured delivery methods" });
        continue;
      }
      const sel = selectionByCartItem.get(ci.id) ?? selectionByProduct.get(ci.product_id);
      let rawMethod: string | null = null;
      if (sel?.delivery_method) {
        if (!enabled.includes(sel.delivery_method)) {
          errors.push({ product_id: ci.product_id, error: `Delivery method '${sel.delivery_method}' not offered` });
          continue;
        }
        rawMethod = sel.delivery_method;
      } else if (enabled.length === 1) {
        rawMethod = enabled[0];
      } else {
        errors.push({ product_id: ci.product_id, error: "Delivery method required (multiple options)" });
        continue;
      }
      const needsAddress = rawMethod === "courier_shipping" || rawMethod === "delivery";
      const needsPhone = rawMethod === "pickup" || rawMethod === "meetup" || rawMethod === "hand_delivery";
      if (needsAddress) {
        const a = sel?.delivery_address ?? null;
        if (!a?.line1 || !a?.city || !a?.state) {
          errors.push({ product_id: ci.product_id, error: "Delivery address required" });
          continue;
        }
      }
      // In-person handoffs need a reachable number. Mirrors `storefront-checkout`:
      // the selection's phone, else the buyer's profile phone, else refuse.
      if (needsPhone && !sel?.contact_phone?.trim() && !buyerProfile.phone) {
        errors.push({ product_id: ci.product_id, error: "Contact phone required for this delivery method" });
        continue;
      }

      // FAIL CLOSED, BEFORE ANY WRITE: an unmapped condition or delivery
      // method is a fact about someone else's goods. Both are validated here
      // so a refusal can never happen after rows have been inserted.
      const mappedMethod = mapDeliveryMethod(rawMethod);
      if (!mappedMethod) {
        errors.push({
          product_id: ci.product_id,
          code: "delivery_method_unmapped",
          error: `'${rawMethod}' is not a delivery method SafeDeal can record`,
        });
        continue;
      }
      const condition = mapCondition(product.condition_label);
      if (!condition) {
        errors.push({
          product_id: ci.product_id,
          code: "condition_unmapped",
          error: `"${product.title}" has no recognised condition recorded`,
        });
        continue;
      }
      resolvedByCartItem.set(ci.id, {
        rawMethod,
        mappedMethod,
        condition,
        address: sel?.delivery_address ?? null,
        phone: sel?.contact_phone?.trim() || buyerProfile.phone || null,
      });
    }

    if (errors.length > 0) {
      return json({ error: "Some items need attention", validation_errors: errors }, 400);
    }

    // 4. Fetch seller profiles
    const sellerIds = [...new Set(cartItems.map((ci: any) => productMap.get(ci.product_id)?.seller_id).filter(Boolean))];
    const { data: sellerProfiles } = await admin.from("profiles").select("id, full_name, email, phone").in("id", sellerIds);
    const sellerMap = new Map((sellerProfiles || []).map((s: any) => [s.id, s]));

    // 5. Group cart items by seller
    const sellerGroups = new Map<string, Array<{ cartItem: any; product: any }>>();
    for (const ci of cartItems) {
      const product = productMap.get(ci.product_id)!;
      const sellerId = product.seller_id;
      if (!sellerGroups.has(sellerId)) sellerGroups.set(sellerId, []);
      sellerGroups.get(sellerId)!.push({ cartItem: ci, product });
    }

    // 5b. Resolve every persisted commitment BEFORE the first insert, so a
    // refusal can never strand a half-built transaction.
    //
    // The verification window IS a commitment: it is the clock the buyer is
    // held to, so it must come from the product or the vendor's effective
    // settings: never a literal, and never a guess.
    //
    // The delivery estimate is NOT a commitment: it is optional seller-supplied
    // information. When the seller left it blank we carry `null` through and
    // simply show no estimate, rather than blocking the sale.
    const verificationWindowBySeller = new Map<string, number>();
    const expectedDateBySeller = new Map<string, string | null>();
    for (const [sellerId, items] of sellerGroups) {
      const firstProduct = items[0].product;
      const productWindow =
        firstProduct.verification_window_hours === null || firstProduct.verification_window_hours === undefined
          ? null
          : Number(firstProduct.verification_window_hours);
      const verificationWindowHours =
        productWindow !== null && Number.isFinite(productWindow) && productWindow > 0
          ? productWindow
          : await resolveEffectiveTimeoutHours(sellerId, "buyer_verification_timeout");
      if (verificationWindowHours === null) {
        return json(
          {
            error: "verification_window_unresolved",
            reason: "No buyer verification window is configured for this seller.",
          },
          409,
        );
      }
      verificationWindowBySeller.set(sellerId, verificationWindowHours);

      const rawDeliveryDays = firstProduct.estimated_delivery_days;
      const parsedDays =
        rawDeliveryDays === null || rawDeliveryDays === undefined || rawDeliveryDays === ""
          ? null
          : Number.parseInt(String(rawDeliveryDays), 10);
      if (parsedDays === null || !Number.isFinite(parsedDays) || parsedDays < 0) {
        expectedDateBySeller.set(sellerId, null);
      } else {
        const expected = new Date();
        expected.setDate(expected.getDate() + parsedDays);
        expectedDateBySeller.set(sellerId, expected.toISOString().split("T")[0]);
      }
    }

    // 6. Create checkout session
    let subtotalAmount = 0;
    let totalProtectionFee = 0;

    // Pre-compute totals
    for (const [, items] of sellerGroups) {
      for (const { cartItem, product } of items) {
        const lineTotal = product.unit_price * cartItem.quantity;
        subtotalAmount += lineTotal;
      }
    }

    // Compute per-seller-group pricing and sum fees
    const sellerGroupPricings: Map<string, any> = new Map();
    const sellerGroupSnapshots: Map<string, ReturnType<typeof buildPricingSnapshot>> = new Map();
    for (const [sellerId, items] of sellerGroups) {
      let groupItemAmount = 0;
      for (const { cartItem, product } of items) {
        groupItemAmount += product.unit_price * cartItem.quantity;
      }
      const vendorConfig = await loadPricingConfig(sellerId);
      const pricing = computePricing(groupItemAmount, items[0].product.currency_code, "local", vendorConfig);
      const snapshot = buildPricingSnapshot(groupItemAmount, items[0].product.currency_code, vendorConfig);
      sellerGroupPricings.set(sellerId, pricing);
      sellerGroupSnapshots.set(sellerId, snapshot);
      totalProtectionFee += pricing.service_fee_amount;
    }

    const totalAmount = subtotalAmount + totalProtectionFee;

    // Gate: identity verification required if cart total crosses ANY vendor's
    // effective threshold. We take the min threshold across seller groups so
    // the strictest vendor rule wins.
    for (const [sellerId, pricing] of sellerGroupPricings) {
      const currency = sellerGroups.get(sellerId)?.[0]?.product.currency_code;
      if (!currency) {
        return json({ error: "currency_missing", reason: "A product in this checkout has no currency recorded." }, 409);
      }
      const kyc = await checkIdVerificationRequirement(
        buyerId,
        sellerId,
        currency,
        pricing.total_amount,
      );
      if (kyc) return json(kyc.body, kyc.status);
    }

    // The session currency comes from the goods, exactly like transaction_pricing.
    // Mixed currencies cannot be summed into one session total.
    const sessionCurrencies = new Set(
      cartItems
        .map((ci: any) => productMap.get(ci.product_id)?.currency_code)
        .filter((c: string | null | undefined) => !!c) as string[],
    );
    if (sessionCurrencies.size !== 1) {
      return json(
        {
          error: sessionCurrencies.size === 0 ? "currency_missing" : "mixed_currency_cart",
          reason:
            sessionCurrencies.size === 0
              ? "No currency is recorded on the products in this checkout."
              : "This cart mixes currencies; check out each currency separately.",
        },
        409,
      );
    }
    const sessionCurrency = [...sessionCurrencies][0];

    const { data: checkoutSession, error: csErr } = await admin
      .from("checkout_sessions")
      .insert({
        buyer_id: buyerId,
        status: "pending",
        currency_code: sessionCurrency,
        subtotal_amount: subtotalAmount,
        total_protection_fee: totalProtectionFee,
        total_amount: totalAmount,
      })
      .select("id")
      .single();

    if (csErr || !checkoutSession) throw csErr || new Error("Failed to create checkout session");
    console.log(`cart-checkout: created session=${checkoutSession.id}, buyer=${buyerId}, items=${cartItems.length}`);
    // 7. Create per-seller transactions
    const transactionResults: any[] = [];

    for (const [sellerId, items] of sellerGroups) {
      const sellerProfile = sellerMap.get(sellerId);
      const pricing = sellerGroupPricings.get(sellerId);
      const snapshot = sellerGroupSnapshots.get(sellerId)!;
      let groupItemAmount = 0;
      for (const { cartItem, product } of items) {
        groupItemAmount += product.unit_price * cartItem.quantity;
      }

      // Check for existing awaiting_payment transaction for same buyer+seller in this checkout pattern
      // For idempotency: check if there's already a pending tx for each product
      let existingTx: any = null;
      if (items.length === 1) {
        const { data: existing } = await admin
          .from("transactions")
          .select("id, share_token, transaction_code, status")
          .eq("buyer_id", buyerId)
          .eq("source_product_id", items[0].product.id)
          .eq("status", "awaiting_payment")
          .maybeSingle();

        if (existing) {
          // Only ADOPT a complete transaction. An incomplete one (no pricing,
          // no share link) would otherwise be handed back as a 200 whose
          // review page has nothing to show and whose payment cannot start.
          const [{ count: pricingCount }, { count: linkCount }] = await Promise.all([
            admin.from("transaction_pricing").select("transaction_id", { count: "exact", head: true })
              .eq("transaction_id", existing.id),
            admin.from("transaction_links").select("transaction_id", { count: "exact", head: true })
              .eq("transaction_id", existing.id),
          ]);
          if ((pricingCount ?? 0) > 0 && (linkCount ?? 0) > 0 && existing.share_token) {
            existingTx = existing;
          } else {
            console.warn(`cart-checkout: ignoring incomplete transaction ${existing.id}; creating a fresh one`);
          }
        }
      }

      let transactionId: string;
      let shareToken: string;
      let transactionCode: string;

      if (existingTx) {
        // Reuse existing transaction: update pricing if needed
        transactionId = existingTx.id;
        shareToken = existingTx.share_token;
        transactionCode = existingTx.transaction_code;

        // Update checkout_session_id on the existing transaction
        await admin.from("transactions").update({ checkout_session_id: checkoutSession.id }).eq("id", transactionId);

        // Update pricing
        await admin.from("transaction_pricing").update({
          item_amount: groupItemAmount,
          platform_fee_amount: pricing.platform_fee_amount,
          buyer_total_amount: pricing.total_amount,
          payment_processing_fee_amount: snapshot.payment_processing_fee_amount,
          seller_payout_amount: snapshot.seller_payout_amount,
          is_total_service_fee_capped: snapshot.is_total_service_fee_capped,
          pricing_model_version: snapshot.pricing_model_version,
        }).eq("transaction_id", transactionId);

        // Reconcile transaction_items with the current cart contents
        // (qty may have changed since the prior pending checkout)
        const newItemRows = items.map(({ cartItem, product }: any) => ({
          transaction_id: transactionId,
          title: product.title,
          description: product.short_description || product.description || "",
          quantity: cartItem.quantity,
          // Validated before any write; the map lookup cannot be null here.
          condition_label: resolvedByCartItem.get(cartItem.id)!.condition,
          brand: product.brand,
          model: product.model,
        }));
        await admin.from("transaction_items").delete().eq("transaction_id", transactionId);
        if (newItemRows.length > 0) {
          await admin.from("transaction_items").insert(newItemRows);
        }

        // Reconcile delivery terms with the buyer's latest selection, exactly
        // like the `storefront-checkout` twin. Without this a retry after a
        // change of method or address persists the OLD terms on the agreement
        // while the response reports the new ones.
        {
          const firstResolved = resolvedByCartItem.get(items[0].cartItem.id)!;
          const needsAddress =
            firstResolved.rawMethod === "courier_shipping" || firstResolved.rawMethod === "delivery";
          const addr = firstResolved.address ?? {};
          await admin.from("transaction_delivery_terms").delete().eq("transaction_id", transactionId);
          await admin.from("transaction_delivery_terms").insert({
            transaction_id: transactionId,
            delivery_method: firstResolved.mappedMethod,
            expected_delivery_date: expectedDateBySeller.get(sellerId) ?? null,
            verification_window_hours: verificationWindowBySeller.get(sellerId)!,
            delivery_address_line1: needsAddress ? (addr.line1 ?? null) : null,
            delivery_address_line2: needsAddress ? (addr.line2 ?? null) : null,
            delivery_city: needsAddress ? (addr.city ?? null) : null,
            delivery_state: needsAddress ? (addr.state ?? null) : null,
            delivery_postal_code: needsAddress ? (addr.postal_code ?? null) : null,
            delivery_country_code: needsAddress ? (addr.country_code ?? null) : null,
          });
        }

        // Reconcile reserved_quantity per product for THIS transaction.
        // Look up previously logged reservation delta for this tx, compute
        // the desired delta, and adjust.
        for (const { cartItem, product } of items) {
          const { data: priorLogs } = await admin
            .from("product_inventory_logs")
            .select("quantity_delta, change_type")
            .eq("product_id", product.id)
            .eq("reference_type", "transaction")
            .eq("reference_id", transactionId)
            .in("change_type", ["reserve", "release"]);

          const priorReserved = (priorLogs || []).reduce(
            (s: number, r: any) => s + (Number(r.quantity_delta) || 0),
            0,
          );
          const desiredQty = cartItem.quantity;
          const delta = desiredQty - priorReserved;

          if (delta !== 0) {
            const newReserved = Math.max(0, product.reserved_quantity + delta);
            await admin
              .from("products")
              .update({ reserved_quantity: newReserved })
              .eq("id", product.id);

            await admin.from("product_inventory_logs").insert({
              product_id: product.id,
              change_type: delta > 0 ? "reserve" : "release",
              quantity_delta: delta,
              balance_after: product.stock_quantity - newReserved,
              reference_type: "transaction",
              reference_id: transactionId,
              notes: `Reservation adjusted on cart checkout retry (${priorReserved} → ${desiredQty})`,
              changed_by_user_id: buyerId,
            });
          }
        }
      } else {
        // Create new transaction
        const { data: txCode } = await admin.rpc("generate_transaction_code");
        shareToken = generateShareToken();
        transactionCode = txCode ?? `SD-${Date.now()}`;

        const { data: newTx, error: txErr } = await admin
          .from("transactions")
          .insert({
            transaction_code: transactionCode,
            seller_id: sellerId,
            buyer_id: buyerId,
            created_by_user_id: buyerId,
            buyer_contact_email: buyerProfile.email,
            share_token: shareToken,
            status: "awaiting_payment",
            money_status: "not_secured",
            dispute_status: "none",
            source_product_id: items.length === 1 ? items[0].product.id : null,
            checkout_session_id: checkoutSession.id,
          })
          .select("id")
          .single();

        if (txErr || !newTx) {
          console.error("Failed to create transaction:", txErr);
          throw new Error("Failed to create transaction");
        }
        transactionId = newTx.id;

        // Create related records
        const txItemInserts: any[] = [];
        for (const { cartItem, product } of items as any[]) {
          const condition = resolvedByCartItem.get(cartItem.id)!.condition;
          txItemInserts.push({
            transaction_id: transactionId,
            title: product.title,
            description: product.short_description || product.description || "",
            quantity: cartItem.quantity,
            condition_label: condition,
            brand: product.brand,
            model: product.model,
          });
        }

        // Use the buyer's selection captured at validation time
        const firstProduct = items[0].product;
        const firstResolved = resolvedByCartItem.get(items[0].cartItem.id)!;
        const primaryDeliveryMethod = firstResolved.mappedMethod;
        const needsAddress = firstResolved.rawMethod === "courier_shipping" || firstResolved.rawMethod === "delivery";
        const addr = firstResolved.address ?? {};
        // Resolved in step 5b, before any insert.
        const expectedDeliveryDate = expectedDateBySeller.get(sellerId) ?? null;
        const verificationWindowHours = verificationWindowBySeller.get(sellerId)!;

        await Promise.all([
          admin.from("transaction_items").insert(txItemInserts),
          admin.from("transaction_pricing").insert({
            transaction_id: transactionId,
            currency_code: firstProduct.currency_code,
            item_amount: groupItemAmount,
            platform_fee_amount: pricing.platform_fee_amount,
            buyer_total_amount: pricing.total_amount,
            payment_processing_fee_amount: snapshot.payment_processing_fee_amount,
            seller_payout_amount: snapshot.seller_payout_amount,
            is_total_service_fee_capped: snapshot.is_total_service_fee_capped,
            pricing_model_version: snapshot.pricing_model_version,
          }),
          admin.from("transaction_delivery_terms").insert({
            transaction_id: transactionId,
            delivery_method: primaryDeliveryMethod,
            expected_delivery_date: expectedDeliveryDate,
            verification_window_hours: verificationWindowHours,
            delivery_address_line1: needsAddress ? (addr.line1 ?? null) : null,
            delivery_address_line2: needsAddress ? (addr.line2 ?? null) : null,
            delivery_city: needsAddress ? (addr.city ?? null) : null,
            delivery_state: needsAddress ? (addr.state ?? null) : null,
            delivery_postal_code: needsAddress ? (addr.postal_code ?? null) : null,
            delivery_country_code: needsAddress ? (addr.country_code ?? null) : null,
          }),
          admin.from("transaction_participants").insert([
            {
              transaction_id: transactionId,
              role: "buyer",
              user_id: buyerId,
              display_name: buyerProfile.full_name || "Buyer",
              email: buyerProfile.email,
              phone: buyerProfile.phone,
            },
            {
              transaction_id: transactionId,
              role: "seller",
              user_id: sellerId,
              display_name: sellerProfile?.full_name || "Seller",
              email: sellerProfile?.email,
              phone: sellerProfile?.phone,
            },
          ]),
          admin.from("transaction_links").insert({
            transaction_id: transactionId,
            share_token: shareToken,
            url: `/t/${shareToken}`,
            is_active: true,
            expires_at: shareLinkExpiresAt(),
          }),
          admin.from("escrow_states").insert({
            transaction_id: transactionId,
            state: "awaiting_payment",
            held_amount: 0,
          }),
        ]);

        // Reserve stock for each product + log inventory change
        for (const { cartItem, product } of items) {
          const newReserved = product.reserved_quantity + cartItem.quantity;
          await admin
            .from("products")
            .update({ reserved_quantity: newReserved })
            .eq("id", product.id);

          // Log reserve (idempotent on (product, transaction))
          const { data: existingLog } = await admin
            .from("product_inventory_logs")
            .select("id")
            .eq("product_id", product.id)
            .eq("change_type", "reserve")
            .eq("reference_type", "transaction")
            .eq("reference_id", transactionId)
            .maybeSingle();

          if (!existingLog) {
            await admin.from("product_inventory_logs").insert({
              product_id: product.id,
              change_type: "reserve",
              quantity_delta: cartItem.quantity,
              balance_after: product.stock_quantity - newReserved,
              reference_type: "transaction",
              reference_id: transactionId,
              notes: "Stock reserved at cart checkout",
              changed_by_user_id: buyerId,
            });
          }
        }
      }

      // Create checkout_session_items
      for (const { cartItem, product } of items) {
        await admin.from("checkout_session_items").insert({
          checkout_session_id: checkoutSession.id,
          cart_item_id: cartItem.id,
          product_id: product.id,
          seller_id: sellerId,
          quantity: cartItem.quantity,
          unit_price: product.unit_price,
          line_total: product.unit_price * cartItem.quantity,
          transaction_id: transactionId,
        });
      }

      transactionResults.push({
        transaction_id: transactionId,
        share_token: shareToken,
        transaction_code: transactionCode,
        seller_name: sellerProfile?.full_name || "Seller",
        seller_id: sellerId,
        items: items.map(({ cartItem, product }: any) => ({
          product_id: product.id,
          title: product.title,
          quantity: cartItem.quantity,
          unit_price: product.unit_price,
          line_total: product.unit_price * cartItem.quantity,
        })),
        subtotal: groupItemAmount,
        protection_fee: pricing.service_fee_amount,
        total: pricing.total_amount,
      });
    }

    return json({
      checkout_session_id: checkoutSession.id,
      transactions: transactionResults,
      totals: {
        subtotal: subtotalAmount,
        total_protection_fee: totalProtectionFee,
        total_amount: totalAmount,
        currency_code: sessionCurrency,
      },
    });
  } catch (err) {
    console.error("cart-checkout error:", err);
    return json({ error: err.message || "Internal server error" }, 500);
  }
});
