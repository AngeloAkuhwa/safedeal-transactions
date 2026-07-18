// Resolver for /offer/:offerToken — validates, links, reuses-or-creates a transaction, redirects.
// Locked responsibility: validate → link → reuse-or-create tx → return redirect_to.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { computePricing } from "../_shared/pricing.ts";
import { buildPricingSnapshot } from "../_shared/safedeal-money-policy.ts";
import { loadPricingConfig, loadEffectiveTimeoutHours } from "../_shared/settings-resolver.ts";
import { checkIdVerificationRequirement } from "../_shared/security-resolver.ts";

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

// States we can REUSE a pre-purchase transaction in.
const REUSABLE_PRE_PAYMENT_STATES = ["draft", "awaiting_buyer", "awaiting_payment"];
// States that mean payment is done or beyond — resume into existing tx.
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

    // Already purchased — resume into existing tx
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

    // No reusable tx — create one fresh
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
  } catch (err) {
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
// Create the buyer transaction lazily from offer + offer_items snapshots.
// ─────────────────────────────────────────────────────────────────────────────
async function createTransactionFromOffer(adminClient: any, offer: any, buyerId: string): Promise<string | null> {
  const items = await fetchOfferItems(adminClient, offer.id);
  if (items.length === 0) {
    console.error("Cannot create tx: offer has no items", offer.id);
    return null;
  }

  // Fetch seller delivery terms via the first product (all items share delivery)
  const { data: firstProduct } = await adminClient
    .from("products")
    .select("delivery_method, verification_window_hours, estimated_delivery_days, seller_notes, currency_code")
    .eq("id", offer.product_id)
    .maybeSingle();

  let deliveryMethod = "courier";
  try {
    const parsed = JSON.parse(firstProduct?.delivery_method || "[]");
    if (Array.isArray(parsed) && parsed[0]) deliveryMethod = parsed[0];
  } catch { /* keep default */ }

  const verificationWindow = firstProduct?.verification_window_hours
    || await loadEffectiveTimeoutHours(offer.seller_id, "buyer_verification_timeout", 72);
  const currencyCode = items[0].currency_code || firstProduct?.currency_code || "NGN";

  const totalAmount = items.reduce((sum, it) => sum + (Number(it.unit_price_snapshot) * (it.quantity || 1)), 0);
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
  if (kyc) {
    // Signal caller (claim-offer HTTP handler) — throw to bubble up as 403 JSON.
    const err: any = new Error("identity_verification_required");
    err.__httpStatus = kyc.status;
    err.__httpBody = kyc.body;
    throw err;
  }

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
  const aggregateDescription = items.map((i: any) => `• ${i.quantity}x ${i.product_title} — ${i.currency_code} ${Number(i.unit_price_snapshot).toLocaleString()}`).join("\n");
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
      condition_label: items[0].condition_summary || "brand_new",
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
      expected_delivery_date: new Date(Date.now() + (parseInt(firstProduct?.estimated_delivery_days || "7") * 86400000)).toISOString(),
      verification_window_hours: verificationWindow,
    }),
    adminClient.from("transaction_notes").insert({
      transaction_id: txId,
      seller_notes: firstProduct?.seller_notes || null,
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
      { transaction_id: txId, share_token: shareToken, url: `/t/${shareToken}`, is_active: true },
      { onConflict: "transaction_id" },
    ),
  ]);

  return txId;
}
