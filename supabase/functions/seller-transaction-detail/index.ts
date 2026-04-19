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

    // Fetch transaction (only columns that exist on the transactions table)
    const { data: tx, error: txError } = await adminClient
      .from("transactions")
      .select("id, transaction_code, status, money_status, created_at, buyer_id, seller_id, agreement_locked_at")
      .eq("id", transactionId)
      .single();

    if (txError || !tx) {
      console.error("Transaction fetch error:", txError);
      return jsonResponse({ error: "Transaction not found" }, 404);
    }

    if (tx.seller_id !== userId) {
      return jsonResponse({ error: "Not authorized" }, 403);
    }

    // Fetch related data in parallel
    const [itemRes, deliveryTermsRes, linkRes, buyerProfileRes, buyerVerifRes, participantRes, escrowRes, pricingRes, snapshotRes, statusHistoryRes, deliveryTrackingRes, deliveryConfRes, riderTokenRes] = await Promise.all([
      adminClient
        .from("transaction_items")
        .select("title, description, quantity, condition_label, brand, model")
        .eq("transaction_id", transactionId)
        .maybeSingle(),
      adminClient
        .from("transaction_delivery_terms")
        .select("delivery_method, expected_delivery_date, verification_window_hours, delivery_address_line1, delivery_city, delivery_state, delivery_country_code")
        .eq("transaction_id", transactionId)
        .maybeSingle(),
      adminClient
        .from("transaction_links")
        .select("share_token, url")
        .eq("transaction_id", transactionId)
        .eq("is_active", true)
        .maybeSingle(),
      tx.buyer_id
        ? adminClient
            .from("profiles")
            .select("full_name, email, phone, avatar_url")
            .eq("id", tx.buyer_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      tx.buyer_id
        ? adminClient
            .from("account_verifications")
            .select("email_verified, phone_verified, verification_level")
            .eq("user_id", tx.buyer_id)
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
        .from("transaction_pricing")
        .select("item_amount, platform_fee_amount, processing_fee_amount, seller_net_amount, buyer_total_amount, currency_code")
        .eq("transaction_id", transactionId)
        .maybeSingle(),
      adminClient
        .from("transaction_agreement_snapshots")
        .select("locked_at, snapshot_json")
        .eq("transaction_id", transactionId)
        .maybeSingle(),
      adminClient
        .from("transaction_status_history")
        .select("old_status, new_status, changed_at, reason")
        .eq("transaction_id", transactionId)
        .order("changed_at", { ascending: true }),
      adminClient
        .from("delivery_tracking_details")
        .select("courier_name, tracking_number, tracking_url, shipped_at, delivered_at, expected_delivery_at")
        .eq("transaction_id", transactionId)
        .maybeSingle(),
      adminClient
        .from("delivery_confirmations")
        .select("seller_marked_delivered_at, buyer_acknowledged_delivery_at, system_delivery_marked_at")
        .eq("transaction_id", transactionId)
        .maybeSingle(),
      adminClient
        .from("delivery_confirmation_tokens")
        .select("token, expires_at, status, created_at")
        .eq("transaction_id", transactionId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const item = itemRes.data;
    const deliveryTerms = deliveryTermsRes.data;
    const link = linkRes.data;
    const buyerProfile = buyerProfileRes.data as Record<string, unknown> | null;
    const participant = participantRes.data as Record<string, unknown> | null;
    const escrow = escrowRes.data;
    const pricingRow = pricingRes.data;
    const snapshot = snapshotRes.data;
    const statusHistory = statusHistoryRes.data ?? [];
    const deliveryTracking = deliveryTrackingRes.data;
    const deliveryConf = deliveryConfRes.data as Record<string, unknown> | null;
    const riderTokenRow = riderTokenRes.data as Record<string, unknown> | null;

    // Derive completion event (reason-aware)
    let completionEvent: { completed_at: string; previous_status: string | null; reason: string | null; variant: "buyer_confirmed" | "auto_released" | "dispute_resolved" | "unknown" } | null = null;
    if (tx.status === "completed") {
      const completedRow = [...statusHistory].reverse().find((h: Record<string, unknown>) => h.new_status === "completed");
      if (completedRow) {
        const prev = ((completedRow as Record<string, unknown>).old_status as string | null) ?? null;
        let variant: "buyer_confirmed" | "auto_released" | "dispute_resolved" | "unknown" = "unknown";
        if (prev === "delivered_awaiting_verification") {
          if (deliveryConf?.buyer_acknowledged_delivery_at) variant = "buyer_confirmed";
          else if (deliveryConf?.system_delivery_marked_at) variant = "auto_released";
          else variant = "buyer_confirmed";
        } else if (prev === "resolved" || prev === "disputed") {
          variant = "dispute_resolved";
        }
        completionEvent = {
          completed_at: ((completedRow as Record<string, unknown>).changed_at as string) ?? "",
          previous_status: prev,
          reason: ((completedRow as Record<string, unknown>).reason as string | null) ?? null,
          variant,
        };
      }
    }

    const buyerVerif = buyerVerifRes.data as Record<string, unknown> | null;

    // Buyer info: prefer registered profile, fallback to participant
    const buyer = buyerProfile
      ? {
          name: (buyerProfile.full_name as string) ?? "Unknown",
          email: (buyerProfile.email as string) ?? "",
          phone: (buyerProfile.phone as string) ?? "",
          avatar_url: (buyerProfile.avatar_url as string) ?? null,
          is_verified: !!tx.buyer_id,
          email_verified: !!buyerVerif?.email_verified,
          phone_verified: !!buyerVerif?.phone_verified,
          verification_level: (buyerVerif?.verification_level as string) ?? "unverified",
        }
      : participant
      ? {
          name: (participant.display_name as string) ?? "Unknown",
          email: (participant.email as string) ?? "",
          phone: (participant.phone as string) ?? "",
          avatar_url: null,
          is_verified: false,
          email_verified: false,
          phone_verified: false,
          verification_level: "unverified",
        }
      : { name: "Unknown Buyer", email: "", phone: "", avatar_url: null, is_verified: false, email_verified: false, phone_verified: false, verification_level: "unverified" };

    let computedPricing = null;
    if (pricingRow) {
      const rawServiceFee = (pricingRow.platform_fee_amount ?? 0) + (pricingRow.processing_fee_amount ?? 0);
      const serviceFee = Math.min(rawServiceFee, 2000);
      const sellerNet = pricingRow.item_amount - serviceFee;
      computedPricing = {
        item_amount: pricingRow.item_amount,
        service_fee_amount: serviceFee,
        seller_net_amount: sellerNet,
        buyer_total_amount: pricingRow.item_amount + serviceFee,
        currency_code: pricingRow.currency_code ?? "NGN",
      };
    } else if (escrow && escrow.held_amount > 0) {
      const pricingResult = computePricing(escrow.held_amount, "NGN");
      computedPricing = {
        item_amount: pricingResult.item_amount,
        service_fee_amount: pricingResult.service_fee_amount,
        seller_net_amount: pricingResult.item_amount - pricingResult.service_fee_amount,
        buyer_total_amount: pricingResult.total_amount,
        currency_code: "NGN",
      };
    }

    // Build timeline
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
    const shareToken = link?.share_token ?? null;
    const shareUrl = shareToken ? `/t/${shareToken}` : null;

    return jsonResponse({
      transaction: {
        id: tx.id,
        transaction_code: tx.transaction_code,
        status: tx.status,
        money_status: tx.money_status,
        share_token: shareToken,
        share_url: shareUrl,
        created_at: tx.created_at,
        agreement_locked_at: tx.agreement_locked_at,
        delivery_method: deliveryTerms?.delivery_method ?? null,
        expected_delivery_date: deliveryTerms?.expected_delivery_date ?? null,
        verification_window_hours: deliveryTerms?.verification_window_hours ?? null,
      },
      buyer,
      item: item
        ? {
            title: item.title,
            description: item.description,
            quantity: item.quantity,
            condition: item.condition_label,
            brand: item.brand,
            model: item.model,
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
      delivery_terms: deliveryTerms ? {
        delivery_method: deliveryTerms.delivery_method,
        expected_delivery_date: deliveryTerms.expected_delivery_date,
        verification_window_hours: deliveryTerms.verification_window_hours,
        address: [deliveryTerms.delivery_address_line1, deliveryTerms.delivery_city, deliveryTerms.delivery_state, deliveryTerms.delivery_country_code].filter(Boolean).join(", ") || null,
      } : null,
      timeline,
      next_action: nextAction,
      completion_event: completionEvent,
    });
  } catch (err) {
    console.error("seller-transaction-detail error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
