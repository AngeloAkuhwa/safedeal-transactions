import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { computePricing } from "../_shared/pricing.ts";

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

    const body = await req.json().catch(() => ({}));
    const transactionId = body.transaction_id as string;
    if (!transactionId) {
      return jsonResponse({ error: "transaction_id required" }, 400);
    }

    // Fetch transaction
    const { data: tx, error: txError } = await adminClient
      .from("transactions")
      .select("id, transaction_code, status, money_status, share_token, created_at, buyer_id, seller_id, agreement_locked_at, delivery_method, expected_delivery_date, verification_window_hours")
      .eq("id", transactionId)
      .single();

    if (txError || !tx) {
      return jsonResponse({ error: "Transaction not found" }, 404);
    }

    if (tx.seller_id !== userId) {
      return jsonResponse({ error: "Not authorized" }, 403);
    }

    // Fetch related data in parallel
    const [itemRes, pricingRes, buyerProfileRes, participantRes, escrowRes, snapshotRes, statusHistoryRes, deliveryTrackingRes] = await Promise.all([
      adminClient
        .from("transaction_items")
        .select("title, description, category, quantity, condition, brand, model, images")
        .eq("transaction_id", transactionId)
        .maybeSingle(),
      adminClient
        .from("transaction_pricing")
        .select("item_amount, buyer_total_amount, seller_net_amount, platform_fee_amount, payment_processing_fee_amount, service_fee_rate, currency_code")
        .eq("transaction_id", transactionId)
        .maybeSingle(),
      tx.buyer_id
        ? adminClient
            .from("profiles")
            .select("full_name, email, phone, avatar_url")
            .eq("id", tx.buyer_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      adminClient
        .from("transaction_participants")
        .select("display_name, email, phone")
        .eq("transaction_id", transactionId)
        .eq("role", "buyer")
        .maybeSingle(),
      adminClient
        .from("escrow_states")
        .select("state, held_amount, released_amount, refunded_amount, frozen_amount")
        .eq("transaction_id", transactionId)
        .maybeSingle(),
      adminClient
        .from("transaction_agreement_snapshots")
        .select("locked_at, snapshot_json")
        .eq("transaction_id", transactionId)
        .maybeSingle(),
      adminClient
        .from("money_status_history")
        .select("old_status, new_status, changed_at, reason")
        .eq("transaction_id", transactionId)
        .order("changed_at", { ascending: true }),
      adminClient
        .from("delivery_tracking_details")
        .select("courier_name, tracking_number, tracking_url, shipped_at, delivered_at, expected_delivery_at")
        .eq("transaction_id", transactionId)
        .maybeSingle(),
    ]);

    const item = itemRes.data;
    const pricing = pricingRes.data;
    const buyerProfile = buyerProfileRes.data as Record<string, unknown> | null;
    const participant = participantRes.data as Record<string, unknown> | null;
    const escrow = escrowRes.data;
    const snapshot = snapshotRes.data;
    const statusHistory = statusHistoryRes.data ?? [];
    const deliveryTracking = deliveryTrackingRes.data;

    // Buyer info: prefer registered profile, fallback to participant
    const buyer = buyerProfile
      ? {
          name: (buyerProfile.full_name as string) ?? "Unknown",
          email: (buyerProfile.email as string) ?? "",
          phone: (buyerProfile.phone as string) ?? "",
          avatar_url: (buyerProfile.avatar_url as string) ?? null,
          is_verified: !!tx.buyer_id,
        }
      : participant
      ? {
          name: (participant.display_name as string) ?? "Unknown",
          email: (participant.email as string) ?? "",
          phone: (participant.phone as string) ?? "",
          avatar_url: null,
          is_verified: false,
        }
      : { name: "Unknown Buyer", email: "", phone: "", avatar_url: null, is_verified: false };

    // Compute pricing if available
    const computedPricing = pricing
      ? {
          item_amount: pricing.item_amount,
          platform_fee_amount: pricing.platform_fee_amount,
          payment_processing_fee_amount: pricing.payment_processing_fee_amount,
          seller_net_amount: pricing.seller_net_amount,
          buyer_total_amount: pricing.buyer_total_amount,
          service_fee_rate: pricing.service_fee_rate,
          currency_code: pricing.currency_code ?? "NGN",
        }
      : null;

    // Build timeline from transaction status transitions
    const timelineSteps = [
      { key: "draft", label: "Transaction Created", description: "Secure transaction link generated and ready to share with buyer." },
      { key: "awaiting_buyer", label: "Awaiting Buyer Payment", description: "Buyer received transaction link and reviewed agreement." },
      { key: "payment_secured", label: "Payment Secured", description: "Payment received and funds are now held securely. Agreement locked." },
      { key: "seller_preparing_delivery", label: "Seller Preparing Shipment", description: "Prepare the item and update delivery information when shipped." },
      { key: "seller_dispatched", label: "Seller Dispatched", description: "Item has been shipped to the buyer." },
      { key: "delivered_awaiting_verification", label: "Buyer Verification", description: "Buyer is verifying the received item." },
      { key: "completed", label: "Completed", description: "Transaction completed successfully. Funds released to seller." },
    ];

    const statusOrder = timelineSteps.map((s) => s.key);
    const currentIndex = statusOrder.indexOf(tx.status);

    const timeline = timelineSteps.map((step, i) => {
      // Find matching history entry
      const historyEntry = statusHistory.find(
        (h: Record<string, unknown>) => h.new_status === step.key || (step.key === "draft" && i === 0)
      );
      return {
        ...step,
        status: i < currentIndex ? "completed" : i === currentIndex ? "current" : "pending",
        timestamp: historyEntry ? (historyEntry as Record<string, unknown>).changed_at : (i === 0 ? tx.created_at : null),
      };
    });

    // Derive next action
    const nextActionMap: Record<string, { title: string; description: string; checklist: string[] }> = {
      awaiting_buyer: {
        title: "Send Link to Buyer",
        description: "Share the secure transaction link with the buyer.",
        checklist: ["Copy the secure link", "Send to buyer via email/WhatsApp", "Wait for buyer to review and pay"],
      },
      awaiting_payment: {
        title: "Waiting for Payment",
        description: "The buyer is reviewing the transaction.",
        checklist: ["Buyer reviews agreement", "Buyer completes payment", "You'll be notified when paid"],
      },
      payment_secured: {
        title: "Prepare & Ship the Item",
        description: "The buyer has paid and funds are held securely.",
        checklist: ["Package the item securely", "Ship to buyer's address", "Update delivery information with tracking"],
      },
      seller_preparing_delivery: {
        title: "Update Delivery Status",
        description: "Package and ship the item, then update tracking.",
        checklist: ["Package the item securely", "Ship the item", "Enter tracking number"],
      },
      seller_dispatched: {
        title: "Awaiting Delivery",
        description: "Item is in transit to the buyer.",
        checklist: ["Monitor tracking status", "Upload delivery proof when delivered"],
      },
      delivered_awaiting_verification: {
        title: "Buyer Verifying",
        description: "The buyer is checking the received item.",
        checklist: ["Buyer inspects the item", "Buyer confirms or disputes", "Funds released after confirmation"],
      },
      completed: {
        title: "Transaction Complete",
        description: "Funds have been released to your account.",
        checklist: ["Payout processed", "Transaction archived"],
      },
    };

    const nextAction = nextActionMap[tx.status] ?? nextActionMap["awaiting_buyer"];

    // Build share URL
    const shareUrl = tx.share_token ? `/t/${tx.share_token}` : null;

    return jsonResponse({
      transaction: {
        id: tx.id,
        transaction_code: tx.transaction_code,
        status: tx.status,
        money_status: tx.money_status,
        share_token: tx.share_token,
        share_url: shareUrl,
        created_at: tx.created_at,
        agreement_locked_at: tx.agreement_locked_at,
        delivery_method: tx.delivery_method,
        expected_delivery_date: tx.expected_delivery_date,
        verification_window_hours: tx.verification_window_hours,
      },
      buyer,
      item: item
        ? {
            title: item.title,
            description: item.description,
            category: item.category,
            quantity: item.quantity,
            condition: item.condition,
            brand: item.brand,
            model: item.model,
            images: item.images,
          }
        : null,
      pricing: computedPricing,
      escrow: escrow
        ? {
            state: escrow.state,
            held_amount: escrow.held_amount,
            released_amount: escrow.released_amount,
            refunded_amount: escrow.refunded_amount,
            frozen_amount: escrow.frozen_amount,
          }
        : null,
      agreement: snapshot
        ? { locked_at: snapshot.locked_at, snapshot: snapshot.snapshot_json }
        : null,
      delivery_tracking: deliveryTracking ?? null,
      timeline,
      next_action: nextAction,
    });
  } catch (err) {
    console.error("seller-transaction-detail error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
