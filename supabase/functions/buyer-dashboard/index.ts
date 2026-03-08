import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    // 1. Authenticate
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Not authenticated" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // User-scoped client for JWT verification
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } =
      await userClient.auth.getClaims(token);

    if (claimsError || !claimsData?.claims) {
      return jsonResponse({ error: "Invalid session" }, 401);
    }

    const userId = claimsData.claims.sub as string;

    // 2. Check buyer role using service-role client
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: hasRole, error: roleError } = await adminClient.rpc(
      "has_role",
      { _user_id: userId, _role: "buyer" }
    );

    if (roleError || !hasRole) {
      return jsonResponse({ error: "Buyer role required" }, 403);
    }

    // 3. Fetch data in parallel — each query independently error-resilient
    const [profileResult, metricsResult, disputeCountResult, notificationsResult, recentTxResult] =
      await Promise.allSettled([
        // Profile
        adminClient
          .from("profiles")
          .select("full_name, avatar_url")
          .eq("id", userId)
          .single(),

        // Transaction metrics — all buyer transactions not completed/cancelled/timed_out
        adminClient
          .from("transactions")
          .select("id, status")
          .eq("buyer_id", userId)
          .not("status", "in", '("completed","cancelled","timed_out")'),

        // Open disputes count
        adminClient
          .from("disputes")
          .select("id", { count: "exact", head: true })
          .eq("opened_by_user_id", userId)
          .neq("status", "resolved"),

        // Recent notifications
        adminClient
          .from("notifications")
          .select("id, title, message, type, related_transaction_id, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(3),

        // Recent 5 transactions for table
        adminClient
          .from("transactions")
          .select("id, transaction_code, status, money_status, created_at, seller_id")
          .eq("buyer_id", userId)
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

    // 4. Process profile
    let buyer = { full_name: "User", avatar_url: null as string | null };
    if (profileResult.status === "fulfilled" && profileResult.value.data) {
      buyer = profileResult.value.data;
    }

    // 5. Process metrics
    let metrics = {
      active_purchases: 0,
      awaiting_delivery: 0,
      awaiting_verification: 0,
      open_disputes: 0,
    };

    if (metricsResult.status === "fulfilled" && metricsResult.value.data) {
      const txRows = metricsResult.value.data;
      metrics.active_purchases = txRows.length;
      metrics.awaiting_delivery = txRows.filter(
        (t: { status: string }) => t.status === "seller_dispatched"
      ).length;
      metrics.awaiting_verification = txRows.filter(
        (t: { status: string }) => t.status === "delivered_awaiting_verification"
      ).length;
    }

    if (disputeCountResult.status === "fulfilled") {
      metrics.open_disputes = disputeCountResult.value.count ?? 0;
    }

    // 6. Process notifications
    let recent_notifications: Array<{
      id: string;
      title: string;
      message: string;
      type: string;
      transaction_id: string | null;
      created_at: string;
    }> = [];

    if (notificationsResult.status === "fulfilled" && notificationsResult.value.data) {
      recent_notifications = notificationsResult.value.data.map((n: any) => ({
        id: n.id,
        title: n.title,
        message: n.message,
        type: n.type,
        transaction_id: n.related_transaction_id,
        created_at: n.created_at,
      }));
    }

    // 7. Process recent purchases — batch fetch items, pricing, seller names
    let recent_purchases: Array<{
      transaction_id: string;
      transaction_code: string;
      item_title: string;
      seller_name: string;
      amount: number;
      currency_code: string;
      transaction_status: string;
      money_status: string;
      created_at: string;
    }> = [];

    if (recentTxResult.status === "fulfilled" && recentTxResult.value.data) {
      const txRows = recentTxResult.value.data;
      const txIds = txRows.map((t: any) => t.id);
      const sellerIds = [...new Set(txRows.map((t: any) => t.seller_id).filter(Boolean))] as string[];

      if (txIds.length > 0) {
        const [itemsResult, pricingResult, sellersResult] = await Promise.allSettled([
          adminClient
            .from("transaction_items")
            .select("transaction_id, title")
            .in("transaction_id", txIds),
          adminClient
            .from("transaction_pricing")
            .select("transaction_id, buyer_total_amount, currency_code")
            .in("transaction_id", txIds),
          sellerIds.length > 0
            ? adminClient
                .from("profiles")
                .select("id, full_name")
                .in("id", sellerIds)
            : Promise.resolve({ data: [] }),
        ]);

        // Build lookup maps
        const itemMap = new Map<string, string>();
        if (itemsResult.status === "fulfilled" && itemsResult.value.data) {
          for (const item of itemsResult.value.data) {
            itemMap.set(item.transaction_id, item.title);
          }
        }

        const pricingMap = new Map<string, { amount: number; currency: string }>();
        if (pricingResult.status === "fulfilled" && pricingResult.value.data) {
          for (const p of pricingResult.value.data) {
            pricingMap.set(p.transaction_id, {
              amount: p.buyer_total_amount,
              currency: p.currency_code,
            });
          }
        }

        const sellerMap = new Map<string, string>();
        if (sellersResult.status === "fulfilled" && (sellersResult.value as any).data) {
          for (const s of (sellersResult.value as any).data) {
            sellerMap.set(s.id, s.full_name);
          }
        }

        recent_purchases = txRows.map((tx: any) => ({
          transaction_id: tx.id,
          transaction_code: tx.transaction_code,
          item_title: itemMap.get(tx.id) ?? "Untitled Item",
          seller_name: sellerMap.get(tx.seller_id) ?? "Unknown Seller",
          amount: pricingMap.get(tx.id)?.amount ?? 0,
          currency_code: pricingMap.get(tx.id)?.currency ?? "NGN",
          transaction_status: tx.status,
          money_status: tx.money_status,
          created_at: tx.created_at,
        }));
      }
    }

    return jsonResponse({
      buyer,
      metrics,
      recent_notifications,
      recent_purchases,
    });
  } catch (err) {
    console.error("buyer-dashboard error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
