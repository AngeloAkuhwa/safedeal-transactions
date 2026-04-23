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

const REASON_LABELS: Record<string, string> = {
  wrong_item_received: "Wrong item received",
  damaged_item_received: "Damaged item",
  incomplete_order: "Incomplete order",
  item_not_as_described: "Item not as described",
  item_not_delivered: "Item not delivered",
  suspected_fake_item: "Suspected fake item",
  other: "Other",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Auth
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

    // 2. Role check
    const { data: hasRole, error: roleError } = await adminClient.rpc("has_role", {
      _user_id: userId,
      _role: "seller",
    });
    if (roleError || !hasRole) {
      return jsonResponse({ error: "Seller role required" }, 403);
    }

    // 3. Parse filters
    let filters: Record<string, unknown> = {};
    try {
      const body = await req.json();
      if (body && typeof body === "object") filters = body as Record<string, unknown>;
    } catch {
      // no body is fine
    }

    const search = String(filters.search || "").trim();
    const statusFilter = String(filters.status || "all");
    const reasonFilter = String(filters.reason || "all");
    const actionNeeded = filters.action_needed === true;
    const page = Math.max(1, parseInt(String(filters.page || "1"), 10) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(String(filters.page_size || "20"), 10) || 20));

    // PHASE 0: Get seller's transaction IDs
    const { data: sellerTxRows, error: txScopeError } = await adminClient
      .from("transactions")
      .select("id, buyer_id, transaction_code, money_status")
      .eq("seller_id", userId);

    if (txScopeError || !sellerTxRows) {
      console.error("seller-disputes scope error:", txScopeError);
      return jsonResponse({ error: "Failed to scope disputes" }, 500);
    }

    if (sellerTxRows.length === 0) {
      return jsonResponse({
        summary: {
          open_count: 0,
          awaiting_response_count: 0,
          under_review_count: 0,
          resolved_count: 0,
          blocked_payout_amount: 0,
        },
        items: [],
        action_needed: [],
        blocked_payouts: [],
        pagination: { page, page_size: pageSize, total_count: 0, total_pages: 0 },
      });
    }

    const sellerTxIds = sellerTxRows.map((t) => t.id as string);
    const txLookup = new Map(sellerTxRows.map((t) => [t.id as string, t]));

    // PHASE 1: All disputes for summary + action needed + blocked payouts
    const { data: allDisputes } = await adminClient
      .from("disputes")
      .select("id, status, transaction_id, seller_response_due_at, reason, opened_at, description")
      .in("transaction_id", sellerTxIds);

    const allDisputesList = allDisputes ?? [];
    const allDisputeIds = allDisputesList.map((d) => d.id as string);

    // Check which disputes have seller responses
    const responseSet = new Set<string>();
    if (allDisputeIds.length > 0) {
      const { data: responses } = await adminClient
        .from("dispute_responses")
        .select("dispute_id")
        .in("dispute_id", allDisputeIds);
      if (responses) {
        for (const r of responses) responseSet.add(r.dispute_id as string);
      }
    }

    // Summary counts
    let summary = {
      open_count: 0,
      awaiting_response_count: 0,
      under_review_count: 0,
      resolved_count: 0,
      blocked_payout_amount: 0,
    };

    for (const d of allDisputesList) {
      const s = d.status as string;
      if (s === "open" || s === "seller_response_pending") {
        summary.open_count++;
        if (!responseSet.has(d.id as string)) {
          summary.awaiting_response_count++;
        }
      } else if (s === "under_review") {
        summary.under_review_count++;
      } else if (s === "resolved") {
        summary.resolved_count++;
      }
    }

    // Blocked payouts: get pricing for disputed transactions with frozen funds
    const frozenTxIds = sellerTxRows
      .filter((t) => (t.money_status as string) === "funds_frozen")
      .map((t) => t.id as string);

    const blockedPayouts: Array<Record<string, unknown>> = [];

    if (frozenTxIds.length > 0) {
      const [pricingRes, itemsRes, buyerRes] = await Promise.all([
        adminClient
          .from("transaction_pricing")
          .select("transaction_id, seller_net_amount, currency_code")
          .in("transaction_id", frozenTxIds),
        adminClient
          .from("transaction_items")
          .select("transaction_id, title")
          .in("transaction_id", frozenTxIds),
        (() => {
          const buyerIds = [
            ...new Set(frozenTxIds.map((id) => txLookup.get(id)?.buyer_id as string).filter(Boolean)),
          ];
          return buyerIds.length > 0
            ? adminClient.from("profiles").select("id, full_name").in("id", buyerIds)
            : Promise.resolve({ data: [] });
        })(),
      ]);

      const pricingLookup = new Map(
        (pricingRes.data ?? []).map((p) => [p.transaction_id as string, p])
      );
      const itemLookup = new Map(
        (itemsRes.data ?? []).map((i) => [i.transaction_id as string, i.title as string])
      );
      const buyerLookup = new Map(
        ((buyerRes as { data: Array<Record<string, unknown>> | null }).data ?? []).map((b) => [
          b.id as string,
          b.full_name as string,
        ])
      );

      let totalBlocked = 0;
      for (const txId of frozenTxIds) {
        const tx = txLookup.get(txId)!;
        const pricing = pricingLookup.get(txId);
        const amount = (pricing?.seller_net_amount as number) ?? 0;
        totalBlocked += amount;

        // Find associated dispute
        const dispute = allDisputesList.find((d) => d.transaction_id === txId);

        blockedPayouts.push({
          transaction_id: txId,
          transaction_code: tx.transaction_code ?? null,
          item_title: itemLookup.get(txId) ?? null,
          buyer_name: buyerLookup.get(tx.buyer_id as string) ?? null,
          amount,
          currency_code: (pricing?.currency_code as string) ?? "NGN",
          dispute_id: dispute?.id ?? null,
          dispute_status: dispute?.status ?? null,
        });
      }
      summary.blocked_payout_amount = totalBlocked;
    }

    // Action needed items: disputes where seller hasn't responded
    const actionNeededItems: Array<Record<string, unknown>> = [];
    for (const d of allDisputesList) {
      const s = d.status as string;
      if ((s === "open" || s === "seller_response_pending") && !responseSet.has(d.id as string)) {
        const tx = txLookup.get(d.transaction_id as string);
        actionNeededItems.push({
          dispute_id: d.id,
          transaction_id: d.transaction_id,
          transaction_code: tx?.transaction_code ?? null,
          buyer_id: tx?.buyer_id ?? null,
          reason: d.reason,
          reason_label: REASON_LABELS[d.reason as string] ?? (d.reason as string).replace(/_/g, " "),
          action_required: "Submit your response and evidence",
          deadline: d.seller_response_due_at,
          opened_at: d.opened_at,
        });
      }
    }

    // PHASE 2: Filtered paginated disputes list

    // Pre-search
    let searchMatchedTxIds: Set<string> | null = null;
    let searchMatchedReasons: string[] | null = null;

    if (search) {
      const searchPattern = `%${search}%`;
      const searchLower = search.toLowerCase();
      searchMatchedTxIds = new Set<string>();

      // Match transaction codes
      for (const tx of sellerTxRows) {
        if (((tx.transaction_code as string) || "").toLowerCase().includes(searchLower)) {
          searchMatchedTxIds.add(tx.id as string);
        }
      }

      // Match reason labels
      searchMatchedReasons = [];
      for (const [enumVal, label] of Object.entries(REASON_LABELS)) {
        if (label.toLowerCase().includes(searchLower)) {
          searchMatchedReasons.push(enumVal);
        }
      }

      // Search items and buyer profiles
      const buyerIds = [...new Set(sellerTxRows.map((t) => t.buyer_id as string).filter(Boolean))];

      const searchResults = await Promise.allSettled([
        adminClient
          .from("transaction_items")
          .select("transaction_id")
          .in("transaction_id", sellerTxIds)
          .ilike("title", searchPattern),
        buyerIds.length > 0
          ? adminClient.from("profiles").select("id").in("id", buyerIds).ilike("full_name", searchPattern)
          : Promise.resolve({ data: [] }),
      ]);

      if (searchResults[0].status === "fulfilled") {
        const d = (searchResults[0].value as { data: Array<Record<string, unknown>> | null }).data;
        if (d) for (const item of d) searchMatchedTxIds.add(item.transaction_id as string);
      }

      if (searchResults[1].status === "fulfilled") {
        const d = (searchResults[1].value as { data: Array<Record<string, unknown>> | null }).data;
        if (d) {
          const matchedBuyerIds = new Set(d.map((b) => b.id as string));
          for (const tx of sellerTxRows) {
            if (matchedBuyerIds.has(tx.buyer_id as string)) {
              searchMatchedTxIds.add(tx.id as string);
            }
          }
        }
      }
    }

    // Build disputes query
    let query = adminClient
      .from("disputes")
      .select(
        "id, transaction_id, reason, description, status, opened_at, resolved_at, seller_response_due_at",
        { count: "exact" }
      )
      .in("transaction_id", sellerTxIds);

    // Status filter
    if (statusFilter !== "all") {
      if (statusFilter === "open") {
        query = query.in("status", ["open", "seller_response_pending"]);
      } else {
        query = query.eq("status", statusFilter);
      }
    }

    // Reason filter
    if (reasonFilter !== "all") {
      query = query.eq("reason", reasonFilter);
    }

    // Search filter
    if (search) {
      const searchPattern = `%${search}%`;
      const orParts: string[] = [];
      orParts.push(`description.ilike.${searchPattern}`);
      if (searchMatchedTxIds && searchMatchedTxIds.size > 0) {
        orParts.push(`transaction_id.in.(${[...searchMatchedTxIds].join(",")})`);
      }
      if (searchMatchedReasons && searchMatchedReasons.length > 0) {
        orParts.push(`reason.in.(${searchMatchedReasons.join(",")})`);
      }
      query = query.or(orParts.join(","));
    }

    // Action-needed toggle: only disputes where seller hasn't responded
    // We'll filter post-query since we need response data

    // Paginate
    const offset = (page - 1) * pageSize;
    query = query.order("opened_at", { ascending: false }).range(offset, offset + pageSize - 1);

    const { data: disputeRows, error: disputeError, count: totalCount } = await query;

    if (disputeError) {
      console.error("seller-disputes query error:", disputeError);
      return jsonResponse({ error: "Failed to load disputes" }, 500);
    }

    if (!disputeRows) {
      return jsonResponse({ error: "Failed to load disputes" }, 500);
    }

    // PHASE 3: Enrichment
    const disputeIds = disputeRows.map((d) => d.id as string);
    const disputeTxIds = [...new Set(disputeRows.map((d) => d.transaction_id as string))];
    const buyerIdsForEnrich = [
      ...new Set(disputeTxIds.map((txId) => txLookup.get(txId)?.buyer_id as string).filter(Boolean)),
    ];

    const itemMap = new Map<string, string>();
    const pricingMap = new Map<string, number>();
    const buyerMap = new Map<string, { name: string; avatar_url: string | null }>();

    if (disputeIds.length > 0) {
      const enrichResults = await Promise.allSettled([
        disputeTxIds.length > 0
          ? adminClient.from("transaction_items").select("transaction_id, title").in("transaction_id", disputeTxIds)
          : Promise.resolve({ data: [] }),
        disputeTxIds.length > 0
          ? adminClient
              .from("transaction_pricing")
              .select("transaction_id, seller_net_amount")
              .in("transaction_id", disputeTxIds)
          : Promise.resolve({ data: [] }),
        buyerIdsForEnrich.length > 0
          ? adminClient.from("profiles").select("id, full_name, avatar_url").in("id", buyerIdsForEnrich)
          : Promise.resolve({ data: [] }),
      ]);

      if (enrichResults[0].status === "fulfilled") {
        const d = (enrichResults[0].value as { data: Array<Record<string, unknown>> | null }).data;
        if (d) for (const item of d) {
          if (!itemMap.has(item.transaction_id as string)) {
            itemMap.set(item.transaction_id as string, item.title as string);
          }
        }
      }

      if (enrichResults[1].status === "fulfilled") {
        const d = (enrichResults[1].value as { data: Array<Record<string, unknown>> | null }).data;
        if (d) for (const p of d) {
          pricingMap.set(p.transaction_id as string, (p.seller_net_amount as number) ?? 0);
        }
      }

      if (enrichResults[2].status === "fulfilled") {
        const d = (enrichResults[2].value as { data: Array<Record<string, unknown>> | null }).data;
        if (d) for (const b of d) {
          buyerMap.set(b.id as string, {
            name: b.full_name as string,
            avatar_url: (b.avatar_url as string | null) ?? null,
          });
        }
      }
    }

    // Enrich action needed items with buyer names
    for (const item of actionNeededItems) {
      const buyerId = item.buyer_id as string;
      const buyer = buyerMap.get(buyerId);
      item.buyer_name = buyer?.name ?? null;
      delete item.buyer_id;
    }

    // Build response items
    const items = disputeRows.map((d) => {
      const disputeId = d.id as string;
      const txId = d.transaction_id as string;
      const status = d.status as string;
      const reason = d.reason as string;
      const tx = txLookup.get(txId);
      const buyerId = tx?.buyer_id as string | undefined;
      const buyer = buyerId ? buyerMap.get(buyerId) : null;

      const hasResponse = responseSet.has(disputeId);
      let sellerResponseStatus = "not_responded";
      if (hasResponse) {
        sellerResponseStatus = "responded";
      } else if (status === "seller_response_pending") {
        sellerResponseStatus = "pending";
      }

      // Money impact
      const moneyStatus = (tx?.money_status as string) ?? null;
      let moneyImpact = "no_impact";
      if (moneyStatus === "funds_frozen") moneyImpact = "funds_frozen";
      else if (moneyStatus === "funds_held_in_escrow") moneyImpact = "payout_blocked";
      else if (moneyStatus === "refund_pending") moneyImpact = "refund_pending";

      // CTA
      let primaryAction;
      if (status === "resolved") {
        primaryAction = { label: "View Resolution", route: `/seller/disputes/${disputeId}` };
      } else if (!hasResponse && (status === "open" || status === "seller_response_pending")) {
        primaryAction = { label: "Respond Now", route: `/seller/disputes/${disputeId}` };
      } else {
        primaryAction = { label: "View Case", route: `/seller/disputes/${disputeId}` };
      }

      const secondaryAction = {
        label: "View Transaction",
        route: `/seller/transactions/${txId}`,
      };

      return {
        id: disputeId,
        transaction_id: txId,
        transaction_code: (tx?.transaction_code as string) ?? null,
        item_title: itemMap.get(txId) ?? null,
        seller_net_amount: pricingMap.get(txId) ?? null,
        reason,
        reason_label: REASON_LABELS[reason] ?? reason.replace(/_/g, " "),
        status,
        seller_response_status: sellerResponseStatus,
        money_status: moneyStatus,
        money_impact: moneyImpact,
        seller_response_due_at: d.seller_response_due_at ?? null,
        buyer: buyer ? { id: buyerId, name: buyer.name, avatar_url: buyer.avatar_url } : null,
        opened_at: d.opened_at as string,
        resolved_at: d.resolved_at as string | null,
        primary_action: primaryAction,
        secondary_action: secondaryAction,
      };
    });

    const total = totalCount ?? 0;

    return jsonResponse({
      summary,
      items,
      action_needed: actionNeededItems,
      blocked_payouts: blockedPayouts,
      pagination: {
        page,
        page_size: pageSize,
        total_count: total,
        total_pages: Math.ceil(total / pageSize) || 0,
      },
    });
  } catch (err) {
    console.error("seller-disputes error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
