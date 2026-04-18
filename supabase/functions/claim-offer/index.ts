// Public token resolver for buyer-specific (private) offers.
// Handles all 9 claim-page scenarios from Batch 5 §5.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Get caller identity (optional; offer can be viewed anonymously)
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

    if (!offerToken) {
      return jsonResponse({ error: "offer_token required" }, 400);
    }

    // Auto-expire stale offers globally on every read
    await adminClient.rpc("expire_stale_offers").catch(() => {});

    // Fetch offer + product + seller
    const { data: offer, error: offerErr } = await adminClient
      .from("buyer_specific_product_offers")
      .select("id, product_id, seller_id, buyer_id, buyer_email, status, expires_at, claimed_at, purchased_at")
      .eq("offer_token", offerToken)
      .maybeSingle();

    if (offerErr || !offer) {
      return jsonResponse({ scenario: "not_found", error: "Offer not found" }, 404);
    }

    // Determine scenario
    const offerEmail = (offer.buyer_email || "").toLowerCase();
    const matchesByLink = callerId && offer.buyer_id === callerId;
    const matchesByEmail = callerEmail && offerEmail && callerEmail === offerEmail;

    // Terminal status checks
    if (offer.status === "expired") {
      const seller = await fetchSellerSummary(adminClient, offer.seller_id);
      return jsonResponse({ scenario: "expired", offer: publicOffer(offer), seller });
    }
    if (offer.status === "cancelled") {
      const seller = await fetchSellerSummary(adminClient, offer.seller_id);
      return jsonResponse({ scenario: "cancelled", offer: publicOffer(offer), seller });
    }
    if (offer.status === "purchased") {
      // If buyer is the caller, route to their tx; else show generic message
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
        });
      }
      return jsonResponse({ scenario: "already_purchased", transaction_id: null });
    }

    // Check active awaiting_payment transaction
    if (callerId && (matchesByLink || matchesByEmail)) {
      const { data: activeTx } = await adminClient
        .from("transactions")
        .select("id, status")
        .eq("source_offer_id", offer.id)
        .eq("buyer_id", callerId)
        .in("status", ["awaiting_payment", "payment_secured"])
        .maybeSingle();
      if (activeTx) {
        return jsonResponse({
          scenario: "resume_transaction",
          transaction_id: activeTx.id,
          status: activeTx.status,
        });
      }
    }

    // Fetch product + seller for display
    const [productRes, sellerRes, mediaRes] = await Promise.all([
      adminClient
        .from("products")
        .select("id, title, slug, short_description, description, unit_price, currency_code, stock_quantity, reserved_quantity, condition_label, brand, model, status, visibility_type, verification_window_hours, estimated_delivery_days")
        .eq("id", offer.product_id)
        .maybeSingle(),
      adminClient
        .from("profiles")
        .select("id, full_name, avatar_url, store_slug, created_at")
        .eq("id", offer.seller_id)
        .maybeSingle(),
      adminClient
        .from("product_media")
        .select("file_id, media_type, sort_order, is_primary, files(file_url, secure_url)")
        .eq("product_id", offer.product_id)
        .order("sort_order"),
    ]);

    const product = productRes.data;
    const seller = sellerRes.data;

    if (!product || !seller) {
      return jsonResponse({ scenario: "not_found", error: "Offer content unavailable" }, 404);
    }

    if (product.status !== "published") {
      return jsonResponse({ scenario: "expired", offer: publicOffer(offer), seller: sellerSummary(seller) });
    }

    const media = (mediaRes.data || []).map((m: any) => ({
      file_url: m.files?.secure_url || m.files?.file_url || null,
      media_type: m.media_type,
      is_primary: m.is_primary,
    }));

    const productSummary = {
      id: product.id,
      title: product.title,
      short_description: product.short_description,
      description: product.description,
      unit_price: Number(product.unit_price),
      currency_code: product.currency_code,
      condition_label: product.condition_label,
      brand: product.brand,
      model: product.model,
      stock_quantity: product.stock_quantity,
      available_quantity: product.stock_quantity - product.reserved_quantity,
      verification_window_hours: product.verification_window_hours,
      estimated_delivery_days: product.estimated_delivery_days,
      media,
    };

    const sellerSum = {
      id: seller.id,
      full_name: seller.full_name,
      avatar_url: seller.avatar_url,
      store_slug: seller.store_slug,
      member_since: seller.created_at,
    };

    const offerSummary = publicOffer(offer);

    // ── Anonymous visitor ──
    if (!callerId) {
      return jsonResponse({
        scenario: "anon_view",
        offer: offerSummary,
        product: productSummary,
        seller: sellerSum,
        intended_email_hint: maskEmail(offer.buyer_email),
      });
    }

    // ── Signed in: wrong account ──
    if (!matchesByLink && !matchesByEmail) {
      return jsonResponse({
        scenario: "wrong_account",
        offer: offerSummary,
        intended_email_hint: maskEmail(offer.buyer_email),
      });
    }

    // ── Signed in & matches: handle action ──
    if (action === "claim") {
      // Promote pending_claim → linked → claimed; auto-link if needed
      const updates: Record<string, unknown> = {};
      if (!offer.buyer_id) {
        updates.buyer_id = callerId;
        updates.status = "claimed";
        updates.linked_at = new Date().toISOString();
        updates.claimed_at = new Date().toISOString();
      } else if (offer.status === "linked") {
        updates.status = "claimed";
        updates.claimed_at = new Date().toISOString();
      }

      if (Object.keys(updates).length > 0) {
        await adminClient
          .from("buyer_specific_product_offers")
          .update(updates)
          .eq("id", offer.id);
        await adminClient.from("offer_events").insert({
          offer_id: offer.id,
          event_type: "claimed_by_buyer",
          actor_user_id: callerId,
        });
      }

      return jsonResponse({
        scenario: "claimed",
        offer: { ...offerSummary, status: "claimed" },
        product: productSummary,
        seller: sellerSum,
      });
    }

    // Default: signed in & matches view
    return jsonResponse({
      scenario: "ready_to_claim",
      offer: offerSummary,
      product: productSummary,
      seller: sellerSum,
    });
  } catch (err) {
    console.error("claim-offer error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});

function publicOffer(o: any) {
  return {
    id: o.id,
    status: o.status,
    expires_at: o.expires_at,
    claimed_at: o.claimed_at,
    purchased_at: o.purchased_at,
  };
}

function sellerSummary(s: any) {
  return {
    id: s.id,
    full_name: s.full_name,
    avatar_url: s.avatar_url,
    store_slug: s.store_slug,
    member_since: s.created_at,
  };
}

async function fetchSellerSummary(adminClient: any, sellerId: string) {
  const { data } = await adminClient
    .from("profiles")
    .select("id, full_name, avatar_url, store_slug, created_at")
    .eq("id", sellerId)
    .maybeSingle();
  return data ? sellerSummary(data) : null;
}
