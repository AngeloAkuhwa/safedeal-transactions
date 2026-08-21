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

// UI filter bucket → DB notification type enum mapping (seller scope)
const UI_TYPE_TO_DB_TYPES: Record<string, string[]> = {
  payments: ["payment_update"],
  transaction_updates: ["transaction_update"],
  delivery_updates: ["delivery_update"],
  verification_reminders: ["verification_update"],
  disputes: ["dispute_update"],
  system_alerts: ["security_alert", "system_message"],
  messages: ["direct_message"],
};

const DB_TYPE_TO_UI_TYPE: Record<string, string> = {
  payment_update: "payments",
  transaction_update: "transaction_updates",
  delivery_update: "delivery_updates",
  verification_update: "verification_reminders",
  dispute_update: "disputes",
  security_alert: "system_alerts",
  system_message: "system_alerts",
  direct_message: "transaction_updates",
};

interface TransactionEnrichment {
  id: string;
  code: string;
  status: string;
  money_status: string;
}

function resolveSellerPrimaryAction(
  dbType: string,
  eventType: string | null,
  transactionId: string | null,
  disputeId: string | null,
  _transaction: TransactionEnrichment | null
): { label: string; route: string } | null {
  // Direct message: deeplink to seller-side transaction detail thread
  if (dbType === "direct_message") {
    if (!transactionId) return null;
    return { label: "View Message", route: `/seller/transactions/${transactionId}#messages` };
  }
  if (dbType === "verification_update") {
    if (!transactionId) return null;
    return { label: "View Transaction", route: `/seller/transactions/${transactionId}` };
  }
  if (dbType === "delivery_update") {
    if (!transactionId) return null;
    return { label: "View Delivery", route: `/seller/transactions/${transactionId}` };
  }
  if (dbType === "dispute_update") {
    if (disputeId) {
      const label = eventType === "buyer_responded" ? "View Buyer Response" : "View Dispute";
      return { label, route: `/seller/disputes/${disputeId}` };
    }
    if (transactionId) return { label: "View Transaction", route: `/seller/transactions/${transactionId}` };
    return null;
  }
  if (dbType === "payment_update") {
    if (!transactionId) return null;
    if (eventType === "payout_released") {
      return { label: "View Payout", route: `/seller/payouts` };
    }
    return { label: "View Transaction", route: `/seller/transactions/${transactionId}` };
  }
  if (dbType === "transaction_update") {
    if (!transactionId) return null;
    return { label: "View Details", route: `/seller/transactions/${transactionId}` };
  }
  if (dbType === "security_alert" || dbType === "system_message") {
    if (transactionId) return { label: "View Transaction", route: `/seller/transactions/${transactionId}` };
    return null;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ error: "Not authenticated" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = authHeader.replace("Bearer ", "");
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: userData, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !userData?.user) return jsonResponse({ error: "Invalid session" }, 401);
    const userId = userData.user.id;

    const { data: hasRole, error: roleError } = await adminClient.rpc("has_role", {
      _user_id: userId, _role: "seller",
    });
    if (roleError || !hasRole) return jsonResponse({ error: "Seller role required" }, 403);

    let filters: Record<string, unknown> = {};
    try {
      const body = await req.json();
      if (body && typeof body === "object") filters = body as Record<string, unknown>;
    } catch { /* no body is fine */ }

    const search = String(filters.search || "").trim();
    const typeFilter = String(filters.type || "all");
    const isReadFilter = filters.is_read !== undefined ? Boolean(filters.is_read) : null;
    const page = Math.max(1, parseInt(String(filters.page || "1"), 10) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(String(filters.page_size || "20"), 10) || 20));

    // Summary
    const summary = {
      unread_count: 0,
      verification_deadlines_count: 0,
      active_disputes_count: 0,
      escrow_alerts_count: 0,
    };
    let summaryPartial = false;

    try {
      const [unreadRes, msgRes, disputeRes, payoutRes] = await Promise.allSettled([
        adminClient.from("notifications").select("id", { count: "exact", head: true })
          .eq("user_id", userId).eq("is_read", false),
        adminClient.from("notifications").select("id", { count: "exact", head: true })
          .eq("user_id", userId).eq("is_read", false).eq("type", "direct_message"),
        adminClient.from("notifications").select("id", { count: "exact", head: true })
          .eq("user_id", userId).eq("is_read", false).eq("type", "dispute_update"),
        adminClient.from("notifications").select("id", { count: "exact", head: true })
          .eq("user_id", userId).eq("is_read", false).in("type", ["payment_update", "security_alert"]),
      ]);

      if (unreadRes.status === "fulfilled") summary.unread_count = unreadRes.value.count ?? 0; else summaryPartial = true;
      if (msgRes.status === "fulfilled") summary.verification_deadlines_count = msgRes.value.count ?? 0; else summaryPartial = true;
      if (disputeRes.status === "fulfilled") summary.active_disputes_count = disputeRes.value.count ?? 0; else summaryPartial = true;
      if (payoutRes.status === "fulfilled") summary.escrow_alerts_count = payoutRes.value.count ?? 0; else summaryPartial = true;
    } catch { summaryPartial = true; }

    // Filtered list
    let query = adminClient
      .from("notifications")
      .select("id, type, title, message, is_read, read_at, related_transaction_id, related_dispute_id, created_at, metadata", { count: "exact" })
      .eq("user_id", userId);

    if (typeFilter !== "all" && UI_TYPE_TO_DB_TYPES[typeFilter]) {
      query = query.in("type", UI_TYPE_TO_DB_TYPES[typeFilter]);
    }
    if (isReadFilter !== null) query = query.eq("is_read", isReadFilter);
    if (search) {
      const pattern = `%${search}%`;
      query = query.or(`title.ilike.${pattern},message.ilike.${pattern}`);
    }

    const offset = (page - 1) * pageSize;
    query = query.order("created_at", { ascending: false }).range(offset, offset + pageSize - 1);

    const { data: rows, error: listError, count: totalCount } = await query;
    if (listError) {
      console.error("seller-notifications list error:", listError);
      return jsonResponse({ error: "Failed to load notifications" }, 500);
    }
    if (!rows) return jsonResponse({ error: "Failed to load notifications" }, 500);

    // Enrich
    const txIds = [...new Set(rows.map((r) => r.related_transaction_id).filter(Boolean))] as string[];
    const disputeIds = [...new Set(rows.map((r) => r.related_dispute_id).filter(Boolean))] as string[];
    const txMap = new Map<string, TransactionEnrichment>();
    const disputeMap = new Map<string, { id: string }>();

    const enrichmentPromises: Promise<void>[] = [];
    if (txIds.length > 0) {
      enrichmentPromises.push((async () => {
        try {
          const { data } = await adminClient
            .from("transactions")
            .select("id, transaction_code, status, money_status")
            .in("id", txIds);
          if (data) {
            for (const tx of data) {
              txMap.set(tx.id as string, {
                id: tx.id as string,
                code: tx.transaction_code as string,
                status: tx.status as string,
                money_status: tx.money_status as string,
              });
            }
          }
        } catch { /* non-fatal */ }
      })());
    }
    if (disputeIds.length > 0) {
      enrichmentPromises.push((async () => {
        try {
          const { data } = await adminClient.from("disputes").select("id").in("id", disputeIds);
          if (data) for (const d of data) disputeMap.set(d.id as string, { id: d.id as string });
        } catch { /* non-fatal */ }
      })());
    }
    await Promise.allSettled(enrichmentPromises);

    const items = rows.map((row) => {
      const dbType = row.type as string;
      const uiType = DB_TYPE_TO_UI_TYPE[dbType] || "system_alerts";
      const metadata = (row.metadata || {}) as Record<string, unknown>;
      const eventType = (metadata.event_type as string) || null;
      const txId = row.related_transaction_id as string | null;
      const dId = row.related_dispute_id as string | null;
      const transaction = txId ? txMap.get(txId) || null : null;
      const dispute = dId ? disputeMap.get(dId) || null : null;

      return {
        id: row.id,
        db_type: dbType,
        ui_type: uiType,
        title: row.title,
        message: row.message,
        is_read: row.is_read,
        read_at: row.read_at,
        created_at: row.created_at,
        transaction: transaction
          ? { id: transaction.id, code: transaction.code, status: transaction.status, money_status: transaction.money_status }
          : null,
        dispute: dispute ? { id: dispute.id } : null,
        primary_action: resolveSellerPrimaryAction(dbType, eventType, txId, dId, transaction),
      };
    });

    const total = totalCount ?? 0;
    return jsonResponse({
      summary: { ...summary, ...(summaryPartial ? { summary_partial: true } : {}) },
      items,
      pagination: {
        page,
        page_size: pageSize,
        total_count: total,
        total_pages: Math.ceil(total / pageSize),
      },
    });
  } catch (err) {
    console.error("seller-notifications error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
