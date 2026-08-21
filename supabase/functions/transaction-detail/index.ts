import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { computePricing } from "../_shared/pricing.ts";
import { loadPricingConfig } from "../_shared/settings-resolver.ts";

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

function deriveNextAction(status: string, disputeId: string | null) {
  switch (status) {
    case "draft":
    case "awaiting_buyer":
      return { label: "Awaiting Setup", description: "This transaction is being set up.", action: null };
    case "awaiting_payment":
      return { label: "Payment Required", description: "Review and confirm the agreement, then complete your payment to proceed.", action: "review_agreement" };
    case "payment_secured":
    case "seller_preparing_delivery":
      return { label: "Awaiting Shipment", description: "The seller is preparing your item for delivery.", action: null };
    case "seller_dispatched":
      return { label: "In Transit", description: "Your item is on its way. You'll be notified when it arrives.", action: null };
    case "delivered_awaiting_verification":
      return {
        label: "Verify Item Received",
        description: "Your item has been delivered. Please verify if it matches what you ordered.",
        action: "verify",
      };
    case "disputed":
      return {
        label: "Dispute In Progress",
        description: "Your dispute is being reviewed. We'll keep you updated.",
        action: disputeId ? "view_dispute" : null,
      };
    case "completed":
      return { label: "Transaction Completed", description: "This transaction has been completed successfully.", action: null };
    case "refunded":
      return { label: "Refund Issued", description: "A refund has been issued for this transaction.", action: null };
    case "cancelled":
      return { label: "Cancelled", description: "This transaction was cancelled.", action: null };
    default:
      return { label: "Processing", description: "Transaction is being processed.", action: null };
  }
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

    const { data: hasRole } = await adminClient.rpc("has_role", { _user_id: userId, _role: "buyer" });
    if (!hasRole) {
      return jsonResponse({ error: "Buyer role required" }, 403);
    }

    const body = await req.json();
    const transactionId = body.transaction_id;
    if (!transactionId) {
      return jsonResponse({ error: "transaction_id is required" }, 400);
    }

    // Fetch transaction and validate buyer ownership
    const { data: tx, error: txError } = await adminClient
      .from("transactions")
      .select("id, transaction_code, status, money_status, dispute_status, buyer_id, seller_id, created_at, updated_at, share_token, source_offer_id, source_product_id, agreement_locked_at, buyer_confirmed_at, seller_confirmed_at")
      .eq("id", transactionId)
      .single();

    if (txError || !tx) {
      return jsonResponse({ error: "Transaction not found" }, 404);
    }
    if (tx.buyer_id !== userId) {
      return jsonResponse({ error: "Access denied" }, 403);
    }

    // Fetch all related data in parallel
    const [
      itemResult,
      pricingResult,
      deliveryTermsResult,
      trackingResult,
      proofFilesResult,
      sellerResult,
      escrowResult,
      statusHistoryResult,
      moneyHistoryResult,
      disputeResult,
      agreementResult,
      deliveryConfResult,
      sellerVerificationResult,
    ] = await Promise.allSettled([
      adminClient.from("transaction_items").select("title, description, quantity, condition_label, brand, model").eq("transaction_id", transactionId).single(),
      adminClient.from("transaction_pricing").select("item_amount, currency_code, platform_fee_amount, payment_processing_fee_amount, buyer_total_amount, seller_payout_amount, is_total_service_fee_capped, pricing_model_version").eq("transaction_id", transactionId).single(),
      adminClient.from("transaction_delivery_terms").select("delivery_method, expected_delivery_date, verification_window_hours, delivery_address_line1, delivery_address_line2, delivery_city, delivery_state, delivery_postal_code, delivery_country_code").eq("transaction_id", transactionId).single(),
      adminClient.from("delivery_tracking_details").select("courier_name, tracking_number, tracking_url, shipped_at, delivered_at, expected_delivery_at, signature_name").eq("transaction_id", transactionId).single(),
      adminClient.from("delivery_proof_files").select("id, proof_type, created_at, file_id, files(file_url, secure_url, original_file_name, mime_type)").eq("transaction_id", transactionId),
      adminClient.from("profiles").select("full_name, avatar_url, created_at").eq("id", tx.seller_id).single(),
      adminClient.from("escrow_states").select("state, held_amount, released_amount, frozen_amount, refunded_amount").eq("transaction_id", transactionId).single(),
      adminClient.from("transaction_status_history").select("old_status, new_status, reason, changed_at").eq("transaction_id", transactionId).order("changed_at", { ascending: true }),
      adminClient.from("money_status_history").select("old_status, new_status, reason, changed_at").eq("transaction_id", transactionId).order("changed_at", { ascending: true }),
      adminClient.from("disputes").select("id, status, reason, opened_at, description").eq("transaction_id", transactionId).maybeSingle(),
      adminClient.from("transaction_agreement_snapshots").select("locked_at").eq("transaction_id", transactionId).maybeSingle(),
      adminClient.from("delivery_confirmations").select("seller_marked_delivered_at, buyer_acknowledged_delivery_at, system_delivery_marked_at").eq("transaction_id", transactionId).maybeSingle(),
      adminClient.from("account_verifications").select("identity_verified, payout_verified, email_verified, phone_verified").eq("user_id", tx.seller_id).maybeSingle(),
    ]);

    const item = itemResult.status === "fulfilled" ? itemResult.value.data : null;
    if (pricingResult.status === "rejected") {
      console.error("transaction_pricing select failed:", pricingResult.reason);
    } else if (pricingResult.value.error) {
      console.error("transaction_pricing select error:", pricingResult.value.error);
    }
    const pricingRaw = pricingResult.status === "fulfilled" ? pricingResult.value.data : null;
    const deliveryTerms = deliveryTermsResult.status === "fulfilled" ? deliveryTermsResult.value.data : null;
    const tracking = trackingResult.status === "fulfilled" ? trackingResult.value.data : null;
    const proofFiles = proofFilesResult.status === "fulfilled" ? (proofFilesResult.value.data ?? []) : [];
    const seller = sellerResult.status === "fulfilled" ? sellerResult.value.data : null;
    const escrow = escrowResult.status === "fulfilled" ? escrowResult.value.data : null;
    const statusHistory = statusHistoryResult.status === "fulfilled" ? (statusHistoryResult.value.data ?? []) : [];
    const moneyHistory = moneyHistoryResult.status === "fulfilled" ? (moneyHistoryResult.value.data ?? []) : [];
    const dispute = disputeResult.status === "fulfilled" ? disputeResult.value.data : null;
    const agreement = agreementResult.status === "fulfilled" ? agreementResult.value.data : null;
    const deliveryConf = deliveryConfResult.status === "fulfilled" ? deliveryConfResult.value.data : null;
    const sellerVerification =
      sellerVerificationResult.status === "fulfilled" ? sellerVerificationResult.value.data : null;
    // A seller is only shown as "Verified" when identity verification actually passed.
    const sellerIsVerified = sellerVerification?.identity_verified === true;

    // Use the stored snapshot as the source of truth; fall back to computed
    // values only when the snapshot is missing (pre-payment) or columns are null.
    // FALLBACK: recompute using the seller's vendor config for display only.
    const fallback = computePricing(
      pricingRaw ? Number(pricingRaw.item_amount) || 0 : 0,
      pricingRaw?.currency_code || "NGN",
      "local",
      await loadPricingConfig(tx.seller_id),
    );
    const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
    const processingSnapshot = pricingRaw
      ? num((pricingRaw as any).payment_processing_fee_amount)
      : null;
    const platformSnapshot = pricingRaw
      ? num((pricingRaw as any).platform_fee_amount)
      : null;
    const serviceSnapshot =
      processingSnapshot != null && platformSnapshot != null
        ? processingSnapshot + platformSnapshot
        : null;
    const itemAmountSnapshot = pricingRaw ? Number(pricingRaw.item_amount) || 0 : 0;
    const computedPricing = pricingRaw
      ? {
          currency_code: pricingRaw.currency_code || "NGN",
          item_amount: itemAmountSnapshot,
          platform_fee_amount: platformSnapshot ?? fallback.platform_fee_amount,
          paystack_fee_amount: processingSnapshot ?? fallback.paystack_fee_amount,
          payment_processing_fee_amount: processingSnapshot ?? fallback.paystack_fee_amount,
          service_fee_amount: serviceSnapshot ?? fallback.service_fee_amount,
          service_fee_rate:
            serviceSnapshot != null && itemAmountSnapshot > 0
              ? Math.round((serviceSnapshot / itemAmountSnapshot) * 10000) / 10000
              : fallback.service_fee_rate,
          total_amount: num((pricingRaw as any).buyer_total_amount) ?? fallback.total_amount,
          seller_payout_amount:
            num((pricingRaw as any).seller_payout_amount) ??
            null,
          is_total_service_fee_capped:
            (pricingRaw as any).is_total_service_fee_capped ?? fallback.is_capped ?? false,
          is_capped: (pricingRaw as any).is_total_service_fee_capped ?? fallback.is_capped ?? false,
          is_floored: fallback.is_floored ?? false,
          pricing_model_version: (pricingRaw as any).pricing_model_version ?? null,
        }
      : fallback;

    // Compute verification deadline
    let verificationDeadlineAt: string | null = null;
    if (tx.status === "delivered_awaiting_verification" && deliveryConf && deliveryTerms) {
      const deliveredAt = deliveryConf.seller_marked_delivered_at || deliveryConf.system_delivery_marked_at;
      if (deliveredAt && deliveryTerms.verification_window_hours) {
        const deadline = new Date(new Date(deliveredAt).getTime() + deliveryTerms.verification_window_hours * 3600000);
        verificationDeadlineAt = deadline.toISOString();
      }
    }

    const nextAction = deriveNextAction(tx.status, dispute?.id ?? null);

    // Derive completion event: ONLY when funds have actually been released.
    // Phase A: tx.status === 'completed' is now reached at buyer-confirm time, but
    // funds remain in escrow until SafeDeal review. The completion banner must wait
    // for money_status === 'funds_released'.
    let completionEvent: { completed_at: string; previous_status: string | null; reason: string | null; variant: "buyer_confirmed" | "dispute_resolved" | "unknown"; funds_released_at: string | null } | null = null;
    if (tx.status === "completed" && tx.money_status === "funds_released") {
      const completedRow = [...statusHistory].reverse().find((h: Record<string, unknown>) => h.new_status === "completed");
      const fundsReleasedAt = ([...moneyHistory].reverse().find((h: Record<string, unknown>) => h.new_status === "funds_released") as Record<string, unknown> | undefined)?.changed_at as string | null ?? null;
      if (completedRow) {
        const prev = (completedRow.old_status as string | null) ?? null;
        let variant: "buyer_confirmed" | "dispute_resolved" | "unknown" = "unknown";
        if (prev === "delivered_awaiting_verification") {
          variant = "buyer_confirmed";
        } else if (prev === "resolved" || prev === "disputed") {
          variant = "dispute_resolved";
        }
        completionEvent = {
          completed_at: (completedRow.changed_at as string) ?? "",
          previous_status: prev,
          reason: (completedRow.reason as string | null) ?? null,
          variant,
          funds_released_at: fundsReleasedAt,
        };
      }
    }

    // Fetch product media for both single-product (source_product_id) and
    // offer-sourced (source_offer_id, potentially multi-product) transactions.
    let productMedia: Array<{ product_id: string; file_url: string | null; secure_url: string | null; mime_type: string | null; media_type: string | null; sort_order: number }> = [];
    {
      const productIds: string[] = [];
      if ((tx as any).source_product_id) productIds.push((tx as any).source_product_id);
      if (tx.source_offer_id) {
        const { data: offerItems } = await adminClient
          .from("buyer_specific_offer_items")
          .select("product_id")
          .eq("offer_id", tx.source_offer_id);
        for (const r of offerItems ?? []) {
          if ((r as any).product_id && !productIds.includes((r as any).product_id)) {
            productIds.push((r as any).product_id);
          }
        }
      }
      if (productIds.length > 0) {
        const { data: mediaRows } = await adminClient
          .from("product_media")
          .select("product_id, media_type, sort_order, files:file_id (file_url, secure_url, mime_type)")
          .in("product_id", productIds)
          .order("sort_order", { ascending: true });
        productMedia = (mediaRows ?? []).map((m: any) => ({
          product_id: m.product_id,
          file_url: m.files?.file_url ?? null,
          secure_url: m.files?.secure_url ?? null,
          mime_type: m.files?.mime_type ?? null,
          media_type: m.media_type ?? null,
          sort_order: m.sort_order ?? 0,
        }));
      }

      // Fallback: transaction_media (custom uploads attached to the transaction itself).
      if (productMedia.length === 0) {
        const { data: txMedia } = await adminClient
          .from("transaction_media")
          .select("media_type, sort_order, files:file_id (file_url, secure_url, mime_type)")
          .eq("transaction_id", transactionId)
          .order("sort_order", { ascending: true });
        productMedia = (txMedia ?? []).map((m: any) => ({
          product_id: transactionId,
          file_url: m.files?.file_url ?? null,
          secure_url: m.files?.secure_url ?? null,
          mime_type: m.files?.mime_type ?? null,
          media_type: m.media_type ?? null,
          sort_order: m.sort_order ?? 0,
        }));
      }
    }

    return jsonResponse({
      transaction: {
        id: tx.id,
        transaction_code: tx.transaction_code,
        status: tx.status,
        money_status: tx.money_status,
        dispute_status: tx.dispute_status,
        created_at: tx.created_at,
        verification_deadline_at: verificationDeadlineAt,
        share_token: tx.share_token ?? null,
        agreement_locked_at: tx.agreement_locked_at ?? null,
        buyer_confirmed_at: (tx as Record<string, unknown>).buyer_confirmed_at ?? null,
        seller_confirmed_at: (tx as Record<string, unknown>).seller_confirmed_at ?? null,
      },
      item: item
        ? { title: item.title, description: item.description, quantity: item.quantity, condition: item.condition_label, brand: item.brand, model: item.model, category: null }
        : { title: "Untitled Item", description: null, quantity: 1, condition: null, brand: null, model: null, category: null },
      pricing: computedPricing,
      delivery_terms: deliveryTerms,
      delivery_tracking: tracking,
      delivery_proof_files: proofFiles
        .filter((pf: Record<string, unknown>) => pf.proof_type !== "dispatch_evidence")
        .map((pf: Record<string, unknown>) => ({
          id: pf.id,
          proof_type: pf.proof_type,
          created_at: pf.created_at,
          file_url: (pf.files as Record<string, unknown>)?.file_url ?? null,
          file_name: (pf.files as Record<string, unknown>)?.original_file_name ?? null,
          mime_type: (pf.files as Record<string, unknown>)?.mime_type ?? null,
        })),
      dispatch_evidence_files: proofFiles
        .filter((pf: Record<string, unknown>) => pf.proof_type === "dispatch_evidence")
        .map((pf: Record<string, unknown>) => {
          const f = (pf.files as Record<string, unknown>) ?? {};
          return {
            id: pf.id,
            created_at: pf.created_at,
            file_url: f.file_url ?? null,
            secure_url: f.secure_url ?? null,
            file_name: f.original_file_name ?? null,
            mime_type: f.mime_type ?? null,
          };
        }),
      seller: seller
        ? {
            full_name: seller.full_name,
            avatar_url: seller.avatar_url,
            member_since: seller.created_at,
            is_verified: sellerIsVerified,
          }
        : null,
      escrow: escrow,
      status_history: statusHistory,
      money_history: moneyHistory,
      dispute: dispute ? { id: dispute.id, status: dispute.status, reason: dispute.reason, opened_at: dispute.opened_at, description: dispute.description } : null,
      agreement: agreement ? { locked_at: agreement.locked_at } : null,
      next_action: nextAction,
      product_media: productMedia,
      completion_event: completionEvent,
    });
  } catch (err) {
    console.error("transaction-detail error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
