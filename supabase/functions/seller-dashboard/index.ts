import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VERIFICATION_LABEL_MAP: Record<string, string> = {
  // Account-tier names only. These describe the seller's own stored tier and are
  // NOT verification badges: the identity-verified badge requires identity_verified and
  // lives in src/lib/trust/trust-claims.ts.
  unverified: "Unverified account",
  basic_verified: "Contact details confirmed",
  trusted_buyer: "Trusted tier",
  high_trust_buyer: "Premium tier",
};

type Severity = "critical" | "action_required" | "informational";
interface SellerAlert {
  type: string;
  severity: Severity;
  title: string;
  message: string;
  action_label: string;
  action_href: string;
  secondary_action?: { label: string; href: string };
  count?: number;
  blocking: boolean;
  dismissible: boolean;
  metadata?: Record<string, unknown>;
  priority: number;
}

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  action_required: 1,
  informational: 2,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

    let userId: string;
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      if (!payload?.sub || (payload.exp && payload.exp * 1000 < Date.now())) {
        return jsonResponse({ error: "Invalid session" }, 401);
      }
      userId = payload.sub as string;
    } catch (e) {
      console.error("seller-dashboard JWT decode error:", e);
      return jsonResponse({ error: "Invalid session" }, 401);
    }

    const { data: hasRole, error: roleError } = await adminClient.rpc("has_role", {
      _user_id: userId,
      _role: "seller",
    });
    if (roleError || !hasRole) {
      return jsonResponse({ error: "Seller role required" }, 403);
    }

    // ==================== Parallel data fetch ====================
    const [
      profileResult,
      verificationResult,
      payoutAccountResult,
      allTxResult,
      recentTxResult,
      payoutsResult,
      disputesResult,
      productsResult,
      unreadNotificationsResult,
      unreadMessagesResult,
    ] = await Promise.allSettled([
      adminClient.from("profiles").select("full_name, avatar_url, store_slug, created_at").eq("id", userId).single(),
      adminClient.from("account_verifications").select("verification_level, identity_verified, email_verified, phone_verified").eq("user_id", userId).maybeSingle(),
      adminClient.from("payout_accounts").select("id, verification_status, provider_recipient_code").eq("user_id", userId).maybeSingle(),
      adminClient.from("transactions").select("id, status, money_status, buyer_confirmed_at, seller_confirmed_at").eq("seller_id", userId),
      adminClient.from("transactions").select("id, transaction_code, status, money_status, created_at, buyer_id").eq("seller_id", userId).neq("status", "draft").order("created_at", { ascending: false }).limit(6),
      adminClient.from("payouts").select("id, amount, status, currency_code, failure_reason, last_release_error").eq("seller_id", userId),
      adminClient.from("disputes").select("id, transaction_id, status, seller_response_due_at, opened_at, transactions!inner(seller_id)").eq("transactions.seller_id", userId).in("status", ["open", "seller_response_pending"]),
      adminClient.from("products").select("id, status, stock_quantity, reserved_quantity, updated_at").eq("seller_id", userId),
      adminClient.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("is_read", false),
      adminClient.from("transaction_messages").select("id", { count: "exact", head: true }).eq("recipient_user_id", userId).eq("is_read", false),
    ]);

    // ==================== Profile + verification ====================
    const seller = {
      full_name: "User",
      avatar_url: null as string | null,
      store_slug: null as string | null,
      created_at: null as string | null,
      verification_level: "unverified",
      verification_label: VERIFICATION_LABEL_MAP.unverified,
      identity_verified: false,
      payout_account_present: false,
      payout_account_verified: false,
      payout_ready: false,
      payout_blocker_reason: "missing" as "missing" | "unverified" | "no_recipient_code" | null,
      has_published_products: false,
    };
    if (profileResult.status === "fulfilled" && profileResult.value.data) {
      const p = profileResult.value.data as Record<string, unknown>;
      seller.full_name = (p.full_name as string) || "User";
      seller.avatar_url = (p.avatar_url as string) || null;
      seller.store_slug = (p.store_slug as string) || null;
      seller.created_at = (p.created_at as string) || null;
    }
    if (verificationResult.status === "fulfilled" && verificationResult.value.data) {
      const v = verificationResult.value.data as Record<string, unknown>;
      seller.verification_level = (v.verification_level as string) || "unverified";
      seller.verification_label = VERIFICATION_LABEL_MAP[seller.verification_level] ?? VERIFICATION_LABEL_MAP.unverified;
      seller.identity_verified = !!v.identity_verified;
    }
    let payoutAccountRow: { id: string; verification_status: string; provider_recipient_code: string | null } | null = null;
    if (payoutAccountResult.status === "fulfilled" && payoutAccountResult.value.data) {
      payoutAccountRow = payoutAccountResult.value.data as any;
      seller.payout_account_present = true;
      seller.payout_account_verified = payoutAccountRow!.verification_status === "verified" && !!payoutAccountRow!.provider_recipient_code;
      seller.payout_ready = seller.payout_account_verified;
      if (seller.payout_ready) {
        seller.payout_blocker_reason = null;
      } else if (payoutAccountRow!.verification_status !== "verified") {
        seller.payout_blocker_reason = "unverified";
      } else {
        seller.payout_blocker_reason = "no_recipient_code";
      }
    } else {
      seller.payout_ready = false;
      seller.payout_blocker_reason = "missing";
    }

    // ==================== Bucket transactions ====================
    type TxRow = { id: string; status: string; money_status: string; buyer_confirmed_at: string | null; seller_confirmed_at: string | null };
    const txRowsAll: TxRow[] = (allTxResult.status === "fulfilled" && allTxResult.value.data) ? (allTxResult.value.data as TxRow[]) : [];
    const txRows = txRowsAll.filter((t) => t.status !== "draft");

    const awaitingPaymentTxIds: string[] = [];
    const awaitingBuyerReviewTxIds: string[] = [];
    const fundsHeldTxIds: string[] = [];
    const fundsPendingReleaseTxIds: string[] = [];
    const fundsReleasingTxIds: string[] = [];
    const fundsFrozenTxIds: string[] = [];
    const fulfillmentNeededTxIds: string[] = [];
    const dispatchedTxIds: string[] = [];
    const buyerVerificationTxIds: string[] = [];
    const completedTxIds: string[] = [];
    const awaitingSellerConfirmationTxIds: string[] = [];

    for (const tx of txRows) {
      if (tx.status === "awaiting_payment") awaitingPaymentTxIds.push(tx.id);
      if (tx.status === "awaiting_buyer") awaitingBuyerReviewTxIds.push(tx.id);
      if (tx.money_status === "funds_held_in_escrow") fundsHeldTxIds.push(tx.id);
      if (tx.money_status === "funds_pending_release") fundsPendingReleaseTxIds.push(tx.id);
      if (tx.money_status === "funds_releasing") fundsReleasingTxIds.push(tx.id);
      if (tx.money_status === "funds_frozen") fundsFrozenTxIds.push(tx.id);
      if (["payment_secured", "seller_preparing_delivery"].includes(tx.status)) fulfillmentNeededTxIds.push(tx.id);
      if (tx.status === "seller_dispatched") dispatchedTxIds.push(tx.id);
      if (tx.status === "delivered_awaiting_verification") buyerVerificationTxIds.push(tx.id);
      if (tx.status === "completed") completedTxIds.push(tx.id);
      if (tx.buyer_confirmed_at && !tx.seller_confirmed_at && tx.money_status === "funds_held_in_escrow" && tx.status !== "refunded" && tx.status !== "cancelled") {
        awaitingSellerConfirmationTxIds.push(tx.id);
      }
    }

    // Disputes set (used to filter alerts that should not raise on disputed txs)
    const disputesRows = (disputesResult.status === "fulfilled" && disputesResult.value.data) ? (disputesResult.value.data as Array<Record<string, unknown>>) : [];
    const disputedTxIds = new Set<string>(disputesRows.map((d) => d.transaction_id as string));

    // Delivery proof missing: exclude disputed
    const dispatchedNoDispute = dispatchedTxIds.filter((id) => !disputedTxIds.has(id));
    let deliveryProofMissingTxIds: string[] = [];
    if (dispatchedNoDispute.length > 0) {
      const { data: proofData } = await adminClient.from("delivery_proof_files").select("transaction_id").in("transaction_id", dispatchedNoDispute);
      const haveProof = new Set((proofData ?? []).map((p: Record<string, unknown>) => p.transaction_id as string));
      deliveryProofMissingTxIds = dispatchedNoDispute.filter((id) => !haveProof.has(id));
    }

    // Disputes needing seller response (no response row yet)
    let disputeRespondTxIds: Array<{ id: string; transaction_id: string; due: string | null }> = [];
    if (disputesRows.length > 0) {
      const dIds = disputesRows.map((d) => d.id as string);
      const { data: respData } = await adminClient.from("dispute_responses").select("dispute_id").in("dispute_id", dIds);
      const responded = new Set((respData ?? []).map((r: Record<string, unknown>) => r.dispute_id as string));
      disputeRespondTxIds = disputesRows
        .filter((d) => !responded.has(d.id as string) && d.seller_response_due_at)
        .map((d) => ({ id: d.id as string, transaction_id: d.transaction_id as string, due: d.seller_response_due_at as string | null }));
    }

    // ==================== Pricing for amounts ====================
    let awaitingBuyerPaymentAmount = 0;
    let awaitingBuyerReviewAmount = 0;
    let fundsHeldInEscrowAmount = 0;
    let fundsPendingReleaseAmount = 0;
    let fundsFrozenAmount = 0;
    let payoutsCompletedAmount = 0;
    let netPaidToBank = 0;
    /**
     * The currency these aggregates are denominated in. Summing across
     * currencies is meaningless, so we only name one when every contributing
     * pricing row agrees; otherwise the UI renders `—` instead of guessing.
     */
    let metricsCurrency: string | null = null;

    const amountTxIds = [...new Set([
      ...awaitingPaymentTxIds, ...awaitingBuyerReviewTxIds, ...fundsHeldTxIds,
      ...fundsPendingReleaseTxIds, ...fundsReleasingTxIds, ...fundsFrozenTxIds, ...completedTxIds,
    ])];
    if (amountTxIds.length > 0) {
      const { data: pricingData } = await adminClient
        .from("transaction_pricing")
        .select("transaction_id, seller_payout_amount, buyer_total_amount, currency_code")
        .in("transaction_id", amountTxIds);
      if (pricingData) {
        const codes = new Set(
          pricingData
            .map((p: Record<string, unknown>) => (p.currency_code as string | null) ?? null)
            .filter((c): c is string => !!c),
        );
        metricsCurrency = codes.size === 1 ? [...codes][0] : null;
        const pricingMap = new Map(
          pricingData.map((p: Record<string, unknown>) => [
            p.transaction_id as string,
            {
              sellerNet: Number((p.seller_payout_amount as number | null) ?? 0),
              buyerTotal: Number((p.buyer_total_amount as number | null) ?? 0),
            },
          ])
        );
        for (const id of awaitingPaymentTxIds) awaitingBuyerPaymentAmount += pricingMap.get(id)?.buyerTotal ?? 0;
        for (const id of awaitingBuyerReviewTxIds) awaitingBuyerReviewAmount += pricingMap.get(id)?.buyerTotal ?? 0;
        for (const id of fundsHeldTxIds) fundsHeldInEscrowAmount += pricingMap.get(id)?.sellerNet ?? 0;
        for (const id of fundsPendingReleaseTxIds) fundsPendingReleaseAmount += pricingMap.get(id)?.sellerNet ?? 0;
        for (const id of fundsReleasingTxIds) fundsPendingReleaseAmount += pricingMap.get(id)?.sellerNet ?? 0;
        for (const id of fundsFrozenTxIds) fundsFrozenAmount += pricingMap.get(id)?.sellerNet ?? 0;
        for (const id of completedTxIds) payoutsCompletedAmount += pricingMap.get(id)?.sellerNet ?? 0;
      }
    }

    // ==================== Payouts ====================
    type PayoutRow = { id: string; amount: number; status: string; failure_reason: string | null; last_release_error: string | null };
    const payoutRows: PayoutRow[] = (payoutsResult.status === "fulfilled" && payoutsResult.value.data) ? (payoutsResult.value.data as PayoutRow[]) : [];
    const payoutsAwaitingRelease = payoutRows.filter((p) => p.status === "awaiting_release");
    const payoutsProcessing = payoutRows.filter((p) => ["pending", "processing"].includes(p.status));
    const payoutsFailed = payoutRows.filter((p) => ["failed", "reversed"].includes(p.status));
    for (const p of payoutRows) {
      if (p.status === "completed") netPaidToBank += p.amount;
    }
    const netPendingBankTransfer = Math.max(0, payoutsCompletedAmount - netPaidToBank);

    // ==================== Products ====================
    type ProductRow = { id: string; status: string; stock_quantity: number; reserved_quantity: number; updated_at: string };
    const productRows: ProductRow[] = (productsResult.status === "fulfilled" && productsResult.value.data) ? (productsResult.value.data as ProductRow[]) : [];
    seller.has_published_products = productRows.some((p) => p.status === "published");
    const lowStockProducts = productRows.filter((p) => {
      if (p.status !== "published") return false;
      const avail = (p.stock_quantity ?? 0) - (p.reserved_quantity ?? 0);
      return avail >= 1 && avail <= 3;
    });
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const outOfStockProducts = productRows.filter((p) => p.status === "out_of_stock" && new Date(p.updated_at).getTime() >= sevenDaysAgo);

    // ==================== Unread counts ====================
    const unreadNotificationsCount = (unreadNotificationsResult.status === "fulfilled") ? (unreadNotificationsResult.value.count ?? 0) : 0;
    const unreadMessagesCount = (unreadMessagesResult.status === "fulfilled") ? (unreadMessagesResult.value.count ?? 0) : 0;

    // ==================== Build alerts ====================
    const alerts: SellerAlert[] = [];

    // Pri 1: payout_failed
    if (payoutsFailed.length > 0) {
      const single = payoutsFailed.length === 1 ? payoutsFailed[0] : null;
      alerts.push({
        type: "payout_failed",
        severity: "critical",
        priority: 1,
        title: "Release failed",
        message: "A payment release failed. SafeDeal is reviewing it. You may need to update your payout account.",
        action_label: "Fix payout account",
        action_href: "/seller/profile?section=payout",
        secondary_action: { label: "Contact support", href: "/seller/support" },
        count: payoutsFailed.length,
        blocking: true,
        dismissible: false,
        metadata: single ? { payout_id: single.id, last_failure_reason: single.last_release_error ?? single.failure_reason ?? null } : { count: payoutsFailed.length },
      });
    }

    // Pri 2: dispute_response_required
    if (disputeRespondTxIds.length > 0) {
      let minDue: number | null = null;
      let earliest: { id: string; transaction_id: string; due: string | null } | null = null;
      for (const d of disputeRespondTxIds) {
        if (!d.due) continue;
        const t = new Date(d.due).getTime();
        if (minDue === null || t < minDue) { minDue = t; earliest = d; }
      }
      const now = Date.now();
      const hoursRemaining = minDue !== null ? (minDue - now) / 3_600_000 : null;
      const isOverdue = hoursRemaining !== null && hoursRemaining < 0;
      const sev: Severity = (hoursRemaining !== null && hoursRemaining <= 12) || isOverdue ? "critical" : "action_required";
      const single = disputeRespondTxIds.length === 1 ? disputeRespondTxIds[0] : null;
      alerts.push({
        type: "dispute_response_required",
        severity: sev,
        priority: 2,
        title: "Dispute response required",
        message: "A buyer raised a dispute. Respond before the deadline to protect your transaction.",
        action_label: single ? "Respond now" : "Review disputes",
        action_href: single ? `/seller/disputes/${single.id}` : "/seller/disputes?filter=seller_response_pending",
        count: disputeRespondTxIds.length,
        blocking: true,
        dismissible: false,
        metadata: {
          ...(single ? { dispute_id: single.id, transaction_id: single.transaction_id } : {}),
          ...(earliest?.due ? { due_at: earliest.due, hours_remaining: hoursRemaining, is_overdue: isOverdue } : {}),
        },
      });
    }

    // Pri 3: payout_account_required
    if (!seller.payout_account_present) {
      alerts.push({
        type: "payout_account_required",
        severity: "critical",
        priority: 3,
        title: "Add payout account",
        message: "Add a verified bank account so SafeDeal can process your releases.",
        action_label: "Add bank account",
        action_href: "/seller/profile?section=payout",
        blocking: true,
        dismissible: false,
      });
    } else if (!seller.payout_account_verified) {
      // Pri 4: payout_account_unverified
      const fundsAtStake = fundsPendingReleaseAmount > 0 || payoutsAwaitingRelease.length > 0 || payoutsProcessing.length > 0;
      const isLinkIssue = seller.payout_blocker_reason === "no_recipient_code";
      alerts.push({
        type: "payout_account_unverified",
        severity: fundsAtStake ? "critical" : "action_required",
        priority: 4,
        title: isLinkIssue ? "Finish linking your bank" : "Verify payout account",
        message: isLinkIssue
          ? "Your bank is verified but the secure payout link with our payment processor is not complete. Finish linking to receive payouts."
          : "Your payout account has not been verified yet. Update your bank details to avoid payout delays.",
        action_label: isLinkIssue ? "Finish bank link" : "Fix payout account",
        action_href: "/seller/profile?section=payout",
        blocking: true,
        dismissible: false,
        metadata: { funds_at_stake: fundsAtStake, blocker_reason: seller.payout_blocker_reason },
      });
    }

    // Pri 5: delivery_proof_required
    if (deliveryProofMissingTxIds.length > 0) {
      const single = deliveryProofMissingTxIds.length === 1 ? deliveryProofMissingTxIds[0] : null;
      alerts.push({
        type: "delivery_proof_required",
        severity: "action_required",
        priority: 5,
        title: "Upload delivery proof",
        message: "Upload delivery evidence so the buyer and SafeDeal can verify fulfillment.",
        action_label: single ? "Upload proof" : "Review orders",
        action_href: single ? `/seller/transactions/${single}/delivery` : "/seller/transactions?filter=awaiting-delivery",
        count: deliveryProofMissingTxIds.length,
        blocking: true,
        dismissible: false,
        metadata: single ? { transaction_id: single } : undefined,
      });
    }

    // Pri 6: awaiting_seller_confirmation (filter out disputed)
    const ascNoDispute = awaitingSellerConfirmationTxIds.filter((id) => !disputedTxIds.has(id));
    if (ascNoDispute.length > 0) {
      const single = ascNoDispute.length === 1 ? ascNoDispute[0] : null;
      alerts.push({
        type: "awaiting_seller_confirmation",
        severity: "action_required",
        priority: 6,
        title: "Confirm completed deals",
        message: "Buyers have confirmed receipt. Confirm completion so SafeDeal can move these transactions to Awaiting Release.",
        action_label: single ? "Confirm now" : "Review transactions",
        action_href: single ? `/seller/transactions/${single}` : "/seller/transactions?filter=awaiting-seller-confirmation",
        count: ascNoDispute.length,
        blocking: true,
        dismissible: false,
        metadata: single ? { transaction_id: single } : undefined,
      });
    }

    // Pri 7: identity_verification_required
    const hasActivity = txRows.length > 0 || seller.has_published_products;
    if (!seller.identity_verified && hasActivity) {
      alerts.push({
        type: "identity_verification_required",
        severity: "action_required",
        priority: 7,
        title: "Verify your identity",
        message: "Complete identity verification to increase buyer trust and keep your seller account fully active.",
        action_label: "Verify identity",
        action_href: "/seller/profile?section=identity",
        blocking: false,
        dismissible: true,
      });
    }

    // Pri 8: low_stock_warning
    if (lowStockProducts.length > 0) {
      alerts.push({
        type: "low_stock_warning",
        severity: "action_required",
        priority: 8,
        title: "Low stock warning",
        message: "Some published products are almost sold out. Update stock to avoid missed sales.",
        action_label: "Update stock",
        action_href: "/seller/storefront?filter=low_stock",
        count: lowStockProducts.length,
        blocking: false,
        dismissible: true,
        metadata: { product_count: lowStockProducts.length },
      });
    }

    // Pri 9: out_of_stock_published
    if (outOfStockProducts.length > 0) {
      alerts.push({
        type: "out_of_stock_published",
        severity: lowStockProducts.length > 0 ? "action_required" : "informational",
        priority: 9,
        title: "Products marked out of stock",
        message: "Some products were marked out of stock recently. Restock them when available.",
        action_label: "Review products",
        action_href: "/seller/storefront?filter=out_of_stock",
        count: outOfStockProducts.length,
        blocking: false,
        dismissible: true,
        metadata: { product_count: outOfStockProducts.length },
      });
    }

    // Pri 10: awaiting_release
    const awaitingReleaseTxNoDispute = fundsPendingReleaseTxIds.filter((id) => !disputedTxIds.has(id));
    const awaitingReleaseTotal = payoutsAwaitingRelease.length + awaitingReleaseTxNoDispute.filter((id) => !payoutsAwaitingRelease.some(() => false)).length;
    // Use simple union count for clarity
    const awaitingReleaseUnion = new Set<string>([
      ...payoutsAwaitingRelease.map((p) => p.id),
      ...awaitingReleaseTxNoDispute.map((id) => `tx:${id}`),
    ]);
    if (awaitingReleaseUnion.size > 0) {
      alerts.push({
        type: "awaiting_release",
        severity: "informational",
        priority: 10,
        title: "Awaiting release",
        message: "Both parties have confirmed. SafeDeal is reviewing the release.",
        action_label: "View releases",
        action_href: "/seller/payouts?status=pending",
        count: awaitingReleaseUnion.size,
        blocking: false,
        dismissible: true,
      });
    }

    // Sort alerts: priority asc, then severity rank
    alerts.sort((a, b) => (a.priority - b.priority) || (SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]));

    // Alerts summary
    const alertsSummary = {
      total: alerts.length,
      by_severity: {
        critical: alerts.filter((a) => a.severity === "critical").length,
        action_required: alerts.filter((a) => a.severity === "action_required").length,
        informational: alerts.filter((a) => a.severity === "informational").length,
      },
      visible_count: Math.min(alerts.length, 3),
    };

    // ==================== Onboarding ====================
    const steps = [
      {
        key: "identity" as const,
        title: "Verify your identity",
        description: "Confirm your identity to build buyer trust and unlock full seller features.",
        action_label: "Verify identity",
        action_href: "/seller/profile?section=identity",
        completed: seller.identity_verified,
        blocking: false,
      },
      {
        key: "payout" as const,
        title: "Add a verified payout account",
        description: "Add and verify a bank account so SafeDeal can release funds to you.",
        action_label: seller.payout_account_present ? "Verify account" : "Add bank account",
        action_href: "/seller/profile?section=payout",
        completed: seller.payout_account_present && seller.payout_account_verified,
        blocking: true,
      },
      {
        key: "product" as const,
        title: "Publish your first product",
        description: "Create a product listing so buyers can discover and purchase from you.",
        action_label: "Create product",
        action_href: "/seller/storefront/new",
        completed: seller.has_published_products,
        blocking: false,
      },
      {
        key: "transaction" as const,
        title: "Create your first protected deal",
        description: "Send a protected transaction link or fulfill an order to complete setup.",
        action_label: "Create direct deal",
        action_href: "/seller/transactions/new",
        completed: txRows.length > 0,
        blocking: false,
      },
    ];
    const completedSteps = steps.filter((s) => s.completed).length;
    const onboarding = {
      show: completedSteps < steps.length,
      completed_steps: completedSteps,
      total_steps: steps.length,
      steps,
    };

    // ==================== Recent activity ====================
    let recentActivity: Array<Record<string, unknown>> = [];
    if (recentTxResult.status === "fulfilled" && recentTxResult.value.data) {
      const txRowsR = recentTxResult.value.data as Array<Record<string, unknown>>;
      const txIds = txRowsR.map((t) => t.id as string);
      const buyerIds = [...new Set(txRowsR.map((t) => t.buyer_id as string).filter(Boolean))];
      const nullBuyerTxIds = txRowsR.filter((t) => !t.buyer_id).map((t) => t.id as string);

      if (txIds.length > 0) {
        const batchQueries: any[] = [
          adminClient.from("transaction_items").select("transaction_id, title").in("transaction_id", txIds),
          adminClient.from("transaction_pricing").select("transaction_id, buyer_total_amount, currency_code").in("transaction_id", txIds),
          adminClient.from("delivery_confirmation_tokens").select("transaction_id").eq("status", "active").in("transaction_id", txIds),
        ];
        if (buyerIds.length > 0) {
          batchQueries.push(adminClient.from("profiles").select("id, full_name, email").in("id", buyerIds));
        }
        if (nullBuyerTxIds.length > 0) {
          batchQueries.push(
            adminClient.from("transaction_participants").select("transaction_id, display_name, email, phone").in("transaction_id", nullBuyerTxIds).eq("role", "buyer")
          );
        }
        const batchResults = await Promise.allSettled(batchQueries);
        const itemMap = new Map<string, string>();
        if (batchResults[0].status === "fulfilled" && (batchResults[0].value as any).data) {
          for (const item of (batchResults[0].value as any).data) itemMap.set(item.transaction_id, item.title);
        }
        const pricingMap = new Map<string, { amount: number; currency: string }>();
        if (batchResults[1].status === "fulfilled" && (batchResults[1].value as any).data) {
          for (const p of (batchResults[1].value as any).data) {
            pricingMap.set(p.transaction_id, { amount: p.buyer_total_amount, currency: p.currency_code });
          }
        }
        const activeTokenSet = new Set<string>();
        if (batchResults[2].status === "fulfilled" && (batchResults[2].value as any).data) {
          for (const r of (batchResults[2].value as any).data) activeTokenSet.add(r.transaction_id);
        }
        const buyerMap = new Map<string, { name: string; email: string }>();
        const profilesIdx = buyerIds.length > 0 ? 3 : -1;
        if (profilesIdx >= 0 && batchResults[profilesIdx]?.status === "fulfilled" && (batchResults[profilesIdx] as any).value.data) {
          for (const b of (batchResults[profilesIdx] as any).value.data) buyerMap.set(b.id, { name: b.full_name, email: b.email });
        }
        const participantsIdx = nullBuyerTxIds.length > 0 ? (buyerIds.length > 0 ? 4 : 3) : -1;
        if (participantsIdx >= 0 && batchResults[participantsIdx]?.status === "fulfilled" && (batchResults[participantsIdx] as any).value.data) {
          for (const p of (batchResults[participantsIdx] as any).value.data) {
            buyerMap.set(`participant:${p.transaction_id}`, { name: p.display_name ?? "Unknown", email: p.email ?? p.phone ?? "" });
          }
        }
        recentActivity = txRowsR.map((tx) => {
          const buyer = tx.buyer_id ? buyerMap.get(tx.buyer_id as string) : buyerMap.get(`participant:${tx.id as string}`);
          return {
            transaction_id: tx.id,
            transaction_code: tx.transaction_code,
            buyer_name: buyer?.name ?? "Unknown Buyer",
            buyer_email: buyer?.email ?? "",
            item_title: itemMap.get(tx.id as string) ?? "Untitled Item",
            amount: pricingMap.get(tx.id as string)?.amount ?? 0,
            currency_code: pricingMap.get(tx.id as string)?.currency ?? "NGN",
            transaction_status: tx.status,
            money_status: tx.money_status,
            created_at: tx.created_at,
            has_active_rider_token: activeTokenSet.has(tx.id as string),
          };
        });
      }
    }

    const draftCount = txRowsAll.filter((t) => t.status === "draft").length;

    // ==================== Metrics (counts + amounts) ====================
    const completedTransactionsCount = completedTxIds.length;
    const activeTransactionsCount = txRows.filter((t) => !["completed", "refunded", "cancelled", "timed_out"].includes(t.status)).length;
    const awaitingReleaseCount = awaitingReleaseUnion.size;

    const metrics = {
      transactions_created_count: txRows.length,
      currency_code: metricsCurrency,
      active_transactions_count: activeTransactionsCount,
      completed_transactions_count: completedTransactionsCount,
      awaiting_buyer_payment_count: awaitingPaymentTxIds.length,
      awaiting_buyer_confirmation_count: buyerVerificationTxIds.length,
      awaiting_seller_confirmation_count: ascNoDispute.length,
      awaiting_release_count: awaitingReleaseCount,
      open_disputes_count: disputesRows.length,
      payout_failed_count: payoutsFailed.length,
      products_low_stock_count: lowStockProducts.length,
      products_out_of_stock_count: outOfStockProducts.length,
      unread_notifications_count: unreadNotificationsCount,
      unread_messages_count: unreadMessagesCount,
      // money
      awaiting_buyer_payment_amount: awaitingBuyerPaymentAmount,
      awaiting_buyer_review_amount: awaitingBuyerReviewAmount,
      funds_held_in_escrow_amount: fundsHeldInEscrowAmount,
      funds_pending_release_amount: fundsPendingReleaseAmount,
      funds_frozen_amount: fundsFrozenAmount,
      funds_frozen_count: fundsFrozenTxIds.length,
      payouts_completed_amount: payoutsCompletedAmount,
      net_paid_to_bank: netPaidToBank,
      net_pending_bank_transfer: netPendingBankTransfer,
    };

    return jsonResponse({
      seller,
      metrics,
      alerts,
      alerts_summary: alertsSummary,
      onboarding,
      recent_activity: recentActivity,
      quick_actions: { draft_count: draftCount },
    });
  } catch (err) {
    console.error("seller-dashboard error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
