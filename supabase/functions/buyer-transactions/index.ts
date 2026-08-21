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

const PROCESSING_STATUSES = [
  "draft",
  "awaiting_buyer",
  "awaiting_payment",
  "payment_secured",
  "seller_preparing_delivery",
];
const IN_TRANSIT_STATUSES = ["seller_dispatched"];
const DELIVERED_STATUSES = ["delivered_awaiting_verification"];
const COMPLETED_STATUSES = ["completed"];
const CANCELLED_STATUSES = ["cancelled", "timed_out"];

function getStatusEnums(tab: string): string[] | null {
  switch (tab) {
    case "processing":
      return PROCESSING_STATUSES;
    case "in_transit":
      return IN_TRANSIT_STATUSES;
    case "delivered":
      return DELIVERED_STATUSES;
    case "completed":
      return COMPLETED_STATUSES;
    case "cancelled":
      return CANCELLED_STATUSES;
    case "disputed":
    case "all":
    default:
      return null;
  }
}

function derivePrimaryAction(
  status: string,
  disputeStatus: string
): string {
  if (status === "awaiting_payment") return "continue_payment";
  if (
    status === "payment_secured" ||
    status === "seller_preparing_delivery" ||
    status === "seller_dispatched"
  )
    return "track_order";
  if (status === "delivered_awaiting_verification") return "verify_item";
  if (status === "disputed" || (disputeStatus && disputeStatus !== "none"))
    return "view_dispute";
  if (status === "completed") return "view_receipt";
  return "view_details";
}

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

    // 3. Parse filters from body
    let filters: Record<string, string> = {};
    try {
      const body = await req.json();
      if (body && typeof body === "object") {
        filters = body as Record<string, string>;
      }
    } catch {
      // no body is fine
    }

    const search = (filters.search || "").trim();
    const statusTab = filters.transaction_status || "all";
    const moneyStatusFilter = filters.money_status || "all";
    const page = Math.max(1, parseInt(filters.page || "1", 10) || 1);
    const pageSize = Math.min(
      50,
      Math.max(1, parseInt(filters.page_size || "8", 10) || 8)
    );
    const sortBy = filters.sort_by || "created_at";
    const sortOrder = filters.sort_order || "desc";

    // PHASE 1: Status counts (partial-failure safe)
    let statusCounts = {
      all: 0,
      processing: 0,
      in_transit: 0,
      delivered: 0,
      completed: 0,
      disputed: 0,
      cancelled: 0,
    };

    try {
      const { data: allTx } = await adminClient
        .from("transactions")
        .select("id, status, dispute_status")
        .eq("buyer_id", userId);

      if (allTx) {
        statusCounts.all = allTx.length;
        for (const tx of allTx) {
          const s = tx.status as string;
          const ds = tx.dispute_status as string;
          if (PROCESSING_STATUSES.includes(s)) statusCounts.processing++;
          else if (IN_TRANSIT_STATUSES.includes(s)) statusCounts.in_transit++;
          else if (DELIVERED_STATUSES.includes(s)) statusCounts.delivered++;
          else if (COMPLETED_STATUSES.includes(s)) statusCounts.completed++;
          else if (CANCELLED_STATUSES.includes(s)) statusCounts.cancelled++;
          if (ds && ds !== "none") statusCounts.disputed++;
        }
      }
    } catch {
      // counts default to zero
    }

    // PHASE 2: Filtered paginated list (FAILURE = real error)

    // Pre-search: if search term provided, find matching transaction IDs from items and seller profiles
    let searchMatchedIds: string[] | null = null;

    if (search) {
      const searchPattern = `%${search}%`;

      // Get all buyer transaction IDs first for scoping
      const { data: buyerTxIds } = await adminClient
        .from("transactions")
        .select("id, seller_id")
        .eq("buyer_id", userId);

      if (buyerTxIds && buyerTxIds.length > 0) {
        const allTxIds = buyerTxIds.map((t) => t.id as string);
        const allSellerIds = [
          ...new Set(
            buyerTxIds
              .map((t) => t.seller_id as string)
              .filter(Boolean)
          ),
        ];

        const searchResults = await Promise.allSettled([
          // Search items by title
          adminClient
            .from("transaction_items")
            .select("transaction_id")
            .in("transaction_id", allTxIds)
            .ilike("title", searchPattern),
          // Search seller profiles by name
          allSellerIds.length > 0
            ? adminClient
                .from("profiles")
                .select("id")
                .in("id", allSellerIds)
                .ilike("full_name", searchPattern)
            : Promise.resolve({ data: [] }),
        ]);

        const matchedFromItems = new Set<string>();
        if (searchResults[0].status === "fulfilled") {
          const itemsData = (searchResults[0].value as { data: Array<Record<string, unknown>> | null }).data;
          if (itemsData) {
            for (const item of itemsData) {
              matchedFromItems.add(item.transaction_id as string);
            }
          }
        }

        const matchedSellerIds = new Set<string>();
        if (searchResults[1].status === "fulfilled") {
          const sellersData = (searchResults[1].value as { data: Array<Record<string, unknown>> | null }).data;
          if (sellersData) {
            for (const s of sellersData) {
              matchedSellerIds.add(s.id as string);
            }
          }
        }

        // Map seller IDs back to transaction IDs
        if (matchedSellerIds.size > 0) {
          for (const tx of buyerTxIds) {
            if (matchedSellerIds.has(tx.seller_id as string)) {
              matchedFromItems.add(tx.id as string);
            }
          }
        }

        // Also match transaction_code directly
        searchMatchedIds = [...matchedFromItems];
      } else {
        searchMatchedIds = [];
      }
    }

    // Build main query
    let query = adminClient
      .from("transactions")
      .select(
        "id, transaction_code, status, money_status, dispute_status, seller_id, created_at, updated_at",
        { count: "exact" }
      )
      .eq("buyer_id", userId);

    // Apply status tab filter
    if (statusTab === "disputed") {
      query = query.neq("dispute_status", "none");
    } else {
      const statusEnums = getStatusEnums(statusTab);
      if (statusEnums) {
        query = query.in("status", statusEnums);
      }
    }

    // Apply money status filter
    if (moneyStatusFilter !== "all") {
      query = query.eq("money_status", moneyStatusFilter);
    }

    // Apply search filter
    if (search) {
      const searchPattern = `%${search}%`;
      if (searchMatchedIds && searchMatchedIds.length > 0) {
        // Match transaction_code OR IDs from item/seller search
        query = query.or(
          `transaction_code.ilike.${searchPattern},id.in.(${searchMatchedIds.join(",")})`
        );
      } else {
        // Only match transaction_code
        query = query.ilike("transaction_code", searchPattern);
      }
    }

    // Sort and paginate
    const ascending = sortOrder === "asc";
    const validSortColumns = ["created_at", "updated_at", "transaction_code"];
    const safeSortBy = validSortColumns.includes(sortBy)
      ? sortBy
      : "created_at";

    const offset = (page - 1) * pageSize;
    query = query
      .order(safeSortBy, { ascending })
      .range(offset, offset + pageSize - 1);

    const { data: txRows, error: txError, count: totalCount } = await query;

    if (txError) {
      console.error("buyer-transactions query error:", txError);
      return jsonResponse(
        { error: "Failed to load transactions" },
        500
      );
    }

    if (!txRows) {
      return jsonResponse(
        { error: "Failed to load transactions" },
        500
      );
    }

    // PHASE 3: Batch enrichment (partial-failure safe)
    const txIds = txRows.map((t) => t.id as string);
    const sellerIds = [
      ...new Set(
        txRows.map((t) => t.seller_id as string).filter(Boolean)
      ),
    ];

    const itemMap = new Map<string, { title: string; description: string | null; quantity: number }>();
    const pricingMap = new Map<string, { amount: number; currency: string }>();
    const sellerMap = new Map<string, string>();

    if (txIds.length > 0) {
      const enrichmentQueries = [
        adminClient
          .from("transaction_items")
          .select("transaction_id, title, description, quantity")
          .in("transaction_id", txIds),
        adminClient
          .from("transaction_pricing")
          .select("transaction_id, buyer_total_amount, currency_code")
          .in("transaction_id", txIds),
      ];

      if (sellerIds.length > 0) {
        enrichmentQueries.push(
          adminClient
            .from("profiles")
            .select("id, full_name")
            .in("id", sellerIds)
        );
      }

      const enrichResults = await Promise.allSettled(enrichmentQueries);

      // Items
      if (enrichResults[0].status === "fulfilled") {
        const d = (enrichResults[0].value as { data: Array<Record<string, unknown>> | null }).data;
        if (d) {
          for (const item of d) {
            itemMap.set(item.transaction_id as string, {
              title: item.title as string,
              description: (item.description as string | null) ?? null,
              quantity: (item.quantity as number) ?? 1,
            });
          }
        }
      }

      // Pricing
      if (enrichResults[1].status === "fulfilled") {
        const d = (enrichResults[1].value as { data: Array<Record<string, unknown>> | null }).data;
        if (d) {
          for (const p of d) {
            pricingMap.set(p.transaction_id as string, {
              amount: (p.buyer_total_amount as number) ?? 0,
              currency: (p.currency_code as string) ?? "NGN",
            });
          }
        }
      }

      // Sellers
      if (enrichResults.length > 2 && enrichResults[2].status === "fulfilled") {
        const d = (enrichResults[2].value as { data: Array<Record<string, unknown>> | null }).data;
        if (d) {
          for (const s of d) {
            sellerMap.set(s.id as string, s.full_name as string);
          }
        }
      }
    }

    // Build response rows
    const transactions = txRows.map((tx) => {
      const status = tx.status as string;
      const disputeStatus = tx.dispute_status as string;
      const item = itemMap.get(tx.id as string);
      const pricing = pricingMap.get(tx.id as string);

      return {
        transaction_id: tx.id as string,
        transaction_code: tx.transaction_code as string,
        item_title: item?.title ?? "Untitled Item",
        item_category: item?.description ?? null,
        item_quantity: item?.quantity ?? 1,
        seller_name: sellerMap.get(tx.seller_id as string) ?? "Unknown Seller",
        amount: pricing?.amount ?? 0,
        currency_code: pricing?.currency ?? "NGN",
        transaction_status: status,
        money_status: tx.money_status as string,
        dispute_status: disputeStatus,
        created_at: tx.created_at as string,
        updated_at: tx.updated_at as string,
        primary_action: derivePrimaryAction(status, disputeStatus),
      };
    });

    const total = totalCount ?? 0;

    return jsonResponse({
      transactions,
      status_counts: statusCounts,
      pagination: {
        page,
        page_size: pageSize,
        total_count: total,
        total_pages: Math.ceil(total / pageSize),
      },
    });
  } catch (err) {
    console.error("buyer-transactions error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
