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

// ── Tiered dispute limits (must match buyer-profile) ──

// Source of truth shared with transaction-verify enforcement
import { MAX_OPEN_DISPUTES_BY_LEVEL } from "../_shared/dispute-limits.ts";
import { BUYER_AMOUNT_LIMIT_BY_LEVEL, limitFor } from "../_shared/verification-limits.ts";

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

    const { data: userData, error: userError } =
      await adminClient.auth.getUser(token);
    if (userError || !userData?.user) {
      return jsonResponse({ error: "Invalid session" }, 401);
    }
    const userId = userData.user.id;

    // 2. Role check
    const { data: hasRole, error: roleError } = await adminClient.rpc(
      "has_role",
      { _user_id: userId, _role: "buyer" }
    );
    if (roleError || !hasRole) {
      return jsonResponse({ error: "Buyer role required" }, 403);
    }

    // 2b. Verification gate. Unverified buyers cannot access disputes
    const [verifResult, profileResult] = await Promise.all([
      adminClient
        .from("account_verifications")
        .select("phone_verified, verification_level")
        .eq("user_id", userId)
        .single(),
      adminClient
        .from("profiles")
        .select("state_name, city_name")
        .eq("id", userId)
        .single(),
    ]);

    const phoneVerified = !!verifResult.data?.phone_verified;
    const locationComplete = !!(profileResult.data?.state_name && profileResult.data?.city_name);
    const level = (verifResult.data?.verification_level as string) || "unverified";
    const levelPermits = level !== "unverified";

    if (!phoneVerified || !locationComplete || !levelPermits) {
      const missing: string[] = [];
      if (!phoneVerified) missing.push("phone_verification");
      if (!locationComplete) missing.push("location");
      if (!levelPermits) missing.push("verification_level");
      return jsonResponse({
        error: "Account verification incomplete",
        missing,
        message: "Complete your verification to access disputes.",
      }, 403);
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
    const page = Math.max(1, parseInt(String(filters.page || "1"), 10) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(String(filters.page_size || "20"), 10) || 20));

    // PHASE 0: Get buyer's transaction IDs (ownership scoping)
    const { data: buyerTxRows, error: txScopeError } = await adminClient
      .from("transactions")
      .select("id, seller_id, transaction_code, money_status")
      .eq("buyer_id", userId);

    if (txScopeError || !buyerTxRows) {
      console.error("buyer-disputes scope error:", txScopeError);
      return jsonResponse({ error: "Failed to scope disputes" }, 500);
    }

    if (buyerTxRows.length === 0) {
      return jsonResponse({
        summary: { open_count: 0, under_review_count: 0, resolved_count: 0, funds_frozen_count: 0 },
        items: [],
        pagination: { page, page_size: pageSize, total_count: 0, total_pages: 0 },
      });
    }

    const buyerTxIds = buyerTxRows.map((t) => t.id as string);
    const txLookup = new Map(buyerTxRows.map((t) => [t.id as string, t]));

    // PHASE 1: Summary counts (partial-failure safe)
    let summary = {
      open_count: 0,
      under_review_count: 0,
      resolved_count: 0,
      funds_frozen_count: 0,
    };

    try {
      const { data: allDisputes } = await adminClient
        .from("disputes")
        .select("id, status, transaction_id")
        .in("transaction_id", buyerTxIds);

      if (allDisputes) {
        for (const d of allDisputes) {
          const s = d.status as string;
          if (s === "open" || s === "seller_response_pending") summary.open_count++;
          else if (s === "under_review") summary.under_review_count++;
          else if (s === "resolved") summary.resolved_count++;

          const tx = txLookup.get(d.transaction_id as string);
          if (tx && (tx.money_status as string) === "funds_frozen") summary.funds_frozen_count++;
        }
      }
    } catch {
      // summary defaults to zeros
    }

    // PHASE 2: Filtered paginated list

    // Pre-search: find matching transaction IDs from items, seller profiles, tx codes
    let searchMatchedTxIds: Set<string> | null = null;
    let searchMatchedReasons: string[] | null = null;

    if (search) {
      const searchPattern = `%${search}%`;
      const searchLower = search.toLowerCase();
      searchMatchedTxIds = new Set<string>();

      // Match transaction codes
      for (const tx of buyerTxRows) {
        if ((tx.transaction_code as string || "").toLowerCase().includes(searchLower)) {
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

      // Search items and seller profiles
      const sellerIds = [...new Set(buyerTxRows.map((t) => t.seller_id as string).filter(Boolean))];

      const searchResults = await Promise.allSettled([
        adminClient
          .from("transaction_items")
          .select("transaction_id")
          .in("transaction_id", buyerTxIds)
          .ilike("title", searchPattern),
        sellerIds.length > 0
          ? adminClient
              .from("profiles")
              .select("id")
              .in("id", sellerIds)
              .ilike("full_name", searchPattern)
          : Promise.resolve({ data: [] }),
      ]);

      if (searchResults[0].status === "fulfilled") {
        const d = (searchResults[0].value as { data: Array<Record<string, unknown>> | null }).data;
        if (d) for (const item of d) searchMatchedTxIds.add(item.transaction_id as string);
      }

      if (searchResults[1].status === "fulfilled") {
        const d = (searchResults[1].value as { data: Array<Record<string, unknown>> | null }).data;
        if (d) {
          const matchedSellerIds = new Set(d.map((s) => s.id as string));
          for (const tx of buyerTxRows) {
            if (matchedSellerIds.has(tx.seller_id as string)) {
              searchMatchedTxIds.add(tx.id as string);
            }
          }
        }
      }
    }

    // Build disputes query
    let query = adminClient
      .from("disputes")
      .select("id, transaction_id, reason, description, status, opened_at, resolved_at", { count: "exact" })
      .in("transaction_id", buyerTxIds);

    // Status filter
    if (statusFilter !== "all") {
      if (statusFilter === "open") {
        query = query.in("status", ["open", "seller_response_pending"]);
      } else {
        query = query.eq("status", statusFilter);
      }
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

    // Paginate
    const offset = (page - 1) * pageSize;
    query = query.order("opened_at", { ascending: false }).range(offset, offset + pageSize - 1);

    const { data: disputeRows, error: disputeError, count: totalCount } = await query;

    if (disputeError) {
      console.error("buyer-disputes query error:", disputeError);
      return jsonResponse({ error: "Failed to load disputes" }, 500);
    }

    if (!disputeRows) {
      return jsonResponse({ error: "Failed to load disputes" }, 500);
    }

    // PHASE 3: Enrichment (partial-failure safe)
    const disputeIds = disputeRows.map((d) => d.id as string);
    const disputeTxIds = [...new Set(disputeRows.map((d) => d.transaction_id as string))];
    const sellerIdsForEnrich = [...new Set(
      disputeTxIds.map((txId) => txLookup.get(txId)?.seller_id as string).filter(Boolean)
    )];

    const itemMap = new Map<string, string>();
    const pricingMap = new Map<string, number>();
    const sellerMap = new Map<string, { name: string; avatar_url: string | null }>();
    const responseSet = new Set<string>();

    if (disputeIds.length > 0) {
      const enrichQueries = [
        // Items
        disputeTxIds.length > 0
          ? adminClient
              .from("transaction_items")
              .select("transaction_id, title")
              .in("transaction_id", disputeTxIds)
          : Promise.resolve({ data: [] }),
        // Pricing
        disputeTxIds.length > 0
          ? adminClient
              .from("transaction_pricing")
              .select("transaction_id, buyer_total_amount")
              .in("transaction_id", disputeTxIds)
          : Promise.resolve({ data: [] }),
        // Sellers
        sellerIdsForEnrich.length > 0
          ? adminClient
              .from("profiles")
              .select("id, full_name, avatar_url")
              .in("id", sellerIdsForEnrich)
          : Promise.resolve({ data: [] }),
        // Dispute responses
        adminClient
          .from("dispute_responses")
          .select("dispute_id")
          .in("dispute_id", disputeIds),
      ];

      const enrichResults = await Promise.allSettled(enrichQueries);

      // Items
      if (enrichResults[0].status === "fulfilled") {
        const d = (enrichResults[0].value as { data: Array<Record<string, unknown>> | null }).data;
        if (d) for (const item of d) {
          if (!itemMap.has(item.transaction_id as string)) {
            itemMap.set(item.transaction_id as string, item.title as string);
          }
        }
      }

      // Pricing
      if (enrichResults[1].status === "fulfilled") {
        const d = (enrichResults[1].value as { data: Array<Record<string, unknown>> | null }).data;
        if (d) for (const p of d) {
          pricingMap.set(p.transaction_id as string, (p.buyer_total_amount as number) ?? 0);
        }
      }

      // Sellers
      if (enrichResults[2].status === "fulfilled") {
        const d = (enrichResults[2].value as { data: Array<Record<string, unknown>> | null }).data;
        if (d) for (const s of d) {
          sellerMap.set(s.id as string, {
            name: s.full_name as string,
            avatar_url: (s.avatar_url as string | null) ?? null,
          });
        }
      }

      // Responses
      if (enrichResults[3].status === "fulfilled") {
        const d = (enrichResults[3].value as { data: Array<Record<string, unknown>> | null }).data;
        if (d) for (const r of d) responseSet.add(r.dispute_id as string);
      }
    }

    // Build response items
    const items = disputeRows.map((d) => {
      const disputeId = d.id as string;
      const txId = d.transaction_id as string;
      const status = d.status as string;
      const reason = d.reason as string;
      const tx = txLookup.get(txId);
      const sellerId = tx?.seller_id as string | undefined;
      const seller = sellerId ? sellerMap.get(sellerId) : null;

      // Seller response status
      let sellerResponseStatus = "not_responded";
      if (responseSet.has(disputeId)) {
        sellerResponseStatus = "responded";
      } else if (status === "seller_response_pending") {
        sellerResponseStatus = "pending";
      }

      // CTA
      const primaryAction = status === "resolved"
        ? { label: "View Resolution", route: `/dashboard/disputes/${disputeId}` }
        : { label: "View Dispute", route: `/dashboard/disputes/${disputeId}` };

      const secondaryAction = { label: "View Transaction", route: `/dashboard/transactions/${txId}` };

      return {
        id: disputeId,
        transaction_id: txId,
        transaction_code: (tx?.transaction_code as string) ?? null,
        item_title: itemMap.get(txId) ?? null,
        buyer_total_amount: pricingMap.get(txId) ?? null,
        reason,
        reason_label: REASON_LABELS[reason] ?? reason.replace(/_/g, " "),
        status,
        seller_response_status: sellerResponseStatus,
        money_status: (tx?.money_status as string) ?? null,
        seller: seller ? { id: sellerId, name: seller.name, avatar_url: seller.avatar_url } : null,
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
      pagination: {
        page,
        page_size: pageSize,
        total_count: total,
        total_pages: Math.ceil(total / pageSize) || 0,
      },
      // Tiered dispute policy info for frontend.
      //
      // Null rather than 0 for an unrecognised level, matching the shape
      // `buyer-profile` and `seller-profile` already use. This block is read
      // only, so it refuses by declining to state a number instead of
      // returning an error: a UI that renders "0 disputes allowed" for a data
      // fault tells the person something false about their own account, while
      // a null renders as unknown.
      dispute_policy: (() => {
        const amountLimit = limitFor(BUYER_AMOUNT_LIMIT_BY_LEVEL, level);
        const maxOpen = limitFor(MAX_OPEN_DISPUTES_BY_LEVEL, level);
        return {
          verification_level: level,
          amount_limit: amountLimit,
          max_open_disputes: maxOpen,
          current_open_disputes: summary.open_count,
          // Unknown level cannot open a new dispute: fail closed, and the
          // nulls above say why rather than implying a zero allowance.
          can_open_new_dispute: maxOpen !== null && summary.open_count < maxOpen,
        };
      })(),
    });
  } catch (err) {
    console.error("buyer-disputes error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
