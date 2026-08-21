import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  BUYER_AWAITING_DELIVERY_STATUSES,
  BUYER_AWAITING_VERIFICATION_STATUSES,
} from "../_shared/transaction-status.ts";

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
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const token = authHeader.replace("Bearer ", "");
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Verify JWT and get user via service role client
    const { data: userData, error: userError } = await adminClient.auth.getUser(token);

    if (userError || !userData?.user) {
      return jsonResponse({ error: "Invalid session" }, 401);
    }

    const userId = userData.user.id;

    // 2. Check buyer role
    const { data: hasRole, error: roleError } = await adminClient.rpc(
      "has_role",
      { _user_id: userId, _role: "buyer" }
    );

    if (roleError || !hasRole) {
      return jsonResponse({ error: "Buyer role required" }, 403);
    }

    // 3. Fetch data in parallel. Each query independently error-resilient
    const [profileResult, metricsResult, disputeCountResult, notificationsResult, recentTxResult] =
      await Promise.allSettled([
        adminClient
          .from("profiles")
          .select("full_name, avatar_url")
          .eq("id", userId)
          .single(),

        adminClient
          .from("transactions")
          .select("id, status")
          .eq("buyer_id", userId)
          .not("status", "in", '("completed","cancelled","timed_out","expired","refunded","declined")'),

        adminClient
          .from("disputes")
          .select("id", { count: "exact", head: true })
          .eq("opened_by_user_id", userId)
          .neq("status", "resolved"),

        adminClient
          .from("notifications")
          .select("id, title, message, type, related_transaction_id, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(3),

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
      const txRows = metricsResult.value.data as Array<{ id: string; status: string }>;
      metrics.active_purchases = txRows.length;
      metrics.awaiting_delivery = txRows.filter((t) =>
        (BUYER_AWAITING_DELIVERY_STATUSES as string[]).includes(t.status)
      ).length;
      metrics.awaiting_verification = txRows.filter((t) =>
        (BUYER_AWAITING_VERIFICATION_STATUSES as string[]).includes(t.status)
      ).length;
    } else if (metricsResult.status === "rejected") {
      console.error("[buyer-dashboard] metrics query failed:", metricsResult.reason);
    } else if (metricsResult.status === "fulfilled" && metricsResult.value.error) {
      console.error("[buyer-dashboard] metrics query error:", metricsResult.value.error);
    }

    console.info("[buyer-dashboard] metrics", metrics);

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
      recent_notifications = (notificationsResult.value.data as Array<Record<string, unknown>>).map((n) => ({
        id: n.id as string,
        title: n.title as string,
        message: n.message as string,
        type: n.type as string,
        transaction_id: (n.related_transaction_id as string | null),
        created_at: n.created_at as string,
      }));
    }

    // 7. Process recent purchases
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
      const txRows = recentTxResult.value.data as Array<Record<string, unknown>>;
      const txIds = txRows.map((t) => t.id as string);
      const sellerIds = [...new Set(txRows.map((t) => t.seller_id as string).filter(Boolean))];

      if (txIds.length > 0) {
        const batchQueries: Array<Promise<{ data: Array<Record<string, unknown>> | null }>> = [
          adminClient
            .from("transaction_items")
            .select("transaction_id, title")
            .in("transaction_id", txIds),
          adminClient
            .from("transaction_pricing")
            .select("transaction_id, buyer_total_amount, currency_code")
            .in("transaction_id", txIds),
        ];

        if (sellerIds.length > 0) {
          batchQueries.push(
            adminClient
              .from("profiles")
              .select("id, full_name")
              .in("id", sellerIds)
          );
        }

        const batchResults = await Promise.allSettled(batchQueries);

        const itemMap = new Map<string, string>();
        const itemsResult = batchResults[0];
        if (itemsResult.status === "fulfilled" && itemsResult.value.data) {
          for (const item of itemsResult.value.data) {
            itemMap.set(item.transaction_id as string, item.title as string);
          }
        }

        const pricingMap = new Map<string, { amount: number; currency: string }>();
        const pricingResult = batchResults[1];
        if (pricingResult.status === "fulfilled" && pricingResult.value.data) {
          for (const p of pricingResult.value.data) {
            pricingMap.set(p.transaction_id as string, {
              amount: p.buyer_total_amount as number,
              currency: p.currency_code as string,
            });
          }
        }

        const sellerMap = new Map<string, string>();
        if (batchResults.length > 2) {
          const sellersResult = batchResults[2];
          if (sellersResult.status === "fulfilled" && sellersResult.value.data) {
            for (const s of sellersResult.value.data) {
              sellerMap.set(s.id as string, s.full_name as string);
            }
          }
        }

        recent_purchases = txRows.map((tx) => ({
          transaction_id: tx.id as string,
          transaction_code: tx.transaction_code as string,
          item_title: itemMap.get(tx.id as string) ?? "Untitled Item",
          seller_name: sellerMap.get(tx.seller_id as string) ?? "Unknown Seller",
          amount: pricingMap.get(tx.id as string)?.amount ?? 0,
          currency_code: pricingMap.get(tx.id as string)?.currency ?? "NGN",
          transaction_status: tx.status as string,
          money_status: tx.money_status as string,
          created_at: tx.created_at as string,
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
