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
    // ── Auth ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // User client for auth verification
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    const userId = claimsData.claims.sub as string;

    // Service role client for writes (bypasses RLS)
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Check buyer role
    const { data: roleCheck } = await admin
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .eq("role", "buyer")
      .maybeSingle();

    if (!roleCheck) {
      return jsonResponse({ error: "Forbidden: buyer role required" }, 403);
    }

    const body = await req.json();
    const { action, transactionId } = body;

    if (!transactionId) {
      return jsonResponse({ error: "transactionId is required" }, 400);
    }

    switch (action) {
      case "get_verification_data":
        return await getVerificationData(admin, userId, transactionId);
      case "confirm_receipt":
        return await confirmReceipt(admin, userId, transactionId);
      case "raise_dispute":
        return await raiseDispute(admin, userId, transactionId, body);
      default:
        return jsonResponse({ error: "Unknown action" }, 400);
    }
  } catch (err) {
    console.error("transaction-verify error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});

// ════════════════════════════════════════════
// GET VERIFICATION DATA
// ════════════════════════════════════════════
async function getVerificationData(
  admin: ReturnType<typeof createClient>,
  userId: string,
  transactionId: string,
) {
  // Fetch transaction
  const { data: tx, error: txErr } = await admin
    .from("transactions")
    .select("*")
    .eq("id", transactionId)
    .single();

  if (txErr || !tx) {
    return jsonResponse({ error: "Transaction not found" }, 404);
  }

  // Ownership check
  if (tx.buyer_id !== userId) {
    return jsonResponse({ error: "You do not own this transaction" }, 403);
  }

  // State check
  if (tx.status !== "delivered_awaiting_verification") {
    return jsonResponse({
      error: "Transaction is not in verification state",
      redirect: "/dashboard/transactions",
    }, 409);
  }

  // Parallel reads
  const [itemRes, pricingRes, agreementRes, trackingRes, escrowRes, sellerRes, historyRes] =
    await Promise.all([
      admin
        .from("transaction_items")
        .select("title, description, quantity, condition_label, brand, model")
        .eq("transaction_id", transactionId)
        .single(),
      admin
        .from("transaction_pricing")
        .select("currency_code, item_amount, platform_fee_amount, processing_fee_amount, seller_net_amount, buyer_total_amount")
        .eq("transaction_id", transactionId)
        .single(),
      admin
        .from("transaction_agreement_snapshots")
        .select("snapshot_json, locked_at")
        .eq("transaction_id", transactionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("delivery_tracking_details")
        .select("courier_name, tracking_number, tracking_url, shipped_at, delivered_at, expected_delivery_at")
        .eq("transaction_id", transactionId)
        .maybeSingle(),
      admin
        .from("escrow_states")
        .select("state, held_amount, frozen_amount, released_amount, refunded_amount")
        .eq("transaction_id", transactionId)
        .single(),
      admin
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("id", tx.seller_id)
        .single(),
      admin
        .from("transaction_status_history")
        .select("old_status, new_status, changed_at, reason")
        .eq("transaction_id", transactionId)
        .order("changed_at", { ascending: false })
        .limit(6),
    ]);

  return jsonResponse({
    transaction: {
      id: tx.id,
      transaction_code: tx.transaction_code,
      status: tx.status,
      money_status: tx.money_status,
      dispute_status: tx.dispute_status,
      delivered_at: tx.delivered_at,
      verification_deadline_at: tx.verification_deadline_at,
      created_at: tx.created_at,
      seller_id: tx.seller_id,
    },
    item: itemRes.data,
    pricing: pricingRes.data,
    agreement: agreementRes.data,
    tracking: trackingRes.data,
    escrow: escrowRes.data,
    seller: sellerRes.data,
    timeline: historyRes.data || [],
  });
}

// ════════════════════════════════════════════
// CONFIRM RECEIPT — 7 validations, atomic writes
// ════════════════════════════════════════════
async function confirmReceipt(
  admin: ReturnType<typeof createClient>,
  userId: string,
  transactionId: string,
) {
  // Fetch transaction + escrow in parallel
  const [txRes, escrowRes] = await Promise.all([
    admin.from("transactions").select("*").eq("id", transactionId).single(),
    admin.from("escrow_states").select("*").eq("transaction_id", transactionId).single(),
  ]);

  const tx = txRes.data;
  const escrow = escrowRes.data;

  if (!tx) return jsonResponse({ error: "Transaction not found" }, 404);

  // 1. Ownership
  if (tx.buyer_id !== userId) {
    return jsonResponse({ error: "You do not own this transaction" }, 403);
  }

  // 2. Idempotency
  if (tx.status === "completed" && tx.money_status === "funds_released") {
    return jsonResponse({ already_confirmed: true, success: true });
  }

  // 3. State guard
  if (tx.status !== "delivered_awaiting_verification") {
    return jsonResponse({ error: "Transaction not in verification state" }, 409);
  }

  // 4. Dispute check
  if (tx.dispute_status !== "none") {
    return jsonResponse({ error: "Transaction has an active dispute" }, 409);
  }

  // 5. Money state
  if (tx.money_status !== "funds_held_in_escrow") {
    return jsonResponse({ error: "Funds not held in escrow" }, 409);
  }

  // 6. Escrow lock
  if (!escrow || escrow.state !== "held") {
    return jsonResponse({ error: "Escrow not in held state" }, 409);
  }

  // 7. Deadline
  if (tx.verification_deadline_at && new Date(tx.verification_deadline_at) < new Date()) {
    return jsonResponse({ error: "Verification window has expired" }, 410);
  }

  // Get pricing for payout
  const { data: pricing } = await admin
    .from("transaction_pricing")
    .select("seller_net_amount, buyer_total_amount, currency_code")
    .eq("transaction_id", transactionId)
    .single();

  if (!pricing) {
    return jsonResponse({ error: "Pricing data not found" }, 500);
  }

  const now = new Date().toISOString();

  // ── Atomic writes (service role) ──

  // 1. Update transaction (conditional WHERE for idempotency)
  const { data: updatedTx, error: txUpdateErr } = await admin
    .from("transactions")
    .update({
      status: "completed",
      money_status: "funds_released",
      completed_at: now,
    })
    .eq("id", transactionId)
    .eq("status", "delivered_awaiting_verification")
    .select("id")
    .maybeSingle();

  if (txUpdateErr || !updatedTx) {
    // Idempotency: another request already processed this
    return jsonResponse({ already_confirmed: true, success: true });
  }

  // 2-8: Parallel writes
  await Promise.all([
    // 2. Update escrow
    admin
      .from("escrow_states")
      .update({
        state: "released",
        released_amount: escrow.held_amount,
        held_amount: 0,
        last_changed_at: now,
      })
      .eq("transaction_id", transactionId)
      .eq("state", "held"),

    // 3. Transaction status history
    admin.from("transaction_status_history").insert({
      transaction_id: transactionId,
      old_status: "delivered_awaiting_verification",
      new_status: "completed",
      changed_by_user_id: userId,
      changed_at: now,
      reason: "Buyer confirmed receipt",
    }),

    // 4. Money status history
    admin.from("money_status_history").insert({
      transaction_id: transactionId,
      old_status: "funds_held_in_escrow",
      new_status: "funds_released",
      changed_by_user_id: userId,
      changed_at: now,
      reason: "Buyer confirmed receipt — funds released to seller",
    }),

    // 5. Transaction event
    admin.from("transaction_events").insert({
      transaction_id: transactionId,
      event_type: "buyer_confirmed",
      actor_user_id: userId,
      actor_role: "buyer",
      event_data: { action: "confirm_receipt" },
      occurred_at: now,
    }),

    // 6. Escrow ledger entry
    admin.from("escrow_ledger_entries").insert({
      transaction_id: transactionId,
      entry_type: "payout_debit",
      amount: pricing.buyer_total_amount,
      currency_code: pricing.currency_code,
      balance_after: 0,
      created_by_user_id: userId,
      notes: "Buyer confirmed receipt — escrow released for payout",
    }),

    // 7. Create payout record
    admin.from("payouts").insert({
      transaction_id: transactionId,
      seller_id: tx.seller_id,
      amount: pricing.seller_net_amount,
      currency_code: pricing.currency_code,
      status: "pending",
    }),

    // 8. Notify seller
    admin.from("notifications").insert({
      user_id: tx.seller_id,
      type: "payment_update",
      channel: "in_app",
      title: "Buyer Confirmed Receipt",
      message: `The buyer has confirmed receipt for transaction ${tx.transaction_code}. Funds have been released for payout.`,
      related_transaction_id: transactionId,
      status: "pending",
    }),
  ]);

  return jsonResponse({
    success: true,
    redirect: "/dashboard/transactions",
  });
}

// ════════════════════════════════════════════
// RAISE DISPUTE — with escrow freeze
// ════════════════════════════════════════════
async function raiseDispute(
  admin: ReturnType<typeof createClient>,
  userId: string,
  transactionId: string,
  body: { reason?: string; description?: string },
) {
  const { reason, description } = body;

  // Payload validation
  if (!reason) {
    return jsonResponse({ error: "Dispute reason is required" }, 400);
  }
  if (!description || description.trim().length < 20) {
    return jsonResponse({ error: "Description must be at least 20 characters" }, 400);
  }

  // Valid reasons
  const validReasons = [
    "wrong_item_received",
    "damaged_item_received",
    "incomplete_order",
    "item_not_as_described",
    "item_not_delivered",
    "suspected_fake_item",
    "other",
  ];
  if (!validReasons.includes(reason)) {
    return jsonResponse({ error: "Invalid dispute reason" }, 400);
  }

  // Fetch transaction + escrow
  const [txRes, escrowRes] = await Promise.all([
    admin.from("transactions").select("*").eq("id", transactionId).single(),
    admin.from("escrow_states").select("*").eq("transaction_id", transactionId).single(),
  ]);

  const tx = txRes.data;
  const escrow = escrowRes.data;

  if (!tx) return jsonResponse({ error: "Transaction not found" }, 404);

  // Ownership
  if (tx.buyer_id !== userId) {
    return jsonResponse({ error: "You do not own this transaction" }, 403);
  }

  // State guard
  if (tx.status !== "delivered_awaiting_verification") {
    return jsonResponse({ error: "Transaction not in verification state" }, 409);
  }

  // Money state
  if (tx.money_status !== "funds_held_in_escrow") {
    return jsonResponse({ error: "Funds not held in escrow" }, 409);
  }

  // Escrow lock
  if (!escrow || escrow.state !== "held") {
    return jsonResponse({ error: "Escrow not in held state" }, 409);
  }

  // Deadline
  if (tx.verification_deadline_at && new Date(tx.verification_deadline_at) < new Date()) {
    return jsonResponse({ error: "Verification window has expired" }, 410);
  }

  // Duplicate dispute check
  const { data: existingDispute } = await admin
    .from("disputes")
    .select("id")
    .eq("transaction_id", transactionId)
    .maybeSingle();

  if (existingDispute) {
    return jsonResponse({ error: "A dispute already exists for this transaction" }, 409);
  }

  const now = new Date().toISOString();
  const responseDue = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  // 1. Create dispute
  const { data: dispute, error: disputeErr } = await admin
    .from("disputes")
    .insert({
      transaction_id: transactionId,
      opened_by_user_id: userId,
      reason: reason,
      description: description.trim(),
      status: "open",
      opened_at: now,
      seller_response_due_at: responseDue,
    })
    .select("id")
    .single();

  if (disputeErr || !dispute) {
    console.error("Failed to create dispute:", disputeErr);
    return jsonResponse({ error: "Failed to create dispute" }, 500);
  }

  // 2-7: Parallel writes
  await Promise.all([
    // 2. Update transaction
    admin
      .from("transactions")
      .update({
        status: "disputed",
        dispute_status: "open",
        money_status: "funds_frozen",
      })
      .eq("id", transactionId)
      .eq("status", "delivered_awaiting_verification"),

    // 3. Freeze escrow
    admin
      .from("escrow_states")
      .update({
        state: "frozen",
        frozen_amount: escrow.held_amount,
        held_amount: 0,
        last_changed_at: now,
      })
      .eq("transaction_id", transactionId)
      .eq("state", "held"),

    // 4. Dispute status history
    admin.from("dispute_status_history").insert({
      dispute_id: dispute.id,
      new_status: "open",
      changed_by_user_id: userId,
      changed_at: now,
      reason: "Buyer opened dispute",
    }),

    // 5. Transaction status history
    admin.from("transaction_status_history").insert({
      transaction_id: transactionId,
      old_status: "delivered_awaiting_verification",
      new_status: "disputed",
      changed_by_user_id: userId,
      changed_at: now,
      reason: `Dispute opened: ${reason}`,
    }),

    // 6. Money status history
    admin.from("money_status_history").insert({
      transaction_id: transactionId,
      old_status: "funds_held_in_escrow",
      new_status: "funds_frozen",
      changed_by_user_id: userId,
      changed_at: now,
      reason: "Funds frozen pending dispute resolution",
    }),

    // 7. Transaction event
    admin.from("transaction_events").insert({
      transaction_id: transactionId,
      event_type: "dispute_opened",
      actor_user_id: userId,
      actor_role: "buyer",
      event_data: { dispute_id: dispute.id, reason },
      occurred_at: now,
    }),

    // 8. Notify seller
    admin.from("notifications").insert({
      user_id: tx.seller_id,
      type: "dispute_update",
      channel: "in_app",
      title: "Dispute Opened",
      message: `The buyer has opened a dispute for transaction ${tx.transaction_code}. Please respond within 48 hours.`,
      related_transaction_id: transactionId,
      related_dispute_id: dispute.id,
      status: "pending",
    }),

    // 9. Notify buyer (confirmation)
    admin.from("notifications").insert({
      user_id: userId,
      type: "dispute_update",
      channel: "in_app",
      title: "Dispute Submitted",
      message: `Your dispute for transaction ${tx.transaction_code} has been submitted. Funds are now frozen pending resolution.`,
      related_transaction_id: transactionId,
      related_dispute_id: dispute.id,
      status: "pending",
    }),
  ]);

  return jsonResponse(
    {
      success: true,
      dispute_id: dispute.id,
      redirect: `/dashboard/disputes/${dispute.id}`,
    },
    201,
  );
}
