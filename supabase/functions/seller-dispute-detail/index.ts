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

// Dispute-relevant transaction event types
const DISPUTE_EVENT_TYPES = [
  "dispute_opened",
  "seller_dispute_response",
  "evidence_uploaded",
  "dispute_resolved",
  "payout_blocked",
  "payout_released",
  "delivery_marked",
  "buyer_confirmed_delivery",
  "payment_captured",
];

const EVENT_LABELS: Record<string, string> = {
  dispute_opened: "Dispute Opened",
  seller_dispute_response: "Seller Responded",
  evidence_uploaded: "Evidence Uploaded",
  dispute_resolved: "Dispute Resolved",
  payout_blocked: "Payout Blocked",
  payout_released: "Payout Released",
  delivery_marked: "Delivery Marked",
  buyer_confirmed_delivery: "Buyer Confirmed Delivery",
  payment_captured: "Payment Captured",
};

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

    const { data: hasRole, error: roleError } = await adminClient.rpc("has_role", {
      _user_id: userId,
      _role: "seller",
    });
    if (roleError || !hasRole) {
      return jsonResponse({ error: "Seller role required" }, 403);
    }

    let body: Record<string, unknown> = {};
    try {
      const parsed = await req.json();
      if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
    } catch {
      // no body
    }

    const disputeId = String(body.dispute_id || "").trim();
    if (!disputeId) {
      return jsonResponse({ error: "dispute_id is required" }, 400);
    }

    // Fetch dispute
    const { data: dispute, error: disputeError } = await adminClient
      .from("disputes")
      .select("id, transaction_id, reason, description, status, opened_at, resolved_at, seller_response_due_at")
      .eq("id", disputeId)
      .single();

    if (disputeError || !dispute) {
      return jsonResponse({ error: "Dispute not found" }, 404);
    }

    // Fetch transaction + seller ownership check
    const { data: transaction, error: txError } = await adminClient
      .from("transactions")
      .select("id, transaction_code, status, money_status, seller_id, buyer_id, created_at")
      .eq("id", dispute.transaction_id)
      .single();

    if (txError || !transaction) {
      return jsonResponse({ error: "Linked transaction not found" }, 500);
    }

    if (transaction.seller_id !== userId) {
      return jsonResponse({ error: "Access denied" }, 403);
    }

    const buyerId = transaction.buyer_id as string | null;

    // Parallel enrichments
    const enrichments = await Promise.allSettled([
      // [0] Item
      adminClient
        .from("transaction_items")
        .select("title, description, quantity, condition_label")
        .eq("transaction_id", transaction.id)
        .limit(1)
        .single(),
      // [1] Pricing
      adminClient
        .from("transaction_pricing")
        .select("buyer_total_amount, currency_code")
        .eq("transaction_id", transaction.id)
        .single(),
      // [2] Buyer profile
      buyerId
        ? adminClient.from("profiles").select("id, full_name, avatar_url").eq("id", buyerId).single()
        : Promise.resolve({ data: null }),
      // [3] Dispute response
      adminClient
        .from("dispute_responses")
        .select("response_text, submitted_at")
        .eq("dispute_id", disputeId)
        .single(),
      // [4] All dispute evidence
      adminClient
        .from("dispute_evidence")
        .select("id, submitted_by_role, evidence_type, file_id, notes, created_at")
        .eq("dispute_id", disputeId)
        .order("created_at", { ascending: true }),
      // [5] Status history timeline
      adminClient
        .from("dispute_status_history")
        .select("old_status, new_status, reason, changed_at")
        .eq("dispute_id", disputeId)
        .order("changed_at", { ascending: true }),
      // [6] Outcome
      adminClient
        .from("dispute_outcomes")
        .select("outcome_type, decision_summary, refund_amount, release_amount, resolved_at, resolved_by_user_id")
        .eq("dispute_id", disputeId)
        .single(),
      // [7] Agreement snapshot
      adminClient
        .from("transaction_agreement_snapshots")
        .select("snapshot_json, locked_at")
        .eq("transaction_id", transaction.id)
        .single(),
      // [8] Delivery tracking
      adminClient
        .from("delivery_tracking_details")
        .select("courier_name, tracking_number, tracking_url, shipped_at, delivered_at")
        .eq("transaction_id", transaction.id)
        .single(),
      // [9] Delivery proof files
      adminClient
        .from("delivery_proof_files")
        .select("id, file_id, proof_type, created_at")
        .eq("transaction_id", transaction.id)
        .order("created_at", { ascending: true }),
      // [10] Payout
      adminClient
        .from("payouts")
        .select("id, amount, currency_code, status, failure_reason")
        .eq("transaction_id", transaction.id)
        .eq("seller_id", userId)
        .limit(1)
        .single(),
      // [11] Escrow state
      adminClient
        .from("escrow_states")
        .select("state, held_amount, frozen_amount, released_amount, refunded_amount")
        .eq("transaction_id", transaction.id)
        .single(),
      // [12] Transaction events (dispute-relevant)
      adminClient
        .from("transaction_events")
        .select("event_type, actor_role, event_data, occurred_at")
        .eq("transaction_id", transaction.id)
        .in("event_type", DISPUTE_EVENT_TYPES)
        .order("occurred_at", { ascending: true }),
    ]);

    function settled<T>(result: PromiseSettledResult<{ data: T; error?: unknown }>): T | null {
      if (result.status === "fulfilled" && result.value && !result.value.error) {
        return result.value.data;
      }
      return null;
    }

    const itemData = settled(enrichments[0] as PromiseSettledResult<{ data: Record<string, unknown> }>);
    const pricingData = settled(enrichments[1] as PromiseSettledResult<{ data: Record<string, unknown> }>);
    const buyerData = settled(enrichments[2] as PromiseSettledResult<{ data: Record<string, unknown> }>);
    const responseData = settled(enrichments[3] as PromiseSettledResult<{ data: Record<string, unknown> }>);
    const evidenceRows = settled(enrichments[4] as PromiseSettledResult<{ data: Array<Record<string, unknown>> }>) ?? [];
    const statusHistoryRows = settled(enrichments[5] as PromiseSettledResult<{ data: Array<Record<string, unknown>> }>) ?? [];
    const outcomeData = settled(enrichments[6] as PromiseSettledResult<{ data: Record<string, unknown> }>);
    const snapshotData = settled(enrichments[7] as PromiseSettledResult<{ data: Record<string, unknown> }>);
    const trackingData = settled(enrichments[8] as PromiseSettledResult<{ data: Record<string, unknown> }>);
    const proofFileRows = settled(enrichments[9] as PromiseSettledResult<{ data: Array<Record<string, unknown>> }>) ?? [];
    const payoutData = settled(enrichments[10] as PromiseSettledResult<{ data: Record<string, unknown> }>);
    const escrowData = settled(enrichments[11] as PromiseSettledResult<{ data: Record<string, unknown> }>);
    const eventRows = settled(enrichments[12] as PromiseSettledResult<{ data: Array<Record<string, unknown>> }>) ?? [];

    // Batch fetch file metadata
    const allFileIds = new Set<string>();
    for (const e of evidenceRows) if (e.file_id) allFileIds.add(e.file_id as string);
    for (const p of proofFileRows) if (p.file_id) allFileIds.add(p.file_id as string);

    const fileMap = new Map<string, { file_url: string; mime_type: string | null; original_file_name: string | null }>();
    if (allFileIds.size > 0) {
      const { data: files } = await adminClient
        .from("files")
        .select("id, file_url, secure_url, mime_type, original_file_name")
        .in("id", [...allFileIds]);
      if (files) {
        for (const f of files) {
          fileMap.set(f.id as string, {
            file_url: (f.secure_url as string) || (f.file_url as string),
            mime_type: f.mime_type as string | null,
            original_file_name: f.original_file_name as string | null,
          });
        }
      }
    }

    function mapEvidence(rows: Array<Record<string, unknown>>, role: string) {
      return rows
        .filter((e) => e.submitted_by_role === role)
        .map((e) => {
          const file = fileMap.get(e.file_id as string);
          return {
            id: e.id,
            type: e.evidence_type,
            file_url: file?.file_url ?? null,
            mime_type: file?.mime_type ?? null,
            file_name: file?.original_file_name ?? null,
            notes: e.notes ?? null,
            created_at: e.created_at,
          };
        });
    }

    const buyerEvidence = mapEvidence(evidenceRows, "buyer");
    const sellerEvidence = mapEvidence(evidenceRows, "seller");

    let responseState: "pending" | "responded" | "not_responded" = "not_responded";
    if (responseData) {
      responseState = "responded";
    } else if (dispute.status === "seller_response_pending" || dispute.status === "open") {
      responseState = "pending";
    }

    const proofFiles = proofFileRows.map((p) => {
      const file = fileMap.get(p.file_id as string);
      return {
        id: p.id,
        file_url: file?.file_url ?? null,
        mime_type: file?.mime_type ?? null,
        file_name: file?.original_file_name ?? null,
        proof_type: p.proof_type,
        created_at: p.created_at,
      };
    });

    // Build enriched timeline: merge status_history + transaction_events
    const timelineEntries: Array<{
      type: "status_change" | "event";
      label: string;
      detail: string | null;
      occurred_at: string;
      status?: string;
    }> = [];

    for (const t of statusHistoryRows) {
      const STATUS_LABELS: Record<string, string> = {
        open: "Dispute Opened",
        seller_response_pending: "Seller Notified",
        under_review: "Review in Progress",
        resolved: "Resolution Issued",
      };
      timelineEntries.push({
        type: "status_change",
        label: STATUS_LABELS[t.new_status as string] ?? (t.new_status as string).replace(/_/g, " "),
        detail: t.reason as string | null,
        occurred_at: t.changed_at as string,
        status: t.new_status as string,
      });
    }

    for (const e of eventRows) {
      timelineEntries.push({
        type: "event",
        label: EVENT_LABELS[e.event_type as string] ?? (e.event_type as string).replace(/_/g, " "),
        detail: (e.event_data as Record<string, unknown>)?.description as string | null ?? null,
        occurred_at: e.occurred_at as string,
      });
    }

    // Sort chronologically
    timelineEntries.sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());

    // Deduplicate: if a status_change and event have same timestamp, keep only status_change
    const deduped: typeof timelineEntries = [];
    const seenTimes = new Set<string>();
    for (const entry of timelineEntries) {
      const key = `${entry.type}-${entry.label}-${entry.occurred_at}`;
      if (!seenTimes.has(key)) {
        seenTimes.add(key);
        deduped.push(entry);
      }
    }

    // Resolver name
    let resolverName: string | null = null;
    if (outcomeData?.resolved_by_user_id) {
      try {
        const { data: resolver } = await adminClient
          .from("profiles")
          .select("full_name")
          .eq("id", outcomeData.resolved_by_user_id as string)
          .single();
        if (resolver) resolverName = resolver.full_name as string;
      } catch {
        // stays null
      }
    }

    // Determine payout blocked state
    const isFrozen = (escrowData?.frozen_amount as number ?? 0) > 0;
    const isPayoutBlocked = isFrozen || payoutData?.status === "failed";
    const blockedAmount = isFrozen
      ? (escrowData?.frozen_amount as number)
      : (payoutData?.status === "failed" ? (payoutData?.amount as number ?? 0) : 0);
    const blockReason = isFrozen
      ? "Funds frozen due to active dispute"
      : payoutData?.status === "failed"
        ? (payoutData?.failure_reason as string ?? "Payout failed")
        : null;

    // Partial release: possible if escrow has both held and frozen amounts, or if outcome allows split
    const partialReleasePossible = outcomeData
      ? (outcomeData.release_amount as number ?? 0) > 0 && (outcomeData.refund_amount as number ?? 0) > 0
      : false;

    const response = {
      dispute: {
        id: dispute.id,
        reason: dispute.reason,
        reason_label: REASON_LABELS[dispute.reason as string] ?? (dispute.reason as string).replace(/_/g, " "),
        description: dispute.description,
        status: dispute.status,
        opened_at: dispute.opened_at,
        resolved_at: dispute.resolved_at,
        seller_response_due_at: dispute.seller_response_due_at,
      },
      transaction: {
        id: transaction.id,
        code: transaction.transaction_code,
        status: transaction.status,
        money_status: transaction.money_status,
        created_at: transaction.created_at,
      },
      item: itemData
        ? {
            title: itemData.title ?? null,
            description: itemData.description ?? null,
            quantity: itemData.quantity ?? 1,
            condition_label: itemData.condition_label ?? null,
          }
        : null,
      pricing: pricingData
        ? {
            buyer_total_amount: pricingData.buyer_total_amount ?? 0,
            currency_code: pricingData.currency_code ?? "NGN",
          }
        : null,
      buyer: buyerData
        ? {
            id: buyerData.id,
            name: buyerData.full_name ?? null,
            avatar_url: buyerData.avatar_url ?? null,
          }
        : null,
      buyer_claim: {
        description: dispute.description,
        evidence: buyerEvidence,
      },
      seller_response: {
        has_response: responseState === "responded",
        response_state: responseState,
        response_text: responseData?.response_text ?? null,
        submitted_at: responseData?.submitted_at ?? null,
        evidence: sellerEvidence,
      },
      agreement_snapshot: snapshotData
        ? { locked_at: snapshotData.locked_at, snapshot_json: snapshotData.snapshot_json }
        : null,
      delivery_proof: {
        tracking: trackingData
          ? {
              courier_name: trackingData.courier_name ?? null,
              tracking_number: trackingData.tracking_number ?? null,
              tracking_url: trackingData.tracking_url ?? null,
              shipped_at: trackingData.shipped_at ?? null,
              delivered_at: trackingData.delivered_at ?? null,
            }
          : null,
        files: proofFiles,
      },
      timeline: deduped,
      outcome: outcomeData
        ? {
            outcome_type: outcomeData.outcome_type,
            decision_summary: outcomeData.decision_summary,
            refund_amount: outcomeData.refund_amount ?? 0,
            release_amount: outcomeData.release_amount ?? 0,
            resolved_at: outcomeData.resolved_at,
            resolved_by_name: resolverName,
          }
        : null,
      payout_impact: {
        is_blocked: isPayoutBlocked,
        blocked_amount: blockedAmount,
        block_reason: blockReason,
        currency_code: payoutData?.currency_code as string ?? pricingData?.currency_code as string ?? "NGN",
        partial_release_possible: partialReleasePossible,
        payout_exists: !!payoutData,
        payout: payoutData
          ? {
              id: payoutData.id,
              amount: payoutData.amount,
              currency_code: payoutData.currency_code,
              status: payoutData.status,
              failure_reason: payoutData.failure_reason ?? null,
            }
          : null,
        escrow: escrowData
          ? {
              state: escrowData.state,
              held_amount: escrowData.held_amount,
              frozen_amount: escrowData.frozen_amount,
              released_amount: escrowData.released_amount,
              refunded_amount: escrowData.refunded_amount,
            }
          : null,
      },
    };

    return jsonResponse(response);
  } catch (err) {
    console.error("seller-dispute-detail error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
