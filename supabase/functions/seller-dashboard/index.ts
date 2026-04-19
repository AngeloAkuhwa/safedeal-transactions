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
    const { data: hasRole, error: roleError } = await adminClient.rpc("has_role", {
      _user_id: userId,
      _role: "seller",
    });
    if (roleError || !hasRole) {
      return jsonResponse({ error: "Seller role required" }, 403);
    }

    // Parallel data fetch
    const [
      profileResult,
      allTxResult,
      recentTxResult,
      payoutsResult,
    ] = await Promise.allSettled([
      adminClient
        .from("profiles")
        .select("full_name, avatar_url, store_slug, created_at")
        .eq("id", userId)
        .single(),

      adminClient
        .from("transactions")
        .select("id, status, money_status")
        .eq("seller_id", userId),

      adminClient
        .from("transactions")
        .select("id, transaction_code, status, money_status, created_at, buyer_id")
        .eq("seller_id", userId)
        .order("created_at", { ascending: false })
        .limit(6),

      adminClient
        .from("payouts")
        .select("id, amount, status, currency_code")
        .eq("seller_id", userId),
    ]);

    // Profile
    let seller: {
      full_name: string;
      avatar_url: string | null;
      store_slug: string | null;
      created_at: string | null;
      verification_level: string;
    } = { full_name: "User", avatar_url: null, store_slug: null, created_at: null, verification_level: "unverified" };
    if (profileResult.status === "fulfilled" && profileResult.value.data) {
      const p = profileResult.value.data as Record<string, unknown>;
      seller.full_name = (p.full_name as string) || "User";
      seller.avatar_url = (p.avatar_url as string) || null;
      seller.store_slug = (p.store_slug as string) || null;
      seller.created_at = (p.created_at as string) || null;
    }

    // Fetch verification level
    const { data: verData } = await adminClient
      .from("account_verifications")
      .select("verification_level")
      .eq("user_id", userId)
      .single();
    if (verData) {
      seller.verification_level = (verData as Record<string, unknown>).verification_level as string || "unverified";
    }

    // Metrics from all transactions
    let transactionsCreatedCount = 0;
    let awaitingPaymentTxIds: string[] = [];
    let fundsHeldTxIds: string[] = [];
    let fundsReleasingTxIds: string[] = [];
    let fulfillmentNeededTxIds: string[] = [];
    let dispatchedTxIds: string[] = [];
    let buyerVerificationTxIds: string[] = [];

    if (allTxResult.status === "fulfilled" && allTxResult.value.data) {
      const txRows = allTxResult.value.data as Array<{ id: string; status: string; money_status: string }>;
      transactionsCreatedCount = txRows.length;

      for (const tx of txRows) {
        if (["awaiting_buyer", "awaiting_payment"].includes(tx.status)) {
          awaitingPaymentTxIds.push(tx.id);
        }
        if (tx.money_status === "funds_held_in_escrow") {
          fundsHeldTxIds.push(tx.id);
        }
        if (tx.money_status === "funds_releasing") {
          fundsReleasingTxIds.push(tx.id);
        }
        // Fulfillment action needed: seller needs to prepare/dispatch
        if (["payment_secured", "seller_preparing_delivery"].includes(tx.status)) {
          fulfillmentNeededTxIds.push(tx.id);
        }
        // Dispatched: may need delivery proof
        if (tx.status === "seller_dispatched") {
          dispatchedTxIds.push(tx.id);
        }
        if (tx.status === "delivered_awaiting_verification") {
          buyerVerificationTxIds.push(tx.id);
        }
      }
    }

    // Check which dispatched transactions are missing delivery proof
    let deliveryProofMissingTxIds: string[] = [];
    if (dispatchedTxIds.length > 0) {
      const { data: proofData } = await adminClient
        .from("delivery_proof_files")
        .select("transaction_id")
        .in("transaction_id", dispatchedTxIds);

      const txIdsWithProof = new Set(
        (proofData ?? []).map((p: Record<string, unknown>) => p.transaction_id as string)
      );
      deliveryProofMissingTxIds = dispatchedTxIds.filter((id) => !txIdsWithProof.has(id));
    }

    // Get amounts for metrics
    let awaitingBuyerPaymentAmount = 0;
    let fundsHeldInEscrowAmount = 0;
    let fundsPendingReleaseAmount = 0;
    let payoutsCompletedAmount = 0;

    const amountTxIds = [
      ...new Set([...awaitingPaymentTxIds, ...fundsHeldTxIds, ...fundsReleasingTxIds]),
    ];

    if (amountTxIds.length > 0) {
      const { data: pricingData } = await adminClient
        .from("transaction_pricing")
        .select("transaction_id, seller_net_amount, buyer_total_amount, currency_code")
        .in("transaction_id", amountTxIds);

      if (pricingData) {
        const pricingMap = new Map(
          pricingData.map((p: Record<string, unknown>) => [
            p.transaction_id as string,
            {
              sellerNet: (p.seller_net_amount as number) ?? 0,
              buyerTotal: (p.buyer_total_amount as number) ?? 0,
            },
          ])
        );

        for (const id of awaitingPaymentTxIds) {
          awaitingBuyerPaymentAmount += pricingMap.get(id)?.buyerTotal ?? 0;
        }
        for (const id of fundsHeldTxIds) {
          fundsHeldInEscrowAmount += pricingMap.get(id)?.sellerNet ?? 0;
        }
        for (const id of fundsReleasingTxIds) {
          fundsPendingReleaseAmount += pricingMap.get(id)?.sellerNet ?? 0;
        }
      }
    }

    // Payouts completed
    if (payoutsResult.status === "fulfilled" && payoutsResult.value.data) {
      for (const p of payoutsResult.value.data as Array<{ amount: number; status: string }>) {
        if (p.status === "completed") {
          payoutsCompletedAmount += p.amount;
        }
      }
    }

    // Alerts
    const alerts: Array<{
      type: string;
      count?: number;
      amount?: number;
      currency_code?: string;
      title: string;
      message: string;
      action_label: string;
      action_url: string;
    }> = [];

    if (fulfillmentNeededTxIds.length > 0) {
      alerts.push({
        type: "fulfillment_action_needed",
        count: fulfillmentNeededTxIds.length,
        title: `${fulfillmentNeededTxIds.length} order${fulfillmentNeededTxIds.length > 1 ? "s" : ""} need fulfillment`,
        message: "Payment secured — prepare and dispatch the item to proceed",
        action_label: "View Orders",
        action_url: "/seller/transactions?filter=fulfillment-needed",
      });
    }

    if (deliveryProofMissingTxIds.length > 0) {
      alerts.push({
        type: "delivery_proof_needed",
        count: deliveryProofMissingTxIds.length,
        title: `${deliveryProofMissingTxIds.length} dispatched order${deliveryProofMissingTxIds.length > 1 ? "s" : ""} missing delivery proof`,
        message: "Upload delivery confirmation to proceed with fund release",
        action_label: "Upload Proof",
        action_url: "/seller/transactions?filter=delivery-proof-needed",
      });
    }

    if (buyerVerificationTxIds.length > 0) {
      alerts.push({
        type: "buyer_verification_active",
        count: buyerVerificationTxIds.length,
        title: `${buyerVerificationTxIds.length} buyer verification window${buyerVerificationTxIds.length > 1 ? "s" : ""} active`,
        message: "Buyer is reviewing the received item before funds are released",
        action_label: "Track",
        action_url: "/seller/transactions?filter=awaiting-buyer-verification",
      });
    }

    if (fundsPendingReleaseAmount > 0) {
      alerts.push({
        type: "payout_releasing",
        amount: fundsPendingReleaseAmount,
        currency_code: "NGN",
        title: "Payout releasing soon",
        message: `₦${fundsPendingReleaseAmount.toLocaleString()} will be released to your account`,
        action_label: "Details",
        action_url: "/seller/payouts",
      });
    }

    // Recent activity
    let recentActivity: Array<{
      transaction_id: string;
      transaction_code: string;
      buyer_name: string;
      buyer_email: string;
      item_title: string;
      amount: number;
      currency_code: string;
      transaction_status: string;
      money_status: string;
      created_at: string;
    }> = [];

    if (recentTxResult.status === "fulfilled" && recentTxResult.value.data) {
      const txRows = recentTxResult.value.data as Array<Record<string, unknown>>;
      const txIds = txRows.map((t) => t.id as string);
      const buyerIds = [...new Set(txRows.map((t) => t.buyer_id as string).filter(Boolean))];

      if (txIds.length > 0) {
        const batchQueries = [
          adminClient.from("transaction_items").select("transaction_id, title").in("transaction_id", txIds),
          adminClient.from("transaction_pricing").select("transaction_id, buyer_total_amount, currency_code").in("transaction_id", txIds),
          adminClient.from("delivery_confirmation_tokens").select("transaction_id").eq("status", "active").in("transaction_id", txIds),
        ];
        if (buyerIds.length > 0) {
          batchQueries.push(
            adminClient.from("profiles").select("id, full_name, email").in("id", buyerIds) as any
          );
        }

        const batchResults = await Promise.allSettled(batchQueries);

        const itemMap = new Map<string, string>();
        if (batchResults[0].status === "fulfilled" && batchResults[0].value.data) {
          for (const item of batchResults[0].value.data as Array<Record<string, unknown>>) {
            itemMap.set(item.transaction_id as string, item.title as string);
          }
        }

        const pricingMap = new Map<string, { amount: number; currency: string }>();
        if (batchResults[1].status === "fulfilled" && batchResults[1].value.data) {
          for (const p of batchResults[1].value.data as Array<Record<string, unknown>>) {
            pricingMap.set(p.transaction_id as string, {
              amount: p.buyer_total_amount as number,
              currency: p.currency_code as string,
            });
          }
        }

        const activeTokenSet = new Set<string>();
        if (batchResults[2].status === "fulfilled" && batchResults[2].value.data) {
          for (const r of batchResults[2].value.data as Array<Record<string, unknown>>) {
            activeTokenSet.add(r.transaction_id as string);
          }
        }

        const buyerMap = new Map<string, { name: string; email: string }>();
        if (batchResults.length > 3 && batchResults[3].status === "fulfilled" && batchResults[3].value.data) {
          for (const b of batchResults[3].value.data as Array<Record<string, unknown>>) {
            buyerMap.set(b.id as string, { name: b.full_name as string, email: b.email as string });
          }
        }

        recentActivity = txRows.map((tx) => ({
          transaction_id: tx.id as string,
          transaction_code: tx.transaction_code as string,
          buyer_name: buyerMap.get(tx.buyer_id as string)?.name ?? "Unknown Buyer",
          buyer_email: buyerMap.get(tx.buyer_id as string)?.email ?? "",
          item_title: itemMap.get(tx.id as string) ?? "Untitled Item",
          amount: pricingMap.get(tx.id as string)?.amount ?? 0,
          currency_code: pricingMap.get(tx.id as string)?.currency ?? "NGN",
          transaction_status: tx.status as string,
          money_status: tx.money_status as string,
          created_at: tx.created_at as string,
          has_active_rider_token: activeTokenSet.has(tx.id as string),
        }));
      }
    }

    // Draft count
    let draftCount = 0;
    if (allTxResult.status === "fulfilled" && allTxResult.value.data) {
      draftCount = (allTxResult.value.data as Array<{ status: string }>).filter(
        (t) => t.status === "draft"
      ).length;
    }

    return jsonResponse({
      seller,
      alerts,
      metrics: {
        transactions_created_count: transactionsCreatedCount,
        awaiting_buyer_payment_amount: awaitingBuyerPaymentAmount,
        funds_held_in_escrow_amount: fundsHeldInEscrowAmount,
        funds_pending_release_amount: fundsPendingReleaseAmount,
        payouts_completed_amount: payoutsCompletedAmount,
      },
      recent_activity: recentActivity,
      quick_actions: {
        draft_count: draftCount,
      },
    });
  } catch (err) {
    console.error("seller-dashboard error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
