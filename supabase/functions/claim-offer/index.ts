// Resolver for /offer/:offerToken: validates, links, reuses-or-creates a transaction, redirects.
// Locked responsibility: validate → link → reuse-or-create tx → return redirect_to.
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
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function maskEmail(email: string | null): string {
  if (!email) return "—";
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const visible = local.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(1, local.length - 2))}@${domain}`;
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
 * FAIL CLOSED (mirrors `storefront-checkout` and `cart-checkout`): an unmapped
 * condition or delivery method is a fact about someone else's goods, persisted
 * into the agreement the buyer is asked to pay against. Refuse rather than
 * invent "brand new" or "courier". All three maps must stay identical.
 */
const CONDITION_MAP: Record<string, string> = {
  brand_new: "brand_new",
  like_new: "like_new",
  refurbished: "excellent",
  used_good: "good",
  used_fair: "fair",
};
function mapCondition(productCondition: string | null): string | null {
  const raw = productCondition ?? "";
  if (CONDITION_MAP[raw]) return CONDITION_MAP[raw];
  return null;
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

function httpError(status: number, body: unknown): Error {
  const err: any = new Error("claim_offer_refused");
  err.__httpStatus = status;
  err.__httpBody = body;
  return err;
}

// States we can REUSE a pre-purchase transaction in.
const REUSABLE_PRE_PAYMENT_STATES = ["draft", "awaiting_buyer", "awaiting_payment"];
// States that mean payment is done or beyond. Resume into existing tx.
const RESUME_STATES = [
  "payment_secured",
  "seller_preparing_delivery",
  "seller_dispatched",
  "delivered_awaiting_verification",
  "completed",
  "disputed",
  "resolved",
  "refunded",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    let callerId: string | null = null;
    let callerEmail: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const { data: userData } = await adminClient.auth.getUser(token);
      if (userData?.user) {
        callerId = userData.user.id;
        callerEmail = userData.user.email?.toLowerCase() || null;
      }
    }

    const body = await req.json().catch(() => ({}));
    const action = (body.action as string) || "view";
    const offerToken = body.offer_token as string;

    if (!offerToken) return jsonResponse({ error: "offer_token required" }, 400);

    // Auto-expire stale offers
    try {
      await adminClient.rpc("expire_stale_offers");
    } catch (_e) {
      // best-effort; ignore failure
    }

    // Fetch offer + items
    const { data: offer, error: offerErr } = await adminClient
      .from("buyer_specific_product_offers")
      .select("id, product_id, seller_id, buyer_id, buyer_email, status, expires_at, claimed_at, purchased_at")
      .eq("offer_token", offerToken)
      .maybeSingle();

    if (offerErr || !offer) {
      return jsonResponse({ scenario: "not_found", error: "Offer not found" }, 404);
    }

    const seller = await fetchSellerSummary(adminClient, offer.seller_id);
    const offerEmail = (offer.buyer_email || "").toLowerCase();
    const matchesByLink = callerId && offer.buyer_id === callerId;
    const matchesByEmail = callerEmail && offerEmail && callerEmail === offerEmail;

    // Terminal states
    if (offer.status === "expired") {
      return jsonResponse({ scenario: "expired", offer: publicOffer(offer), seller });
    }
    if (offer.status === "cancelled") {
      return jsonResponse({ scenario: "cancelled", offer: publicOffer(offer), seller });
    }

    // Already purchased: resume into existing tx
    if (offer.status === "purchased") {
      if (callerId && (matchesByLink || matchesByEmail)) {
        const { data: tx } = await adminClient
          .from("transactions")
          .select("id")
          .eq("source_offer_id", offer.id)
          .eq("buyer_id", callerId)
          .maybeSingle();
        return jsonResponse({
          scenario: "already_purchased",
          transaction_id: tx?.id ?? null,
          redirect_to: tx?.id ? `/dashboard/transactions/${tx.id}` : null,
        });
      }
      return jsonResponse({ scenario: "already_purchased", transaction_id: null });
    }

    // Anonymous viewer
    if (!callerId) {
      const items = await fetchOfferItems(adminClient, offer.id);
      return jsonResponse({
        scenario: "anon_view",
        offer: publicOffer(offer),
        items,
        seller,
        intended_email_hint: maskEmail(offer.buyer_email),
      });
    }

    // Wrong account
    if (!matchesByLink && !matchesByEmail) {
      return jsonResponse({
        scenario: "wrong_account",
        offer: publicOffer(offer),
        intended_email_hint: maskEmail(offer.buyer_email),
      });
    }

    // ── Signed in & matches ──
    // Action: "view" returns ready_to_claim; "claim" performs reuse-or-create + redirect.
    if (action !== "claim") {
      const items = await fetchOfferItems(adminClient, offer.id);
      return jsonResponse({
        scenario: "ready_to_claim",
        offer: publicOffer(offer),
        items,
        seller,
      });
    }

    // ── action === "claim" ──
    // 1. Auto-link if needed
    if (!offer.buyer_id) {
      await adminClient
        .from("buyer_specific_product_offers")
        .update({ buyer_id: callerId, status: "linked", linked_at: new Date().toISOString() })
        .eq("id", offer.id);
      offer.buyer_id = callerId;
      offer.status = "linked";
    }

    // 2. Reuse-or-create transaction
    const { data: existingTxs } = await adminClient
      .from("transactions")
      .select("id, status")
      .eq("source_offer_id", offer.id)
      .eq("buyer_id", callerId)
      .order("created_at", { ascending: false });

    // Resume terminal-or-paid txs
    const resumable = (existingTxs || []).find((t: any) => RESUME_STATES.includes(t.status));
    if (resumable) {
      return jsonResponse({
        scenario: "resume_transaction",
        transaction_id: resumable.id,
        redirect_to: `/dashboard/transactions/${resumable.id}`,
      });
    }

    // Reuse pre-payment tx
    const reusable = (existingTxs || []).find((t: any) => REUSABLE_PRE_PAYMENT_STATES.includes(t.status));
    if (reusable) {
      // The gates belong to the ACT of putting a buyer in front of a payment,
      // not to the act of inserting a row. Advancing a pre-existing draft to
      // `awaiting_payment` is that same act, so the platform kill switch and
      // the KYC threshold must be evaluated here too.
      // Use the plan, don't just run it for its gate side-effects: a seller may
      // have edited price, currency, window or delivery method since the draft
      // was minted, and the buyer must be advanced against current terms.
      const reusePlan = await buildOfferPlan(adminClient, offer, callerId);
      await rewriteTransactionTerms(adminClient, reusable.id, reusePlan);
      // Advance to awaiting_payment if still in draft / awaiting_buyer
      if (reusable.status === "draft" || reusable.status === "awaiting_buyer") {
        const { error: advErr } = await adminClient
          .from("transactions")
          .update({ status: "awaiting_payment" })
          .eq("id", reusable.id);
        if (advErr) console.error("Failed to advance reused tx to awaiting_payment:", advErr);
      }
      // Promote offer to claimed if not already
      if (offer.status !== "claimed") {
        await adminClient
          .from("buyer_specific_product_offers")
          .update({ status: "claimed", claimed_at: new Date().toISOString() })
          .eq("id", offer.id);
        await adminClient.from("offer_events").insert({
          offer_id: offer.id,
          event_type: "claimed_by_buyer",
          actor_user_id: callerId,
          metadata: { reused_transaction_id: reusable.id },
        });
      }
      return jsonResponse({
        scenario: "claimed",
        transaction_id: reusable.id,
        redirect_to: `/dashboard/transactions/${reusable.id}/agreement`,
      });
    }

    // No reusable tx: create one fresh
    const txId = await createTransactionFromOffer(adminClient, offer, callerId);
    if (!txId) return jsonResponse({ error: "Failed to create transaction" }, 500);

    await adminClient
      .from("buyer_specific_product_offers")
      .update({ status: "claimed", claimed_at: new Date().toISOString() })
      .eq("id", offer.id);
    await adminClient.from("offer_events").insert({
      offer_id: offer.id,
      event_type: "claimed_by_buyer",
      actor_user_id: callerId,
      metadata: { transaction_id: txId },
    });

    return jsonResponse({
      scenario: "claimed",
      transaction_id: txId,
      redirect_to: `/dashboard/transactions/${txId}/agreement`,
    });
  } catch (err: any) {
    if (err?.__httpStatus && err?.__httpBody) {
      return jsonResponse(err.__httpBody, err.__httpStatus);
    }
    console.error("claim-offer error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});

async function fetchOfferItems(adminClient: any, offerId: string) {
  const { data } = await adminClient
    .from("buyer_specific_offer_items")
    .select("id, product_title, short_description, condition_summary, quantity, unit_price_snapshot, currency_code, primary_media_url, position")
    .eq("offer_id", offerId)
    .order("position", { ascending: true });
  return data || [];
}

function publicOffer(o: any) {
  return {
    id: o.id,
    status: o.status,
    expires_at: o.expires_at,
    claimed_at: o.claimed_at,
    purchased_at: o.purchased_at,
  };
}

async function fetchSellerSummary(adminClient: any, sellerId: string) {
  const { data } = await adminClient
    .from("profiles")
    .select("id, full_name, avatar_url, store_slug, created_at")
    .eq("id", sellerId)
    .maybeSingle();
  return data
    ? {
        id: data.id,
        full_name: data.full_name,
        avatar_url: data.avatar_url,
        store_slug: data.store_slug,
        member_since: data.created_at,
      }
    : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolve and validate EVERYTHING the transaction commits to, before any write.
// Throws an httpError on refusal so no half-built transaction can be minted.
// Also runs the two authorization gates (commerce kill switch, KYC threshold),
// which is why both the create and the reuse branch call it.
// ─────────────────────────────────────────────────────────────────────────────
async function buildOfferPlan(adminClient: any, offer: any, buyerId: string) {
  const items = await fetchOfferItems(adminClient, offer.id);
  if (items.length === 0) {
    throw httpError(409, { error: "offer_has_no_items", reason: "This offer has no items to purchase." });
  }

  // Seller delivery terms come from the first product (all items share delivery)
  const { data: firstProduct } = await adminClient
    .from("products")
    .select("delivery_method, verification_window_hours, estimated_delivery_days, seller_notes, currency_code")
    .eq("id", offer.product_id)
    .maybeSingle();

  if (!firstProduct) {
    throw httpError(409, { error: "product_missing", reason: "The product behind this offer is no longer available." });
  }

  // Commerce gate: platform kill switch + vendor active check
  const gate = await checkCheckoutAllowed(offer.seller_id);
  if (gate) throw httpError(gate.status, gate.body);

  // ── Delivery method: mapped through the shared vocabulary, never raw ──
  let enabledMethods: string[] = [];
  if (firstProduct.delivery_method) {
    try {
      const parsed = JSON.parse(firstProduct.delivery_method);
      enabledMethods = Array.isArray(parsed) ? parsed : [String(parsed)];
    } catch {
      enabledMethods = [String(firstProduct.delivery_method)];
    }
  }
  if (enabledMethods.length === 0) {
    throw httpError(409, {
      error: "delivery_method_missing",
      reason: "The seller has not configured any delivery method for this product.",
    });
  }
  const mapped = enabledMethods.map((m) => mapDeliveryMethod(m));
  if (mapped.some((m) => m === null)) {
    const bad = enabledMethods.filter((_m, i) => mapped[i] === null);
    throw httpError(409, {
      error: "delivery_method_unmapped",
      reason: `'${bad.join(", ")}' is not a delivery method SafeDeal can record.`,
    });
  }
  const distinct = [...new Set(mapped as string[])];
  if (distinct.length !== 1) {
    // An offer carries no buyer delivery selection, so with several distinct
    // handoff shapes we cannot know which one the agreement commits to.
    throw httpError(409, {
      error: "delivery_method_ambiguous",
      reason: "This product offers several delivery methods; the seller must send a single-method offer.",
    });
  }
  const deliveryMethod = distinct[0];

  // ── Condition: mapped, never invented ──
  const conditionLabel = mapCondition(items[0].condition_summary);
  if (!conditionLabel) {
    throw httpError(409, {
      error: "condition_unmapped",
      reason: `"${items[0].product_title}" has no recognised condition recorded.`,
    });
  }

  // ── Verification window IS a commitment: resolve strictly ──
  const productWindow =
    firstProduct.verification_window_hours === null || firstProduct.verification_window_hours === undefined
      ? null
      : Number(firstProduct.verification_window_hours);
  const verificationWindow =
    productWindow !== null && Number.isFinite(productWindow) && productWindow > 0
      ? productWindow
      : await resolveEffectiveTimeoutHours(offer.seller_id, "buyer_verification_timeout");
  if (verificationWindow === null) {
    throw httpError(409, {
      error: "verification_window_unresolved",
      reason: "No buyer verification window is configured for this seller.",
    });
  }

  // ── Delivery estimate is NOT a commitment: null is legal, show none ──
  const rawDeliveryDays = firstProduct.estimated_delivery_days;
  const parsedDays =
    rawDeliveryDays === null || rawDeliveryDays === undefined || rawDeliveryDays === ""
      ? null
      : Number.parseInt(String(rawDeliveryDays), 10);
  let expectedDeliveryDate: string | null = null;
  if (parsedDays !== null && Number.isFinite(parsedDays) && parsedDays >= 0) {
    const expected = new Date();
    expected.setDate(expected.getDate() + parsedDays);
    expectedDeliveryDate = expected.toISOString().split("T")[0];
  }

  // ── Currency comes from the goods ──
  const currencyCode = firstProduct.currency_code || items[0].currency_code;
  if (!currencyCode) {
    throw httpError(409, { error: "currency_missing", reason: "No currency is recorded on this product." });
  }

  const totalAmount = items.reduce(
    (sum: number, it: any) => sum + (Number(it.unit_price_snapshot) * (it.quantity || 1)),
    0,
  );
  const vendorConfig = await loadPricingConfig(offer.seller_id);
  const pricing = computePricing(totalAmount, currencyCode, "local", vendorConfig);
  const snapshot = buildPricingSnapshot(totalAmount, currencyCode, vendorConfig);

  // Gate: identity verification required above vendor/platform threshold
  const kyc = await checkIdVerificationRequirement(
    buyerId,
    offer.seller_id,
    currencyCode,
    pricing.total_amount,
  );
  if (kyc) throw httpError(kyc.status, kyc.body);

  return {
    items,
    firstProduct,
    deliveryMethod,
    conditionLabel,
    verificationWindow,
    expectedDeliveryDate,
    currencyCode,
    totalAmount,
    pricing,
    snapshot,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Create the buyer transaction lazily from offer + offer_items snapshots.
// ─────────────────────────────────────────────────────────────────────────────
async function createTransactionFromOffer(adminClient: any, offer: any, buyerId: string): Promise<string | null> {
  const plan = await buildOfferPlan(adminClient, offer, buyerId);
  const {
    items, firstProduct, deliveryMethod, conditionLabel, verificationWindow,
    expectedDeliveryDate, currencyCode, totalAmount, pricing, snapshot,
  } = plan;

  const { data: codeData } = await adminClient.rpc("generate_transaction_code");
  const transactionCode = codeData ?? `SD-${Date.now()}`;
  const shareToken = generateShareToken();

  const { data: newTx, error: txErr } = await adminClient
    .from("transactions")
    .insert({
      transaction_code: transactionCode,
      seller_id: offer.seller_id,
      buyer_id: buyerId,
      created_by_user_id: offer.seller_id,
      buyer_contact_email: offer.buyer_email,
      share_token: shareToken,
      status: "awaiting_payment",
      money_status: "not_secured",
      dispute_status: "none",
      source_product_id: offer.product_id,
      source_offer_id: offer.id,
    })
    .select("id")
    .single();

  if (txErr || !newTx) {
    console.error("Failed to create tx from offer:", txErr);
    return null;
  }
  const txId = newTx.id;

  // Build summary item title for legacy single-item display
  const aggregateTitle = items.length === 1
    ? items[0].product_title
    : `Bundle: ${items.length} items (${items[0].product_title}${items.length > 2 ? ` and ${items.length - 1} more` : items.length === 2 ? ` and 1 more` : ""})`;
  const aggregateDescription = items.map((i: any) => `• ${i.quantity}x ${i.product_title}. ${i.currency_code} ${Number(i.unit_price_snapshot).toLocaleString()}`).join("\n");
  const totalQuantity = items.reduce((s: number, i: any) => s + (i.quantity || 1), 0);

  // Buyer profile for participants
  const { data: buyerProfile } = await adminClient
    .from("profiles")
    .select("full_name, email, phone")
    .eq("id", buyerId)
    .maybeSingle();

  await Promise.all([
    adminClient.from("transaction_items").insert({
      transaction_id: txId,
      title: aggregateTitle,
      description: aggregateDescription,
      quantity: totalQuantity,
      condition_label: conditionLabel,
    }),
    adminClient.from("transaction_pricing").insert({
      transaction_id: txId,
      currency_code: currencyCode,
      item_amount: totalAmount,
      platform_fee_amount: pricing.platform_fee_amount,
      buyer_total_amount: pricing.total_amount,
      payment_processing_fee_amount: snapshot.payment_processing_fee_amount,
      seller_payout_amount: snapshot.seller_payout_amount,
      is_total_service_fee_capped: snapshot.is_total_service_fee_capped,
      pricing_model_version: snapshot.pricing_model_version,
    }),
    adminClient.from("transaction_delivery_terms").insert({
      transaction_id: txId,
      delivery_method: deliveryMethod,
      expected_delivery_date: expectedDeliveryDate,
      verification_window_hours: verificationWindow,
    }),
    adminClient.from("transaction_notes").insert({
      transaction_id: txId,
      seller_notes: firstProduct.seller_notes || null,
    }),
    adminClient.from("transaction_participants").insert([
      {
        transaction_id: txId,
        role: "buyer",
        display_name: buyerProfile?.full_name || "Buyer",
        email: buyerProfile?.email || offer.buyer_email,
        phone: buyerProfile?.phone || null,
        user_id: buyerId,
      },
      {
        transaction_id: txId,
        role: "seller",
        display_name: "",
        user_id: offer.seller_id,
      },
    ]),
    adminClient.from("transaction_links").upsert(
      { transaction_id: txId, share_token: shareToken, url: `/t/${shareToken}`, is_active: true, expires_at: shareLinkExpiresAt() },
      { onConflict: "transaction_id" },
    ),
    // Both checkout twins create this row; without it an offer-funded
    // transaction holds money that no admin escrow surface can see, because
    // `record_payment_capture_atomic` only UPDATEs an existing row.
    adminClient.from("escrow_states").insert({
      transaction_id: txId,
      state: "awaiting_payment",
      held_amount: 0,
    }),
  ]);

  return txId;
}

/**
 * Re-persist the money and delivery commitments of an existing pre-payment
 * transaction from a freshly-built plan. Mirrors the delete-and-reinsert the
 * checkout twins perform on their reuse branches.
 */
async function rewriteTransactionTerms(
  adminClient: any,
  txId: string,
  plan: Awaited<ReturnType<typeof buildOfferPlan>>,
): Promise<void> {
  const { deliveryMethod, conditionLabel, verificationWindow, expectedDeliveryDate, currencyCode, totalAmount, pricing, snapshot } = plan;

  await adminClient.from("transaction_pricing").delete().eq("transaction_id", txId);
  await adminClient.from("transaction_pricing").insert({
    transaction_id: txId,
    currency_code: currencyCode,
    item_amount: totalAmount,
    platform_fee_amount: pricing.platform_fee_amount,
    buyer_total_amount: pricing.total_amount,
    payment_processing_fee_amount: snapshot.payment_processing_fee_amount,
    seller_payout_amount: snapshot.seller_payout_amount,
    is_total_service_fee_capped: snapshot.is_total_service_fee_capped,
    pricing_model_version: snapshot.pricing_model_version,
  });

  await adminClient.from("transaction_delivery_terms").delete().eq("transaction_id", txId);
  await adminClient.from("transaction_delivery_terms").insert({
    transaction_id: txId,
    delivery_method: deliveryMethod,
    expected_delivery_date: expectedDeliveryDate,
    verification_window_hours: verificationWindow,
  });

  await adminClient
    .from("transaction_items")
    .update({ condition_label: conditionLabel })
    .eq("transaction_id", txId);

  // Escrow row may be absent on transactions minted before this was fixed.
  const { data: escrow } = await adminClient
    .from("escrow_states")
    .select("id")
    .eq("transaction_id", txId)
    .maybeSingle();
  if (!escrow) {
    await adminClient.from("escrow_states").insert({
      transaction_id: txId,
      state: "awaiting_payment",
      held_amount: 0,
    });
  }
}
