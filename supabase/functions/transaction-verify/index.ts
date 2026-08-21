import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { enqueueOrchestrationTask } from "../_shared/orchestration.ts";
import {
  evaluateDeliveryConfirmGuard,
  isDeliveryAlreadyDone,
} from "../_shared/delivery-confirm.ts";
import {
  countOpenDisputes,
  isAtOpenDisputeCap,
  isDisputeStillAllowed,
  maxOpenDisputesForLevel,
} from "../_shared/dispute-limits.ts";

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

// ════════════════════════════════════════════
// SHARED TRANSITION HELPER
// ════════════════════════════════════════════

interface TransitionParams {
  admin: ReturnType<typeof createClient>;
  transactionId: string;
  userId: string;
  actorRole: string;
  fromStatus: string;
  toStatus: string;
  fromMoney: string;
  toMoney: string;
  reason: string;
  eventType: string;
  eventData?: Record<string, unknown>;
  additionalUpdates?: Record<string, unknown>;
}

async function transitionTransaction(params: TransitionParams) {
  const {
    admin, transactionId, userId, actorRole,
    fromStatus, toStatus, fromMoney, toMoney,
    reason, eventType, eventData,
    additionalUpdates,
  } = params;

  const now = new Date().toISOString();

  // Atomic update with optimistic locking on both status + money_status
  const updatePayload: Record<string, unknown> = {
    status: toStatus,
    money_status: toMoney,
    ...additionalUpdates,
  };

  const { data: updated, error: updateErr } = await admin
    .from("transactions")
    .update(updatePayload)
    .eq("id", transactionId)
    .eq("status", fromStatus)
    .eq("money_status", fromMoney)
    .select("id")
    .maybeSingle();

  if (updateErr) {
    // DB trigger will raise exception for invalid transitions
    if (updateErr.message?.includes("Invalid transaction status transition") ||
        updateErr.message?.includes("Invalid money status transition")) {
      return { success: false, error: updateErr.message, status: 409 };
    }
    return { success: false, error: updateErr.message, status: 500 };
  }

  if (!updated) {
    // Row not matched: state already changed (idempotency / race)
    return { success: false, alreadyProcessed: true };
  }

  // Parallel history + event writes
  await Promise.all([
    admin.from("transaction_status_history").insert({
      transaction_id: transactionId,
      old_status: fromStatus,
      new_status: toStatus,
      changed_by_user_id: userId,
      changed_at: now,
      reason,
    }),
    admin.from("money_status_history").insert({
      transaction_id: transactionId,
      old_status: fromMoney,
      new_status: toMoney,
      changed_by_user_id: userId,
      changed_at: now,
      reason,
    }),
    admin.from("transaction_events").insert({
      transaction_id: transactionId,
      event_type: eventType,
      actor_user_id: userId,
      actor_role: actorRole,
      event_data: eventData || { action: eventType },
      occurred_at: now,
    }),
  ]);

  return { success: true, now };
}

