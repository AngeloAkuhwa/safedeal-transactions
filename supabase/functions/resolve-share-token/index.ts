import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { shareToken } = await req.json();
    if (!shareToken || typeof shareToken !== "string") {
      return new Response(JSON.stringify({ error: "shareToken is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Resolve share token → transaction_id
    const { data: link, error: linkErr } = await supabase
      .from("transaction_links")
      .select("transaction_id, expires_at, is_active")
      .eq("share_token", shareToken)
      .eq("is_active", true)
      .maybeSingle();

    if (linkErr) throw linkErr;
    if (!link) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired transaction link" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check expiry
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "This transaction link has expired" }),
        { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const txId = link.transaction_id;

    // 2. Fetch transaction + related data in parallel
    const [txRes, itemRes, pricingRes, deliveryRes, escrowRes, mediaRes] =
      await Promise.all([
        supabase
          .from("transactions")
          .select("id, transaction_code, status, money_status, created_at, agreement_locked_at, seller_id, buyer_id, source_offer_id, source_product_id, cancelled_at, cancellation_reason")
          .eq("id", txId)
          .single(),
        supabase
          .from("transaction_items")
          .select("title, description, quantity, condition_label, brand, model, warranty_info")
          .eq("transaction_id", txId)
          .maybeSingle(),
        supabase
          .from("transaction_pricing")
          .select("currency_code, item_amount, platform_fee_amount, payment_processing_fee_amount, buyer_total_amount, seller_payout_amount, is_total_service_fee_capped, pricing_model_version")
          .eq("transaction_id", txId)
          .maybeSingle(),
        supabase
          .from("transaction_delivery_terms")
          .select("delivery_method, expected_delivery_date, verification_window_hours")
          .eq("transaction_id", txId)
          .maybeSingle(),
        supabase
          .from("escrow_states")
          .select("state, held_amount, frozen_amount, released_amount, refunded_amount")
          .eq("transaction_id", txId)
          .maybeSingle(),
        supabase
          .from("transaction_media")
          .select("id, file_id, media_type, sort_order, files(file_url, secure_url, mime_type, original_file_name)")
          .eq("transaction_id", txId)
          .order("sort_order", { ascending: true }),
      ]);

    if (txRes.error) throw txRes.error;
    const tx = txRes.data;

    // Surface silent failures from the parallel fetches.
    for (const [name, res] of [
      ["item", itemRes],
      ["pricing", pricingRes],
      ["delivery", deliveryRes],
      ["escrow", escrowRes],
      ["media", mediaRes],
    ] as const) {
      if ((res as { error?: unknown }).error) {
        console.error(`resolve-share-token: ${name} query error`, (res as { error: unknown }).error);
      }
    }

    // 3. Fetch seller profile + verification
    const [sellerRes, verifyRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, avatar_url, created_at")
        .eq("id", tx.seller_id)
        .single(),
      supabase
        .from("account_verifications")
        .select("email_verified, phone_verified, identity_verified, payout_verified")
        .eq("user_id", tx.seller_id)
        .maybeSingle(),
    ]);

    // SNAPSHOT-FIRST: display the immutable transaction_pricing row. Only
    // recompute (display only) when no snapshot row exists.
    const pricingRaw = pricingRes.data;
    const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
    let computedPricing: {
      currency_code: string | null;
      item_amount: number | null;
      paystack_fee_amount: number | null;
      platform_fee_amount: number | null;
      service_fee_amount: number | null;
      /**
       * The rate this buyer was ACTUALLY charged, observed from the snapshot
       * (service fee / item amount). Never a live config rate. The snapshot
       * is the only evidence of what was agreed. Null when it cannot be
       * observed, which blocks the payment screen rather than inventing one.
       */
      service_fee_rate: number | null;
      total_amount: number | null;
      seller_payout_amount: number | null;
      is_total_service_fee_capped: boolean;
      /** Null when the snapshot does not record whether the fee floor bound. */
      is_floored: boolean | null;
      pricing_model_version: string | null;
    } | null = null;

    if (pricingRaw) {
      // Money never falls back to zero: an absent column stays null and the
      // client blocks the screen instead of rendering a fabricated amount.
      const processingFee = num((pricingRaw as any).payment_processing_fee_amount);
      const platformFee = num((pricingRaw as any).platform_fee_amount);
      const itemAmount = num(pricingRaw.item_amount);
      const serviceFee =
        processingFee !== null && platformFee !== null ? processingFee + platformFee : null;
      const totalAmount = num((pricingRaw as any).buyer_total_amount);
      computedPricing = {
        currency_code: pricingRaw.currency_code || null,
        item_amount: itemAmount,
        paystack_fee_amount: processingFee,
        platform_fee_amount: platformFee,
        service_fee_amount: serviceFee,
        service_fee_rate:
          serviceFee !== null && itemAmount !== null && itemAmount > 0
            ? serviceFee / itemAmount
            : null,
        total_amount: totalAmount,
        seller_payout_amount: num((pricingRaw as any).seller_payout_amount),
        // Cap facts travel with the snapshot so the UI never guesses which
        // ceiling applied or how large it was.
        is_total_service_fee_capped: Boolean((pricingRaw as any).is_total_service_fee_capped),
        // The snapshot does not persist a floor flag, and it must not be
        // re-derived by comparing the charged fee to a live constant.
        is_floored: null,
        pricing_model_version: ((pricingRaw as any).pricing_model_version as string) ?? null,
      };
    } else {
      // NO SNAPSHOT: there is no evidence of what this buyer agreed to pay.
      // Recomputing here would invent both a currency and an amount, so every
      // field stays null and the payment screen blocks with an honest error.
      computedPricing = {
        currency_code: null,
        item_amount: null,
        paystack_fee_amount: null,
        platform_fee_amount: null,
        service_fee_amount: null,
        service_fee_rate: null,
        total_amount: null,
        seller_payout_amount: null,
        is_total_service_fee_capped: false,
        is_floored: null,
        pricing_model_version: null,
      };
    }

    // 5. Resolve media: prefer transaction_media; fall back to product_media
    //    (offer-claimed transactions store media on the source product, not on the transaction)
    let media: unknown[] = mediaRes.data ?? [];
    if (media.length === 0) {
      const productIds: string[] = [];
      // Single-product transaction
      if (tx.source_product_id) productIds.push(tx.source_product_id as string);
      // Offer-claimed (potentially multi-product) transaction
      if (tx.source_offer_id) {
        const { data: offerItems } = await supabase
          .from("buyer_specific_offer_items")
          .select("product_id, position")
          .eq("offer_id", tx.source_offer_id)
          .order("position", { ascending: true });
        for (const oi of offerItems ?? []) {
          if (oi.product_id && !productIds.includes(oi.product_id)) {
            productIds.push(oi.product_id);
          }
        }
      }
      if (productIds.length > 0) {
        const { data: pmRows } = await supabase
          .from("product_media")
          .select("id, file_id, media_type, sort_order, product_id, files(file_url, secure_url, mime_type, original_file_name)")
          .in("product_id", productIds)
          .order("sort_order", { ascending: true });
        media = (pmRows ?? []).map((m: Record<string, unknown>) => ({
          id: m.id,
          file_id: m.file_id,
          media_type: m.media_type,
          sort_order: m.sort_order,
          files: m.files,
        }));
      }
    }

    // Who actually cancelled: derived from the recorded status-history actor.
    let cancelledByRole: "buyer" | "seller" | "system" | null = null;
    if (tx.status === "cancelled") {
      const { data: hist } = await supabase
        .from("transaction_status_history")
        .select("changed_by_user_id, new_status, changed_at")
        .eq("transaction_id", txId)
        .eq("new_status", "cancelled")
        .order("changed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const actor = hist?.changed_by_user_id ?? null;
      if (!actor) cancelledByRole = "system";
      else if (actor === tx.buyer_id) cancelledByRole = "buyer";
      else if (actor === tx.seller_id) cancelledByRole = "seller";
    }

    const response = {
      transaction: {
        id: tx.id,
        transaction_code: tx.transaction_code,
        status: tx.status,
        money_status: tx.money_status,
        created_at: tx.created_at,
        agreement_locked_at: tx.agreement_locked_at,
        cancelled_at: tx.cancelled_at ?? null,
        // Real reason as recorded on the transaction. Never inferred.
        cancellation_reason: tx.cancellation_reason ?? null,
        cancelled_by_role: cancelledByRole,
      },
      item: itemRes.data
        ? {
            ...itemRes.data,
            // Preserve the existing client contract (`warranty_terms`).
            warranty_terms: (itemRes.data as { warranty_info?: unknown }).warranty_info ?? null,
          }
        : null,
      pricing: computedPricing,
      delivery: deliveryRes.data || null,
      escrow: escrowRes.data || null,
      media,
      seller: sellerRes.data
        ? {
            full_name: sellerRes.data.full_name,
            avatar_url: sellerRes.data.avatar_url,
            // Seller email is deliberately NOT exposed: share links are
            // pre-authentication surfaces.
            member_since: sellerRes.data.created_at,
          }
        : null,
      sellerVerification: verifyRes.data || null,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("resolve-share-token error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
