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
    // ── 1. Auth ──
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

    // ── 2. Seller role check ──
    const { data: hasRole, error: roleError } = await adminClient.rpc("has_role", {
      _user_id: userId,
      _role: "seller",
    });
    if (roleError || !hasRole) {
      return jsonResponse({ error: "Seller role required" }, 403);
    }

    // ── 3. Parse + validate input ──
    let body: Record<string, unknown> = {};
    try {
      const parsed = await req.json();
      if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
    } catch {
      return jsonResponse({ error: "Invalid request body" }, 400);
    }

    const disputeId = String(body.dispute_id || "").trim();
    const responseText = String(body.response_text || "").trim();
    const evidenceFileIds: string[] = Array.isArray(body.evidence_file_ids)
      ? (body.evidence_file_ids as string[]).map((id) => String(id).trim()).filter(Boolean)
      : [];

    if (!disputeId) {
      return jsonResponse({ error: "dispute_id is required" }, 400);
    }
    if (!responseText || responseText.length < 10) {
      return jsonResponse({ error: "response_text must be at least 10 characters" }, 400);
    }
    if (responseText.length > 5000) {
      return jsonResponse({ error: "response_text must not exceed 5000 characters" }, 400);
    }
    if (evidenceFileIds.length > 3) {
      return jsonResponse({ error: "Maximum 3 evidence files allowed" }, 400);
    }

    // ── 4. Dispute ownership validation ──
    const { data: dispute, error: disputeError } = await adminClient
      .from("disputes")
      .select("id, transaction_id, status, opened_by_user_id")
      .eq("id", disputeId)
      .single();

    if (disputeError || !dispute) {
      return jsonResponse({ error: "Dispute not found" }, 404);
    }

    const { data: transaction, error: txError } = await adminClient
      .from("transactions")
      .select("id, seller_id, buyer_id")
      .eq("id", dispute.transaction_id)
      .single();

    if (txError || !transaction || transaction.seller_id !== userId) {
      return jsonResponse({ error: "Access denied" }, 403);
    }

    // ── 5. Dispute respondable validation ──
    const respondableStatuses = ["open", "seller_response_pending"];
    if (!respondableStatuses.includes(dispute.status as string)) {
      return jsonResponse({
        error: `Dispute is in '${dispute.status}' status and cannot accept a response`,
      }, 409);
    }

    const { data: existingResponse } = await adminClient
      .from("dispute_responses")
      .select("id")
      .eq("dispute_id", disputeId)
      .single();

    if (existingResponse) {
      return jsonResponse({ error: "A response has already been submitted for this dispute" }, 409);
    }

    // ── 6. Validate evidence files belong to seller ──
    if (evidenceFileIds.length > 0) {
      const { data: files, error: filesError } = await adminClient
        .from("files")
        .select("id")
        .in("id", evidenceFileIds)
        .eq("uploaded_by_user_id", userId);

      if (filesError) {
        return jsonResponse({ error: "Failed to validate evidence files" }, 500);
      }

      const validFileIds = new Set((files ?? []).map((f) => f.id));
      const invalidIds = evidenceFileIds.filter((id) => !validFileIds.has(id));
      if (invalidIds.length > 0) {
        return jsonResponse({
          error: `Evidence files not found or not owned by seller: ${invalidIds.join(", ")}`,
        }, 400);
      }
    }

    // ── 7. Insert dispute response ──
    const { error: insertError } = await adminClient
      .from("dispute_responses")
      .insert({
        dispute_id: disputeId,
        responded_by_user_id: userId,
        response_text: responseText,
      });

    if (insertError) {
      console.error("Insert dispute response error:", insertError);
      return jsonResponse({ error: "Failed to submit response" }, 500);
    }

    // ── 8. Attach evidence files ──
    if (evidenceFileIds.length > 0) {
      const evidenceInserts = evidenceFileIds.map((fileId) => ({
        dispute_id: disputeId,
        submitted_by_user_id: userId,
        submitted_by_role: "seller" as const,
        file_id: fileId,
        evidence_type: "supporting_document" as const,
      }));

      const { error: evidenceError } = await adminClient
        .from("dispute_evidence")
        .insert(evidenceInserts);

      if (evidenceError) {
        console.error("Insert dispute evidence error:", evidenceError);
        // Non-fatal — response is already saved
      }
    }

    // ── 9. Status transition → under_review ──
    const oldStatus = dispute.status;
    const { error: statusError } = await adminClient
      .from("disputes")
      .update({ status: "under_review" })
      .eq("id", disputeId);

    if (statusError) {
      console.error("Status update error:", statusError);
    }

    // ── 10. Dispute status history ──
    await adminClient.from("dispute_status_history").insert({
      dispute_id: disputeId,
      old_status: oldStatus,
      new_status: "under_review",
      changed_by_user_id: userId,
      reason: "Seller submitted response",
    });

    // ── 11. Transaction event logging ──
    await adminClient.from("transaction_events").insert({
      transaction_id: dispute.transaction_id,
      event_type: "seller_dispute_response",
      actor_user_id: userId,
      actor_role: "seller",
      event_data: {
        dispute_id: disputeId,
        evidence_count: evidenceFileIds.length,
        description: "Seller submitted dispute response",
      },
    });

    // ── 12. Audit logging ──
    await adminClient.from("audit_logs").insert({
      action: "dispute_response_submitted",
      actor_user_id: userId,
      transaction_id: dispute.transaction_id,
      description: `Seller submitted response to dispute ${disputeId} with ${evidenceFileIds.length} evidence file(s)`,
      metadata: {
        dispute_id: disputeId,
        evidence_file_ids: evidenceFileIds,
        response_length: responseText.length,
      },
    });

    // ── 13. Notification to buyer ──
    const buyerId = transaction.buyer_id;
    if (buyerId) {
      await adminClient.from("notifications").insert({
        user_id: buyerId,
        type: "dispute_update",
        channel: "in_app",
        title: "Seller has responded to your dispute",
        message: "The seller has submitted their response to your dispute case. The case is now under review.",
        related_dispute_id: disputeId,
        related_transaction_id: dispute.transaction_id,
      });
    }

    return jsonResponse({ success: true });
  } catch (err) {
    console.error("submit-seller-response error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