// ════════════════════════════════════════════
// MAIN HANDLER
// ════════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    const userId = user.id;

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
      case "confirm_delivery":
        return await buyerConfirmDelivery(admin, userId, transactionId);
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
  const { data: tx, error: txErr } = await admin
    .from("transactions")
    .select("*")
    .eq("id", transactionId)
    .single();

  if (txErr || !tx) {
    return jsonResponse({ error: "Transaction not found" }, 404);
  }

  if (tx.buyer_id !== userId) {
    return jsonResponse({ error: "You do not own this transaction" }, 403);
  }

  if (tx.status !== "delivered_awaiting_verification") {
    return jsonResponse({
      error: "Transaction is not in verification state",
      redirect: "/dashboard/transactions",
    }, 409);
  }

  const [itemRes, pricingRes, agreementRes, trackingRes, escrowRes, sellerRes, historyRes] =
    await Promise.all([
      admin
        .from("transaction_items")
        .select("title, description, quantity, condition_label, brand, model")
        .eq("transaction_id", transactionId)
        .single(),
      admin
        .from("transaction_pricing")
        .select("currency_code, item_amount, platform_fee_amount, payment_processing_fee_amount, seller_payout_amount, buyer_total_amount, is_total_service_fee_capped, pricing_model_version")
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
// CONFIRM RECEIPT: buyer side only.
// Phase A: Money does NOT move on buyer confirmation. Funds stay in escrow
// until the seller also confirms, after which the SafeDeal release team
// reviews and releases the payout.
// ════════════════════════════════════════════
async function confirmReceipt(
  admin: ReturnType<typeof createClient>,
  userId: string,
  transactionId: string,
) {
  const { data: tx } = await admin
    .from("transactions")
    .select("*")
    .eq("id", transactionId)
    .single();

  if (!tx) return jsonResponse({ error: "Transaction not found" }, 404);

  // Ownership
  if (tx.buyer_id !== userId) {
    return jsonResponse({ error: "You do not own this transaction" }, 403);
  }

  // Idempotency: buyer already confirmed (regardless of seller / money state)
  if (tx.buyer_confirmed_at) {
    return jsonResponse({ already_confirmed: true, success: true });
  }

  // State guards
  if (tx.status !== "delivered_awaiting_verification") {
    return jsonResponse({ error: "Transaction not in verification state" }, 409);
  }
  if (tx.dispute_status !== "none") {
    return jsonResponse({ error: "Transaction has an active dispute" }, 409);
  }
  if (tx.money_status !== "funds_held_in_escrow") {
    return jsonResponse({ error: "Funds not held in escrow" }, 409);
  }
  if (tx.verification_deadline_at && new Date(tx.verification_deadline_at) < new Date()) {
    return jsonResponse({ error: "Verification window has expired" }, 410);
  }

  // Single status transition: delivered_awaiting_verification → completed.
  // Money status stays funds_held_in_escrow.
  const now = new Date().toISOString();
  const step = await transitionTransaction({
    admin,
    transactionId,
    userId,
    actorRole: "buyer",
    fromStatus: "delivered_awaiting_verification",
    toStatus: "completed",
    fromMoney: "funds_held_in_escrow",
    toMoney: "funds_held_in_escrow",
    reason: "Buyer confirmed receipt: awaiting seller confirmation",
    eventType: "buyer_confirmed_receipt",
    eventData: { action: "confirm_receipt" },
    additionalUpdates: {
      completed_at: now,
      buyer_confirmed_at: now,
    },
  });

  if (!step.success) {
    if (step.alreadyProcessed) {
      return jsonResponse({ already_confirmed: true, success: true });
    }
    return jsonResponse({ error: step.error }, step.status || 500);
  }

  // Side-effects: confirmation audit row + seller notification.
  await Promise.all([
    admin.from("transaction_completion_confirmations").upsert(
      {
        transaction_id: transactionId,
        confirmed_by_role: "buyer",
        confirmed_by_user_id: userId,
        confirmed_at: now,
      },
      { onConflict: "transaction_id,confirmed_by_role", ignoreDuplicates: true },
    ),
    admin.from("notifications").insert({
      user_id: tx.seller_id,
      type: "payment_update",
      channel: "in_app",
      title: "Buyer confirmed receipt",
      message: `The buyer confirmed receipt for transaction ${tx.transaction_code}. Confirm on your end so SafeDeal can review and process the release of your funds.`,
      related_transaction_id: transactionId,
      status: "pending",
    }),
  ]);

  return jsonResponse({
    success: true,
    buyer_confirmed_at: now,
    redirect: "/dashboard/transactions",
  });
}

// ════════════════════════════════════════════
// RAISE DISPUTE: using transitionTransaction
// ════════════════════════════════════════════

// ════════════════════════════════════════════
// BUYER CONFIRM DELIVERY: primary, authenticated path.
// Advances the transaction to delivered_awaiting_verification using the same
// guarded transition as the rider OTP fallback. Money never moves here.
// ════════════════════════════════════════════
async function buyerConfirmDelivery(
  admin: ReturnType<typeof createClient>,
  userId: string,
  transactionId: string,
) {
  const { data: tx } = await admin
    .from("transactions")
    .select("id, buyer_id, seller_id, status, money_status, dispute_status, transaction_code, delivered_at")
    .eq("id", transactionId)
    .maybeSingle();

  if (!tx) return jsonResponse({ error: "Transaction not found" }, 404);
  if (tx.buyer_id !== userId) {
    return jsonResponse({ error: "You do not own this transaction" }, 403);
  }

  // Idempotency: already delivered or terminal.
  if (isDeliveryAlreadyDone(tx.status)) {
    return jsonResponse({
      success: true,
      already_delivered: true,
      message: "This delivery was already confirmed.",
    });
  }

  if (tx.dispute_status && tx.dispute_status !== "none") {
    return jsonResponse({ error: "Transaction has an active dispute", code: "dispute_open" }, 409);
  }

  const guardFailure = evaluateDeliveryConfirmGuard({ status: tx.status, money_status: tx.money_status });
  if (guardFailure) {
    return jsonResponse({ error: guardFailure.message, code: guardFailure.error }, guardFailure.http);
  }

  const now = new Date().toISOString();

  // Walk intermediate states so the DB transition trigger stays satisfied.
  const walk = async (from: string, to: string) => {
    const { data, error } = await admin
      .from("transactions")
      .update({ status: to })
      .eq("id", transactionId)
      .eq("status", from)
      .eq("money_status", "funds_held_in_escrow")
      .select("id")
      .maybeSingle();
    if (error) throw new Error(`Walk failed ${from}→${to}: ${error.message}`);
    if (!data) return false;
    await admin.from("transaction_status_history").insert({
      transaction_id: transactionId,
      old_status: from,
      new_status: to,
      changed_by_user_id: userId,
      changed_at: now,
      reason: "Auto: buyer confirmed delivery in-app",
    });
    return true;
  };

  const { data: terms } = await admin
    .from("transaction_delivery_terms")
    .select("verification_window_hours")
    .eq("transaction_id", transactionId)
    .maybeSingle();
  // FAIL CLOSED (same rule as delivery-token-confirm and update-delivery-status):
  // the lock trigger no longer fabricates delivery terms, so an absent window
  // is an unknown fact, not a 72-hour commitment. Refuse rather than invent a
  // release deadline the parties never agreed to.
  const rawWindow = terms?.verification_window_hours;
  const verificationWindowHours =
    rawWindow != null && Number.isFinite(Number(rawWindow)) && Number(rawWindow) > 0
      ? Number(rawWindow)
      : null;
  if (verificationWindowHours === null) {
    return jsonResponse({
      error:
        "This transaction has no agreed verification window. SafeDeal support must set the delivery terms before delivery can be confirmed.",
      code: "verification_window_unresolved",
    }, 409);
  }

  try {
    if (tx.status === "payment_secured") {
      if (await walk("payment_secured", "seller_preparing_delivery")) {
        await walk("seller_preparing_delivery", "seller_dispatched");
      }
    } else if (tx.status === "seller_preparing_delivery") {
      await walk("seller_preparing_delivery", "seller_dispatched");
    }
  } catch (walkErr) {
    console.error("buyerConfirmDelivery walk error:", walkErr);
    return jsonResponse({ error: walkErr instanceof Error ? walkErr.message : "State transition failed" }, 500);
  }

  const step = await transitionTransaction({
    admin,
    transactionId,
    userId,
    actorRole: "buyer",
    fromStatus: "seller_dispatched",
    toStatus: "delivered_awaiting_verification",
    fromMoney: "funds_held_in_escrow",
    toMoney: "funds_held_in_escrow",
    reason: "Buyer confirmed delivery in-app",
    eventType: "delivered",
    eventData: { source: "buyer_in_app_confirmation" },
    additionalUpdates: {
      delivered_at: now,
      verification_deadline_at: new Date(Date.now() + verificationWindowHours * 60 * 60 * 1000).toISOString(),
    },
  });

  if (!step.success) {
    if (step.alreadyProcessed) {
      return jsonResponse({ success: true, already_delivered: true, message: "This delivery was already confirmed." });
    }
    return jsonResponse({ error: step.error }, step.status || 500);
  }

  await Promise.allSettled([
    admin.from("delivery_confirmations").upsert(
      { transaction_id: transactionId, system_delivery_marked_at: now },
      { onConflict: "transaction_id" },
    ),
    admin.from("delivery_updates").insert({
      transaction_id: transactionId,
      status: "delivered",
      notes: "Confirmed by buyer in-app",
      updated_by_user_id: userId,
    }),
    admin.from("notifications").insert({
      user_id: tx.seller_id,
      type: "delivery_update",
      channel: "in_app",
      title: "Buyer confirmed delivery",
      message: `The buyer confirmed delivery for ${tx.transaction_code}. They now have ${verificationWindowHours}h to inspect the item.`,
      related_transaction_id: transactionId,
      status: "pending",
    }),
  ]);

  return jsonResponse({
    success: true,
    already_delivered: false,
    delivered_at: now,
    verification_window_hours: verificationWindowHours,
    message: "Delivery confirmed.",
  });
}

async function raiseDispute(
  admin: ReturnType<typeof createClient>,
  userId: string,
  transactionId: string,
  body: { reason?: string; description?: string; fileIds?: string[] },
) {
  const { reason, description, fileIds } = body;

  // Payload validation
  if (!reason) {
    return jsonResponse({ error: "Dispute reason is required" }, 400);
  }
  if (!description || description.trim().length < 20) {
    return jsonResponse({ error: "Description must be at least 20 characters" }, 400);
  }

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

  // State guards
  if (tx.status !== "delivered_awaiting_verification") {
    return jsonResponse({ error: "Transaction not in verification state" }, 409);
  }
  if (tx.money_status !== "funds_held_in_escrow") {
    return jsonResponse({ error: "Funds not held in escrow" }, 409);
  }
  if (!escrow || escrow.state !== "held") {
    return jsonResponse({ error: "Escrow not in held state" }, 409);
  }
  // NOTE: no deadline 410 here. There is no automatic release job. Funds only
  // move after manual SafeDeal review. So the buyer keeps dispute recourse
  // until the case is actually reviewed/closed.
  if (!isDisputeStillAllowed(tx)) {
    return jsonResponse({ error: "Dispute is no longer available for this transaction" }, 409);
  }

  // Per-tier cap on simultaneously open disputes (same source as buyer-disputes)
  const { data: verifRow } = await admin
    .from("account_verifications")
    .select("verification_level")
    .eq("user_id", userId)
    .maybeSingle();
  const level = (verifRow?.verification_level as string) || "unverified";

  const { data: buyerTxRows } = await admin
    .from("transactions")
    .select("id")
    .eq("buyer_id", userId);
  const buyerTxIds = (buyerTxRows ?? []).map((t: { id: string }) => t.id);

  let openDisputeCount = 0;
  if (buyerTxIds.length > 0) {
    const { data: openRows } = await admin
      .from("disputes")
      .select("id,status")
      .in("transaction_id", buyerTxIds);
    openDisputeCount = countOpenDisputes(openRows ?? []);
  }

  if (isAtOpenDisputeCap(level, openDisputeCount)) {
    return jsonResponse({
      error: "dispute_limit_reached",
      message:
        `You already have ${openDisputeCount} open dispute(s), the maximum allowed for your verification level (${maxOpenDisputesForLevel(level)}). Resolve an existing dispute or upgrade your verification to open another.`,
      verification_level: level,
      open_disputes: openDisputeCount,
      max_open_disputes: maxOpenDisputesForLevel(level),
    }, 409);
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

  const responseDue = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  // 1. Create dispute first (need the ID)
  const { data: dispute, error: disputeErr } = await admin
    .from("disputes")
    .insert({
      transaction_id: transactionId,
      opened_by_user_id: userId,
      reason: reason,
      description: description.trim(),
      status: "open",
      opened_at: new Date().toISOString(),
      seller_response_due_at: responseDue,
    })
    .select("id")
    .single();

  if (disputeErr || !dispute) {
    console.error("Failed to create dispute:", disputeErr);
    return jsonResponse({ error: "Failed to create dispute" }, 500);
  }

  // 2. Use centralized transition helper
  // DB trigger enforces delivered_awaiting_verification → disputed
  // and funds_held_in_escrow → funds_frozen
  const result = await transitionTransaction({
    admin,
    transactionId,
    userId,
    actorRole: "buyer",
    fromStatus: "delivered_awaiting_verification",
    toStatus: "disputed",
    fromMoney: "funds_held_in_escrow",
    toMoney: "funds_frozen",
    reason: `Dispute opened: ${reason}`,
    eventType: "dispute_opened",
    eventData: { dispute_id: dispute.id, reason },
    additionalUpdates: {
      dispute_status: "open",
    },
  });

  if (!result.success) {
    return jsonResponse({ error: result.error || "State transition failed" }, result.status || 409);
  }

  const now = result.now!;

  // 3. Link evidence files if provided
  if (fileIds && Array.isArray(fileIds) && fileIds.length > 0) {
    if (fileIds.length > 10) {
      return jsonResponse({ error: "Maximum 10 evidence files per dispute" }, 400);
    }

    // Validate ownership
    const { data: ownedFiles, error: filesErr } = await admin
      .from("files")
      .select("id, resource_type, mime_type")
      .in("id", fileIds)
      .eq("uploaded_by_user_id", userId);

    if (filesErr) {
      console.error("File ownership check failed:", filesErr);
      return jsonResponse({ error: "Failed to validate evidence files" }, 500);
    }

    if (!ownedFiles || ownedFiles.length !== fileIds.length) {
      return jsonResponse({ error: "One or more evidence files are invalid or not owned by you" }, 403);
    }

    // Map resource_type to evidence_type
    const evidenceTypeMap: Record<string, string> = {
      image: "buyer_photo",
      video: "buyer_video",
      raw: "supporting_document",
      document: "supporting_document",
    };

    // Insert dispute_evidence rows
    const evidenceRows = ownedFiles.map((f: { id: string; resource_type: string; mime_type: string | null }) => ({
      dispute_id: dispute.id,
      file_id: f.id,
      submitted_by_user_id: userId,
      submitted_by_role: "buyer",
      evidence_type: evidenceTypeMap[f.resource_type] || "other",
    }));

    await Promise.all([
      admin.from("dispute_evidence").insert(evidenceRows),
      admin
        .from("files")
        .update({ is_temporary: false })
        .in("id", fileIds)
        .eq("uploaded_by_user_id", userId),
    ]);
  }

  // 4. Parallel side-effect writes
  const sideEffects: Promise<unknown>[] = [
    // Freeze escrow
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

    // Dispute status history
    admin.from("dispute_status_history").insert({
      dispute_id: dispute.id,
      new_status: "open",
      changed_by_user_id: userId,
      changed_at: now,
      reason: "Buyer opened dispute",
    }),

    // Notify seller
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

    // Notify buyer (confirmation)
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
  ];

  // Evidence upload event
  if (fileIds && fileIds.length > 0) {
    sideEffects.push(
      admin.from("transaction_events").insert({
        transaction_id: transactionId,
        event_type: "dispute_evidence_uploaded",
        actor_user_id: userId,
        actor_role: "buyer",
        event_data: { dispute_id: dispute.id, file_count: fileIds.length },
        occurred_at: now,
      }),
    );
  }

  await Promise.all(sideEffects);

  // Orchestration: enqueue a dispute review task (idempotent per dispute).
  await enqueueOrchestrationTask(admin, {
    type: "dispute_review",
    title: `Review dispute for ${tx.transaction_code}`,
    description: `Buyer opened dispute: reason: ${reason}`,
    priority: "high",
    queue: "disputes",
    disputeId: dispute.id,
    transactionId: transactionId,
    buyerId: userId,
    sellerId: tx.seller_id,
    // An amount is only forwarded when the transaction states its own currency;
    // the queue must never display a figure in an assumed denomination.
    amount: (tx as any).currency_code ? ((tx as any).total_amount ?? null) : null,
    currency: (tx as any).currency_code ?? null,
    requiredPermissions: ["disputes.view", "disputes.resolve"],
    sourceEventKey: `dispute_opened:${dispute.id}`,
  });

  return jsonResponse(
    {
      success: true,
      dispute_id: dispute.id,
      redirect: `/dashboard/disputes/${dispute.id}`,
    },
    201,
  );
}
