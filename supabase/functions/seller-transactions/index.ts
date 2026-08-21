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

    // Verify seller role
    const { data: hasRole } = await adminClient.rpc("has_role", {
      _user_id: userId,
      _role: "seller",
    });
    if (!hasRole) {
      return jsonResponse({ error: "Seller role required" }, 403);
    }

    // Parse body
    const body = await req.json().catch(() => ({}));
    const search = ((body.search as string) ?? "").trim().toLowerCase();
    const statusFilter = (body.status_filter as string) ?? "all";
    const dateFilter = (body.date_filter as string) ?? "all";
    const page = Math.max(1, (body.page as number) ?? 1);
    const pageSize = Math.min(50, Math.max(1, (body.page_size as number) ?? 10));

    // Status filter mapping
    const statusMap: Record<string, string[]> = {
      "all": [],
      "payment-pending": ["awaiting_buyer", "awaiting_payment"],
      "processing": ["payment_secured", "seller_preparing_delivery"],
      "fulfillment-needed": ["payment_secured", "seller_preparing_delivery"],
      "awaiting-delivery": ["seller_dispatched"],
      "delivery-proof-needed": ["seller_dispatched"],
      "buyer-verification": ["delivered_awaiting_verification"],
      "awaiting-buyer-verification": ["delivered_awaiting_verification"],
      "awaiting-buyer-review": ["delivered_awaiting_verification"],
      "completed": ["completed"],
      "disputed": ["disputed"],
      "cancelled": ["cancelled", "timed_out", "refunded"],
      "draft": ["draft"],
      "awaiting-seller-confirmation": ["completed"], // composite: also requires buyer_confirmed_at && !seller_confirmed_at
    };

    // Build query for all seller transactions (for counts)
    const { data: allTx } = await adminClient
      .from("transactions")
      .select("id, status, money_status, created_at, buyer_id, transaction_code, buyer_confirmed_at, seller_confirmed_at, dispute_status")
      .eq("seller_id", userId);

    // Drafts are pre-share/incomplete records and should not appear in the
    // default "all" list or in the summary counts. They remain reachable via
    // the explicit `?status_filter=draft` filter and the dedicated Drafts tab.
    const allRowsRaw = allTx ?? [];
    const allRows =
      statusFilter === "draft" ? allRowsRaw : allRowsRaw.filter((t) => t.status !== "draft");

    // Date filtering
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfQuarter = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);

    function dateFilterFn(createdAt: string): boolean {
      if (dateFilter === "all") return true;
      const d = new Date(createdAt);
      switch (dateFilter) {
        case "today": return d >= startOfDay;
        case "this-week": return d >= startOfWeek;
        case "this-month": return d >= startOfMonth;
        case "this-quarter": return d >= startOfQuarter;
        default: return true;
      }
    }

    // Apply status + date filters
    const allowedStatuses = statusMap[statusFilter] ?? [];
    let filteredRows = allRows.filter((tx) => {
      if (allowedStatuses.length > 0 && !allowedStatuses.includes(tx.status)) return false;
      if (statusFilter === "awaiting-seller-confirmation") {
        if (!tx.buyer_confirmed_at) return false;
        if (tx.seller_confirmed_at) return false;
        if (tx.dispute_status && tx.dispute_status !== "none") return false;
      }
      if (!dateFilterFn(tx.created_at)) return false;
      return true;
    });

    // Get item/pricing/buyer data for filtered transactions
    const txIds = filteredRows.map((t) => t.id);
    const buyerIds = [...new Set(filteredRows.map((t) => t.buyer_id).filter(Boolean))];

    let itemMap = new Map<string, { title: string; category: string; quantity: number }>();
    let pricingMap = new Map<string, { amount: number; currency: string; sellerNet: number; platformFee: number; processingFee: number }>();
    let buyerMap = new Map<string, { name: string; email: string; avatar: string | null }>();

    // Find transactions with null buyer_id to fetch from participants
    const nullBuyerTxIds = filteredRows.filter((t) => !t.buyer_id).map((t) => t.id);

    if (txIds.length > 0) {
      const [itemsRes, pricingRes, buyersRes, participantsRes] = await Promise.all([
        adminClient
          .from("transaction_items")
          .select("transaction_id, title, quantity, condition_label")
          .in("transaction_id", txIds),
        adminClient
          .from("transaction_pricing")
          .select("transaction_id, item_amount, buyer_total_amount, seller_payout_amount, platform_fee_amount, payment_processing_fee_amount, currency_code")
          .in("transaction_id", txIds),
        buyerIds.length > 0
          ? adminClient
              .from("profiles")
              .select("id, full_name, email, avatar_url")
              .in("id", buyerIds)
          : Promise.resolve({ data: [] }),
        nullBuyerTxIds.length > 0
          ? adminClient
              .from("transaction_participants")
              .select("transaction_id, display_name, email, phone")
              .in("transaction_id", nullBuyerTxIds)
              .eq("role", "buyer")
          : Promise.resolve({ data: [] }),
      ]);

      if (itemsRes.data) {
        for (const item of itemsRes.data) {
          itemMap.set(item.transaction_id, {
            title: item.title ?? "Untitled",
            category: item.condition_label ?? "",
            quantity: item.quantity ?? 1,
          });
        }
      }
      if (pricingRes.data) {
        for (const p of pricingRes.data) {
          pricingMap.set(p.transaction_id, {
            amount: p.item_amount ?? 0,
            currency: p.currency_code ?? "NGN",
            sellerNet: Number(p.seller_payout_amount ?? 0),
            platformFee: p.platform_fee_amount ?? 0,
            processingFee: p.payment_processing_fee_amount ?? 0,
          });
        }
      }
      if (buyersRes.data) {
        for (const b of buyersRes.data as Array<Record<string, unknown>>) {
          buyerMap.set(b.id as string, {
            name: (b.full_name as string) ?? "Unknown",
            email: (b.email as string) ?? "",
            avatar: (b.avatar_url as string) ?? null,
          });
        }
      }
      // Fallback: use transaction_participants for transactions without a registered buyer
      if (participantsRes.data) {
        for (const p of participantsRes.data as Array<Record<string, unknown>>) {
          const txId = p.transaction_id as string;
          // Store in buyerMap keyed by transaction_id prefixed to avoid collision
          buyerMap.set(`participant:${txId}`, {
            name: (p.display_name as string) ?? "Unknown",
            email: (p.email as string) ?? (p.phone as string) ?? "",
            avatar: null,
          });
        }
      }
    }

    // Apply search filter across enriched data
    if (search) {
      filteredRows = filteredRows.filter((tx) => {
        if (tx.transaction_code?.toLowerCase().includes(search)) return true;
        const buyer = buyerMap.get(tx.buyer_id);
        if (buyer?.name.toLowerCase().includes(search)) return true;
        if (buyer?.email.toLowerCase().includes(search)) return true;
        const item = itemMap.get(tx.id);
        if (item?.title.toLowerCase().includes(search)) return true;
        return false;
      });
    }

    // Sort by created_at desc
    filteredRows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const totalCount = filteredRows.length;
    const totalPages = Math.ceil(totalCount / pageSize);
    const paginatedRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);

    // Check active rider tokens for paginated rows (cheap join)
    const paginatedIds = paginatedRows.map((t) => t.id);
    const activeTokenIds = new Set<string>();
    if (paginatedIds.length > 0) {
      const { data: tokenRows } = await adminClient
        .from("delivery_confirmation_tokens")
        .select("transaction_id")
        .eq("status", "active")
        .in("transaction_id", paginatedIds);
      for (const r of (tokenRows ?? []) as Array<{ transaction_id: string }>) {
        activeTokenIds.add(r.transaction_id);
      }
    }

    // Per-row unread message counts for the seller (uses idx_transaction_messages_unread)
    const unreadByTx = new Map<string, { count: number; last_at: string | null; last_preview: string | null }>();
    if (paginatedIds.length > 0) {
      const { data: msgRows } = await adminClient
        .from("transaction_messages")
        .select("transaction_id,message_text,created_at")
        .eq("recipient_user_id", userId)
        .eq("is_read", false)
        .in("transaction_id", paginatedIds)
        .order("created_at", { ascending: false })
        .limit(500);
      for (const r of (msgRows ?? []) as Array<{ transaction_id: string; message_text: string | null; created_at: string }>) {
        const cur = unreadByTx.get(r.transaction_id);
        if (!cur) {
          const preview = (r.message_text ?? "").slice(0, 80);
          unreadByTx.set(r.transaction_id, { count: 1, last_at: r.created_at, last_preview: preview || null });
        } else {
          cur.count += 1;
        }
      }
    }

    // Build response rows. Use the canonical seller_net_amount and fee values
    // from `transaction_pricing` directly: do NOT recompute or cap fees here.
    // The pricing computation already handles tier rates and the buyer-friendly
    // service-fee cap; recomputing on read produces inconsistent numbers between
    // per-row "Net" and the aggregated `total_earned` summary value.
    const transactions = paginatedRows.map((tx) => {
      const buyer = tx.buyer_id
        ? buyerMap.get(tx.buyer_id)
        : buyerMap.get(`participant:${tx.id}`);
      const item = itemMap.get(tx.id);
      const pricing = pricingMap.get(tx.id);
      const serviceFee = (pricing?.platformFee ?? 0) + (pricing?.processingFee ?? 0);
      const sellerNet = pricing?.sellerNet ?? 0;
      const unread = unreadByTx.get(tx.id);
      return {
        transaction_id: tx.id,
        transaction_code: tx.transaction_code,
        buyer_name: buyer?.name ?? "Unknown Buyer",
        buyer_email: buyer?.email ?? "",
        buyer_avatar: buyer?.avatar ?? null,
        item_title: item?.title ?? "Untitled Item",
        item_category: item?.category ?? "",
        item_quantity: item?.quantity ?? 1,
        amount: pricing?.amount ?? 0,
        seller_net: sellerNet,
        service_fee: serviceFee,
        currency_code: pricing?.currency ?? "NGN",
        transaction_status: tx.status,
        money_status: tx.money_status,
        created_at: tx.created_at,
        has_active_rider_token: activeTokenIds.has(tx.id),
        unread_message_count: unread?.count ?? 0,
        last_message_at: unread?.last_at ?? null,
        last_message_preview: unread?.last_preview ?? null,
      };
    });

    // Summary counts (from all non-draft transactions, ignoring user filters).
    // Split the prior single "active / in progress" bucket into two clearer
    // buckets so the UI can distinguish pre-payment from post-payment fulfillment.
    const awaitingPaymentStatuses = ["awaiting_buyer", "awaiting_payment"];
    const inFulfillmentStatuses = [
      "payment_secured",
      "seller_preparing_delivery",
      "seller_dispatched",
      "delivered_awaiting_verification",
    ];
    const completedStatuses = ["completed"];

    const awaitingPaymentCount = allRows.filter((t) => awaitingPaymentStatuses.includes(t.status)).length;
    const inFulfillmentCount = allRows.filter((t) => inFulfillmentStatuses.includes(t.status)).length;

    const summary = {
      total: allRows.length,
      // `in_progress` retained for backward compatibility (= awaiting + fulfillment).
      in_progress: awaitingPaymentCount + inFulfillmentCount,
      awaiting_payment_count: awaitingPaymentCount,
      in_fulfillment_count: inFulfillmentCount,
      completed: allRows.filter((t) => completedStatuses.includes(t.status)).length,
      disputed_count: allRows.filter((t) => t.status === "disputed").length,
      cancelled_count: allRows.filter((t) => t.status === "cancelled").length,
      timed_out_count: allRows.filter((t) => t.status === "timed_out").length,
      refunded_count: allRows.filter((t) => t.status === "refunded").length,
      awaiting_seller_confirmation_count: allRows.filter(
        (t) =>
          t.status === "completed" &&
          t.buyer_confirmed_at &&
          !t.seller_confirmed_at &&
          (!t.dispute_status || t.dispute_status === "none"),
      ).length,
      total_earned: 0,
    };

    // Calculate total earned from completed transaction pricing
    const completedIds = allRows.filter((t) => t.status === "completed").map((t) => t.id);
    if (completedIds.length > 0) {
      const { data: completedPricing } = await adminClient
        .from("transaction_pricing")
        .select("seller_payout_amount")
        .in("transaction_id", completedIds);
      if (completedPricing) {
        for (const p of completedPricing) {
          summary.total_earned += Number((p.seller_payout_amount as number | null) ?? 0);
        }
      }
    }

    return jsonResponse({
      transactions,
      pagination: {
        page,
        page_size: pageSize,
        total_count: totalCount,
        total_pages: totalPages,
      },
      summary,
    });
  } catch (err) {
    console.error("seller-transactions error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
