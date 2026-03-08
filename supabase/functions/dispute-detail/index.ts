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

    // 3. Parse body
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

    // 4. Fetch dispute core
    const { data: dispute, error: disputeError } = await adminClient
      .from("disputes")
      .select("id, transaction_id, reason, description, status, opened_at, resolved_at, seller_response_due_at")
      .eq("id", disputeId)
      .single();

    if (disputeError || !dispute) {
      return jsonResponse({ error: "Dispute not found" }, 404);
    }

    // 5. Fetch transaction + ownership check
    const { data: transaction, error: txError } = await adminClient
      .from("transactions")
      .select("id, transaction_code, status, money_status, seller_id, buyer_id, created_at")
      .eq("id", dispute.transaction_id)
      .single();

    if (txError || !transaction) {
      return jsonResponse({ error: "Linked transaction not found" }, 500);
    }

    if (transaction.buyer_id !== userId) {
      return jsonResponse({ error: "Access denied" }, 403);
    }

    // 6. Enrichments via Promise.allSettled
    const sellerId = transaction.seller_id as string | null;

    const enrichments = await Promise.allSettled([
      // [0] Item summary
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
      // [2] Seller profile
      sellerId
        ? adminClient
            .from("profiles")
            .select("id, full_name, avatar_url")
            .eq("id", sellerId)
            .single()
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
      // [5] Timeline
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
    ]);

    // Helper to extract settled value safely
    function settled<T>(result: PromiseSettledResult<{ data: T; error?: unknown }>): T | null {
      if (result.status === "fulfilled" && result.value && !result.value.error) {
        return result.value.data;
      }
      return null;
    }

    const itemData = settled(enrichments[0] as PromiseSettledResult<{ data: Record<string, unknown> }>);
    const pricingData = settled(enrichments[1] as PromiseSettledResult<{ data: Record<string, unknown> }>);
    const sellerData = settled(enrichments[2] as PromiseSettledResult<{ data: Record<string, unknown> }>);
    const responseData = settled(enrichments[3] as PromiseSettledResult<{ data: Record<string, unknown> }>);
    const evidenceRows = settled(enrichments[4] as PromiseSettledResult<{ data: Array<Record<string, unknown>> }>) ?? [];
    const timelineRows = settled(enrichments[5] as PromiseSettledResult<{ data: Array<Record<string, unknown>> }>) ?? [];
    const outcomeData = settled(enrichments[6] as PromiseSettledResult<{ data: Record<string, unknown> }>);
    const snapshotData = settled(enrichments[7] as PromiseSettledResult<{ data: Record<string, unknown> }>);
    const trackingData = settled(enrichments[8] as PromiseSettledResult<{ data: Record<string, unknown> }>);
    const proofFileRows = settled(enrichments[9] as PromiseSettledResult<{ data: Array<Record<string, unknown>> }>) ?? [];

    // 7. Batch fetch file metadata for evidence + proof files
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

    // 8. Split evidence by role
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

    // 9. Seller response state
    let responseState: "pending" | "responded" | "not_responded" = "not_responded";
    if (responseData) {
      responseState = "responded";
    } else if (dispute.status === "seller_response_pending") {
      responseState = "pending";
    }

    // 10. Map delivery proof files
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

    // 11. Resolver profile if outcome exists
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
        // resolver name stays null
      }
    }

    // 12. Build response
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
      seller: sellerData
        ? {
            id: sellerData.id,
            name: sellerData.full_name ?? null,
            avatar_url: sellerData.avatar_url ?? null,
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
        ? {
            locked_at: snapshotData.locked_at,
            snapshot_json: snapshotData.snapshot_json,
          }
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
      timeline: timelineRows.map((t) => ({
        old_status: t.old_status ?? null,
        new_status: t.new_status,
        reason: t.reason ?? null,
        changed_at: t.changed_at,
      })),
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
    };

    return jsonResponse(response);
  } catch (err) {
    console.error("dispute-detail error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
