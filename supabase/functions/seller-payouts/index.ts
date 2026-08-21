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

// Phase B7 contract: server-rendered, seller-friendly labels.
// Sellers NEVER see "admin" wording and NEVER trigger retries themselves.
function sellerStatusLabel(dbStatus: string): string {
  switch (dbStatus) {
    case "awaiting_release": return "Awaiting Release";
    case "pending":          return "Release Approved";
    case "processing":       return "Payment Processing";
    case "completed":        return "Paid Out";
    case "failed":           return "Release Failed";
    case "reversed":         return "Reversed";
    case "cancelled":        return "Cancelled";
    case "blocked":          return "Action Required";
    default:                 return "Pending";
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

    const { data: hasRole, error: roleError } = await adminClient.rpc("has_role", {
      _user_id: userId,
      _role: "seller",
    });
    if (roleError || !hasRole) {
      return jsonResponse({ error: "Seller role required" }, 403);
    }

    // Parse query params
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "10", 10)));
    const statusFilter = url.searchParams.get("status") || "";
    const search = url.searchParams.get("search") || "";
    const fromParam = url.searchParams.get("from") || "";
    const toParam = url.searchParams.get("to") || "";

    // Validate date range
    if (fromParam && toParam && fromParam > toParam) {
      return jsonResponse({ error: "from must be on or before to" }, 400);
    }
    const fromTs = fromParam ? new Date(fromParam + "T00:00:00.000Z").getTime() : null;
    const toTs = toParam ? new Date(toParam + "T23:59:59.999Z").getTime() : null;

    // ── Parallel data fetch ──
    const [
      profileResult,
      allPayoutsResult,
      allTxResult,
      verificationResult,
      payoutAccountResult,
    ] = await Promise.allSettled([
      adminClient.from("profiles").select("full_name, avatar_url").eq("id", userId).single(),
      adminClient.from("payouts").select("id, amount, status, currency_code, completed_at, failed_at, failure_reason, transaction_id, initiated_at, created_at, payout_blocked_reason, release_blocked").eq("seller_id", userId),
      adminClient.from("transactions").select("id, transaction_code, status, money_status, buyer_id, verification_deadline_at, created_at, needs_release_review, release_review_reason").eq("seller_id", userId),
      adminClient.from("account_verifications").select("payout_verified").eq("user_id", userId).single(),
      adminClient.from("v_payout_account_state").select("bank_name, masked_account_number, verification_status, last_verified_at, provider_recipient_code, account_state").eq("user_id", userId).maybeSingle(),
    ]);

    // Profile
    let seller = { full_name: "User", avatar_url: null as string | null };
    if (profileResult.status === "fulfilled" && profileResult.value.data) {
      seller = profileResult.value.data;
    }

    // Payout verification
    let payoutVerified = false;
    if (verificationResult.status === "fulfilled" && verificationResult.value.data) {
      payoutVerified = (verificationResult.value.data as { payout_verified: boolean }).payout_verified;
    }

    // ── Summary metrics ──
    let totalReleased = 0;
    let totalReleasedLast30 = 0;
    let pendingReleaseAmount = 0;
    let awaitingReleaseAmount = 0;
    let blockedPayoutAmount = 0;
    let onHoldFailed = 0;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    let lastPayoutDate: string | null = null;

    const allPayouts = (allPayoutsResult.status === "fulfilled" && allPayoutsResult.value.data)
      ? allPayoutsResult.value.data as Array<Record<string, unknown>>
      : [];

    for (const p of allPayouts) {
      const amount = (p.amount as number) ?? 0;
      const status = p.status as string;
      if (status === "completed") {
        totalReleased += amount;
        if (p.completed_at && (p.completed_at as string) >= thirtyDaysAgo) {
          totalReleasedLast30 += amount;
        }
        if (!lastPayoutDate || (p.completed_at as string) > lastPayoutDate) {
          lastPayoutDate = p.completed_at as string;
        }
      } else if (status === "awaiting_release") {
        // Phase A: both parties confirmed, in SafeDeal release queue.
        awaitingReleaseAmount += amount;
        pendingReleaseAmount += amount;
      } else if (status === "blocked") {
        // Phase A: confirmed but blocked (e.g. payout_account_missing).
        blockedPayoutAmount += amount;
        onHoldFailed += amount;
      } else if (status === "pending" || status === "processing") {
        pendingReleaseAmount += amount;
      } else if (status === "failed") {
        onHoldFailed += amount;
      }
    }

    // Held in escrow from transactions
    let heldInEscrow = 0;
    let pendingReleaseFromTxAmount = 0;
    const allTx = (allTxResult.status === "fulfilled" && allTxResult.value.data)
      ? allTxResult.value.data as Array<Record<string, unknown>>
      : [];

    const heldTxIds: string[] = [];
    const pendingReleaseTxIds: string[] = [];
    const upcomingTxIds: string[] = [];
    const blockedTxIds: string[] = [];

    for (const tx of allTx) {
      const moneyStatus = tx.money_status as string;
      const txStatus = tx.status as string;

      if (moneyStatus === "funds_held_in_escrow") {
        heldTxIds.push(tx.id as string);
        if (txStatus === "delivered_awaiting_verification" || txStatus === "seller_dispatched") {
          upcomingTxIds.push(tx.id as string);
        }
      }
      if (moneyStatus === "funds_pending_release") {
        // Phase A: both parties confirmed, awaiting SafeDeal release review.
        // Surface in the upcoming-releases panel.
        pendingReleaseTxIds.push(tx.id as string);
        upcomingTxIds.push(tx.id as string);
      }
      if (txStatus === "disputed") {
        blockedTxIds.push(tx.id as string);
      }
      // Surface needs_release_review transactions in the blocked panel
      // so the seller knows why their funds are stuck.
      if (tx.needs_release_review === true) {
        blockedTxIds.push(tx.id as string);
      }
    }

    // Add failed payouts to blocked
    const failedPayoutTxIds = allPayouts
      .filter((p) => (p.status as string) === "failed")
      .map((p) => p.transaction_id as string);
    const allBlockedTxIds = [...new Set([...blockedTxIds, ...failedPayoutTxIds])];

    // Fetch pricing for held + pending-release + blocked transactions
    const allNeededTxIds = [...new Set([
      ...heldTxIds,
      ...pendingReleaseTxIds,
      ...allBlockedTxIds,
    ])];
    // Track seller-net per tx so we can both compute heldInEscrow AND fold
    // disputed/frozen seller-net into onHoldFailed for the headline KPI.
    let frozenSellerNetTotal = 0;
    if (allNeededTxIds.length > 0) {
      const { data: pricingData } = await adminClient
        .from("transaction_pricing")
        .select("transaction_id, seller_payout_amount")
        .in("transaction_id", allNeededTxIds);

      if (pricingData) {
        const pricingMap = new Map(
          pricingData.map((p: Record<string, unknown>) => [
            p.transaction_id as string,
            Number((p.seller_payout_amount as number | null) ?? 0),
          ])
        );
        for (const id of heldTxIds) {
          heldInEscrow += pricingMap.get(id) ?? 0;
        }
        for (const id of pendingReleaseTxIds) {
          pendingReleaseFromTxAmount += pricingMap.get(id) ?? 0;
        }
        // blockedTxIds = disputed transactions (money_status often funds_frozen).
        // Add their seller-net to the on-hold KPI so disputed funds are visible
        // in the headline card, not only in the side panel.
        for (const id of blockedTxIds) {
          frozenSellerNetTotal += pricingMap.get(id) ?? 0;
        }
      }
    }
    onHoldFailed += frozenSellerNetTotal;

    // Fold transaction-side pending-release into the headline pending KPI
    // so the number reflects funds that have left escrow but aren't paid yet.
    pendingReleaseAmount += pendingReleaseFromTxAmount;

    // ── Payout History (paginated) ──
    let filteredPayouts = [...allPayouts];
    if (statusFilter) {
      filteredPayouts = filteredPayouts.filter((p) => (p.status as string) === statusFilter);
    }
    if (fromTs !== null || toTs !== null) {
      filteredPayouts = filteredPayouts.filter((p) => {
        const ts = (p.completed_at ?? p.initiated_at ?? p.created_at) as string | null;
        if (!ts) return false;
        const t = new Date(ts).getTime();
        if (fromTs !== null && t < fromTs) return false;
        if (toTs !== null && t > toTs) return false;
        return true;
      });
    }

    // Sort by created_at desc
    filteredPayouts.sort((a, b) =>
      ((b.created_at as string) ?? "").localeCompare((a.created_at as string) ?? "")
    );

    const totalCount = filteredPayouts.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / limit));
    const paginatedPayouts = filteredPayouts.slice((page - 1) * limit, page * limit);

    // Enrich payout history with transaction details
    const payoutTxIds = paginatedPayouts.map((p) => p.transaction_id as string);
    const payoutTxIdsUnique = [...new Set(payoutTxIds)];

    let payoutHistory: Array<Record<string, unknown>> = [];

    if (payoutTxIdsUnique.length > 0) {
      const [itemsResult, pricingResult, txDetailsResult] = await Promise.allSettled([
        adminClient.from("transaction_items").select("transaction_id, title").in("transaction_id", payoutTxIdsUnique),
        adminClient.from("transaction_pricing").select("transaction_id, item_amount, platform_fee_amount, payment_processing_fee_amount, seller_payout_amount, currency_code").in("transaction_id", payoutTxIdsUnique),
        adminClient.from("transactions").select("id, transaction_code, buyer_id").in("id", payoutTxIdsUnique),
      ]);

      const itemMap = new Map<string, string>();
      if (itemsResult.status === "fulfilled" && itemsResult.value.data) {
        for (const i of itemsResult.value.data as Array<Record<string, unknown>>) {
          itemMap.set(i.transaction_id as string, i.title as string);
        }
      }

      const pricingMap = new Map<string, Record<string, unknown>>();
      if (pricingResult.status === "fulfilled" && pricingResult.value.data) {
        for (const p of pricingResult.value.data as Array<Record<string, unknown>>) {
          pricingMap.set(p.transaction_id as string, p);
        }
      }

      const txMap = new Map<string, Record<string, unknown>>();
      if (txDetailsResult.status === "fulfilled" && txDetailsResult.value.data) {
        for (const t of txDetailsResult.value.data as Array<Record<string, unknown>>) {
          txMap.set(t.id as string, t);
        }
      }

      // Fetch buyer names
      const buyerIds = [...new Set(
        Array.from(txMap.values()).map((t) => t.buyer_id as string).filter(Boolean)
      )];
      const buyerMap = new Map<string, string>();
      if (buyerIds.length > 0) {
        const { data: buyerData } = await adminClient.from("profiles").select("id, full_name").in("id", buyerIds);
        if (buyerData) {
          for (const b of buyerData as Array<Record<string, unknown>>) {
            buyerMap.set(b.id as string, b.full_name as string);
          }
        }
      }

      payoutHistory = paginatedPayouts.map((p) => {
        const txId = p.transaction_id as string;
        const tx = txMap.get(txId);
        const pricing = pricingMap.get(txId);
        const dbStatus = p.status as string;
        const blockReasonCode = (p.payout_blocked_reason as string | null) ?? null;
        return {
          payout_id: (p.id as string).slice(0, 8).toUpperCase(),
          payout_id_full: p.id,
          transaction_code: tx?.transaction_code ?? "—",
          transaction_id: txId,
          buyer_name: buyerMap.get(tx?.buyer_id as string) ?? "Unknown",
          item_title: itemMap.get(txId) ?? "Untitled",
          gross_amount: (pricing?.item_amount as number) ?? 0,
          fees:
            ((pricing?.platform_fee_amount as number) ?? 0) +
            Number((pricing?.payment_processing_fee_amount as number | null) ?? 0),
          net_payout: p.amount as number,
          currency_code: (pricing?.currency_code as string) ?? "NGN",
          release_date: (p.completed_at ?? p.initiated_at ?? p.created_at) as string,
          status: dbStatus,
          status_label: sellerStatusLabel(dbStatus),
          block_reason_code: blockReasonCode,
          retry_eligible: false,
          failure_reason: p.failure_reason as string | null,
          payout_blocked_reason: p.payout_blocked_reason as string | null ?? null,
          release_blocked: (p.release_blocked as boolean) ?? false,
        };
      });
    }

    // Apply search filter on enriched data
    let filteredHistory = payoutHistory;
    if (search) {
      const q = search.toLowerCase();
      filteredHistory = payoutHistory.filter((h) =>
        (h.transaction_code as string).toLowerCase().includes(q) ||
        (h.buyer_name as string).toLowerCase().includes(q) ||
        (h.item_title as string).toLowerCase().includes(q) ||
        (h.payout_id as string).toLowerCase().includes(q)
      );
    }

    // ── Upcoming Releases ──
    let upcomingReleases: Array<Record<string, unknown>> = [];
    if (upcomingTxIds.length > 0) {
      const [upItemsRes, upPricingRes, upTxRes] = await Promise.allSettled([
        adminClient.from("transaction_items").select("transaction_id, title").in("transaction_id", upcomingTxIds),
        adminClient.from("transaction_pricing").select("transaction_id, seller_payout_amount, currency_code").in("transaction_id", upcomingTxIds),
        adminClient.from("transactions").select("id, transaction_code, status, buyer_id, verification_deadline_at").in("id", upcomingTxIds),
      ]);

      const itemMap = new Map<string, string>();
      if (upItemsRes.status === "fulfilled" && upItemsRes.value.data) {
        for (const i of upItemsRes.value.data as Array<Record<string, unknown>>) {
          itemMap.set(i.transaction_id as string, i.title as string);
        }
      }
      const pricingMap = new Map<string, Record<string, unknown>>();
      if (upPricingRes.status === "fulfilled" && upPricingRes.value.data) {
        for (const p of upPricingRes.value.data as Array<Record<string, unknown>>) {
          pricingMap.set(p.transaction_id as string, p);
        }
      }
      const txList = (upTxRes.status === "fulfilled" && upTxRes.value.data)
        ? upTxRes.value.data as Array<Record<string, unknown>>
        : [];

      const buyerIds = [...new Set(txList.map((t) => t.buyer_id as string).filter(Boolean))];
      const buyerMap = new Map<string, string>();
      if (buyerIds.length > 0) {
        const { data: bd } = await adminClient.from("profiles").select("id, full_name").in("id", buyerIds);
        if (bd) for (const b of bd as Array<Record<string, unknown>>) buyerMap.set(b.id as string, b.full_name as string);
      }

      upcomingReleases = txList.map((tx) => {
        const txId = tx.id as string;
        const pricing = pricingMap.get(txId);
        const txStatus = tx.status as string;
        let releaseTrigger = "Buyer confirmation pending";
        if (txStatus === "delivered_awaiting_verification" && tx.verification_deadline_at) {
          const deadline = new Date(tx.verification_deadline_at as string);
          const hoursLeft = Math.max(0, Math.round((deadline.getTime() - now.getTime()) / (1000 * 60 * 60)));
          releaseTrigger = hoursLeft > 0 ? `SafeDeal review in ${hoursLeft}h` : "SafeDeal review imminent";
        } else if (txStatus === "seller_dispatched") {
          releaseTrigger = "Awaiting delivery confirmation";
        }
        return {
          transaction_id: txId,
          transaction_code: tx.transaction_code as string,
          item_title: itemMap.get(txId) ?? "Untitled",
          buyer_name: buyerMap.get(tx.buyer_id as string) ?? "Unknown",
          amount: Number((pricing?.seller_payout_amount as number | null) ?? 0),
          currency_code: (pricing?.currency_code as string) ?? "NGN",
          release_trigger: releaseTrigger,
          verification_deadline_at: tx.verification_deadline_at ?? null,
          status: txStatus,
        };
      });
    }

    // ── Blocked / Delayed ──
    let blockedFunds: Array<Record<string, unknown>> = [];
    if (allBlockedTxIds.length > 0) {
      const [blItemsRes, blPricingRes, blTxRes] = await Promise.allSettled([
        adminClient.from("transaction_items").select("transaction_id, title").in("transaction_id", allBlockedTxIds),
        adminClient.from("transaction_pricing").select("transaction_id, seller_payout_amount, currency_code").in("transaction_id", allBlockedTxIds),
        adminClient.from("transactions").select("id, transaction_code, status, buyer_id, needs_release_review, release_review_reason").in("id", allBlockedTxIds),
      ]);

      const itemMap = new Map<string, string>();
      if (blItemsRes.status === "fulfilled" && blItemsRes.value.data) {
        for (const i of blItemsRes.value.data as Array<Record<string, unknown>>) itemMap.set(i.transaction_id as string, i.title as string);
      }
      const pricingMap = new Map<string, Record<string, unknown>>();
      if (blPricingRes.status === "fulfilled" && blPricingRes.value.data) {
        for (const p of blPricingRes.value.data as Array<Record<string, unknown>>) pricingMap.set(p.transaction_id as string, p);
      }
      const txList = (blTxRes.status === "fulfilled" && blTxRes.value.data)
        ? blTxRes.value.data as Array<Record<string, unknown>>
        : [];

      const buyerIds = [...new Set(txList.map((t) => t.buyer_id as string).filter(Boolean))];
      const buyerMap = new Map<string, string>();
      if (buyerIds.length > 0) {
        const { data: bd } = await adminClient.from("profiles").select("id, full_name").in("id", buyerIds);
        if (bd) for (const b of bd as Array<Record<string, unknown>>) buyerMap.set(b.id as string, b.full_name as string);
      }

      const failedPayoutTxSet = new Set(failedPayoutTxIds);

      blockedFunds = txList.map((tx) => {
        const txId = tx.id as string;
        const pricing = pricingMap.get(txId);
        const txStatus = tx.status as string;
        const reviewReason = tx.release_review_reason as string | null;
        let blockerReason = "Manual review in progress";
        if (txStatus === "disputed") blockerReason = "Dispute in review";
        else if (failedPayoutTxSet.has(txId)) blockerReason = "Payout failed: retry needed";
        else if (reviewReason === "payout_account_missing") blockerReason = "Add a verified payout account to receive funds";
        else if (reviewReason === "pricing_missing") blockerReason = "SafeDeal is reviewing this transaction";
        else if (tx.needs_release_review === true) blockerReason = "SafeDeal review in progress";
        else if (!payoutVerified) blockerReason = "Seller payout verification needed";

        return {
          transaction_id: txId,
          transaction_code: tx.transaction_code as string,
          item_title: itemMap.get(txId) ?? "Untitled",
          buyer_name: buyerMap.get(tx.buyer_id as string) ?? "Unknown",
          amount: Number((pricing?.seller_payout_amount as number | null) ?? (pricing?.seller_net_amount as number | null) ?? 0),
          currency_code: (pricing?.currency_code as string) ?? "NGN",
          blocker_reason: blockerReason,
          status: txStatus,
        };
      });
    }

    // ── Stuck Payouts (pending + never initiated + older than the threshold) ──
    // This threshold is the ONLY definition of "stuck". The seller UI reads it
    // back off the response rather than restating "24 hours" in copy.
    const STUCK_PAYOUT_THRESHOLD_HOURS = 24;
    // Settlement window quoted to sellers. Emitted as numbers so no surface has
    // to hardcode the sentence.
    const SETTLEMENT_WINDOW_MIN_DAYS = 1;
    const SETTLEMENT_WINDOW_MAX_DAYS = 3;
    const stuckCutoff = new Date(
      now.getTime() - STUCK_PAYOUT_THRESHOLD_HOURS * 60 * 60 * 1000,
    ).toISOString();
    const stuckPayoutsRaw = allPayouts.filter((p) => {
      const status = p.status as string;
      const initiatedAt = p.initiated_at as string | null;
      const createdAt = p.created_at as string | null;
      return status === "pending" && !initiatedAt && createdAt && createdAt < stuckCutoff;
    });

    let stuckPayouts: Array<Record<string, unknown>> = [];
    if (stuckPayoutsRaw.length > 0) {
      const stuckTxIds = [...new Set(stuckPayoutsRaw.map((p) => p.transaction_id as string))];
      const { data: stuckTxData } = await adminClient
        .from("transactions")
        .select("id, transaction_code")
        .in("id", stuckTxIds);
      const stuckTxMap = new Map<string, string>();
      if (stuckTxData) {
        for (const t of stuckTxData as Array<Record<string, unknown>>) {
          stuckTxMap.set(t.id as string, t.transaction_code as string);
        }
      }
      stuckPayouts = stuckPayoutsRaw.map((p) => ({
        payout_id: (p.id as string).slice(0, 8).toUpperCase(),
        payout_id_full: p.id,
        transaction_id: p.transaction_id,
        transaction_code: stuckTxMap.get(p.transaction_id as string) ?? "—",
        amount: p.amount as number,
        currency_code: (p.currency_code as string) ?? "NGN",
        created_at: p.created_at,
        hours_pending: Math.round(
          (now.getTime() - new Date(p.created_at as string).getTime()) / (1000 * 60 * 60)
        ),
      }));
    }

    return jsonResponse({
      seller,
      summary: {
        total_released: totalReleased,
        total_released_last_30: totalReleasedLast30,
        pending_release: pendingReleaseAmount,
        awaiting_release: awaitingReleaseAmount,
        blocked_payouts: blockedPayoutAmount,
        held_in_escrow: heldInEscrow,
        on_hold_failed: onHoldFailed,
        currency_code: "NGN",
      },
      // Phase B7 aggregates by raw DB status (sellers see counts, not actions).
      counts: {
        awaiting_release: allPayouts.filter((p) => (p.status as string) === "awaiting_release").length,
        processing:       allPayouts.filter((p) => (p.status as string) === "processing").length,
        failed:           allPayouts.filter((p) => (p.status as string) === "failed").length,
      },
      payout_history: filteredHistory,
      pagination: {
        page,
        limit,
        total_count: totalCount,
        total_pages: totalPages,
      },
      upcoming_releases: upcomingReleases,
      blocked_funds: blockedFunds,
      stuck_payouts: stuckPayouts,
      stuck_payout_threshold_hours: STUCK_PAYOUT_THRESHOLD_HOURS,
      settlement_window: {
        min_days: SETTLEMENT_WINDOW_MIN_DAYS,
        max_days: SETTLEMENT_WINDOW_MAX_DAYS,
      },
      payout_account: (() => {
        const pa = (payoutAccountResult.status === "fulfilled" && payoutAccountResult.value.data)
          ? payoutAccountResult.value.data as Record<string, unknown>
          : null;
        const verificationStatus = (pa?.verification_status as string) ?? "pending";
        const recipientCodePresent = Boolean(pa?.provider_recipient_code);
        const accountState = (pa?.account_state as string | undefined) ?? null;
        return {
          verified: payoutVerified,
          last_payout_date: lastPayoutDate,
          bank_name: pa?.bank_name as string | null ?? null,
          account_name: seller.full_name,
          masked_account_number: pa?.masked_account_number as string | null ?? null,
          verification_status: verificationStatus,
          status: verificationStatus,
          recipient_code_present: recipientCodePresent,
          account_state: accountState,
          typical_processing_time:
            `${SETTLEMENT_WINDOW_MIN_DAYS}-${SETTLEMENT_WINDOW_MAX_DAYS} business days`,
        };
      })(),
    });
  } catch (err) {
    console.error("seller-payouts error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
