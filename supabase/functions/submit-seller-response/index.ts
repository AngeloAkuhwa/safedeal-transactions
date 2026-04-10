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

const MAX_RESPONSES = 2;
const MAX_ADDITIONAL_EVIDENCE = 1;

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
    const isAdditionalEvidenceOnly = body.is_additional_evidence_only === true;
    const responseText = isAdditionalEvidenceOnly ? "" : String(body.response_text || "").trim();
    const evidenceFileIds: string[] = Array.isArray(body.evidence_file_ids)
      ? (body.evidence_file_ids as string[]).map((id) => String(id).trim()).filter(Boolean)
      : [];

    if (!disputeId) {
      return jsonResponse({ error: "dispute_id is required" }, 400);
    }

    if (!isAdditionalEvidenceOnly) {
      if (!responseText || responseText.length < 10) {
        return jsonResponse({ error: "response_text must be at least 10 characters" }, 400);
      }
      if (responseText.length > 5000) {
        return jsonResponse({ error: "response_text must not exceed 5000 characters" }, 400);
      }
      if (evidenceFileIds.length > 3) {
        return jsonResponse({ error: "Maximum 3 evidence files allowed per response" }, 400);
      }
    } else {
      // Additional evidence only mode: exactly 1 file required
      if (evidenceFileIds.length !== 1) {
        return jsonResponse({ error: "Exactly 1 evidence file is required for additional evidence upload" }, 400);
      }
    }

    // ── 4. Dispute ownership validation ──
    const { data: dispute, error: disputeError } = await adminClient
      .from("disputes")
      .select("id, transaction_id, status, opened_by_user_id, opened_at")
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
        error: `Dispute is in '${dispute.status}' status and cannot accept responses or evidence`,
      }, 409);
    }

    // ── 6. Count existing responses ──
    const { data: existingResponses, error: countErr } = await adminClient
      .from("dispute_responses")
      .select("id, response_number")
      .eq("dispute_id", disputeId)
      .order("response_number", { ascending: true });

    if (countErr) {
      return jsonResponse({ error: "Failed to check existing responses" }, 500);
    }

    const responseCount = existingResponses?.length ?? 0;

    if (isAdditionalEvidenceOnly) {
      // ── Additional evidence only flow ──
      // Check if seller already submitted additional evidence during dispute
      const { data: existingAdditionalEvidence } = await adminClient
        .from("dispute_evidence")
        .select("id")
        .eq("dispute_id", disputeId)
        .eq("submitted_by_user_id", userId)
        .eq("submitted_by_role", "seller")
        .eq("evidence_type", "supporting_document")
        .gte("created_at", dispute.opened_at as string);

      if ((existingAdditionalEvidence?.length ?? 0) >= MAX_ADDITIONAL_EVIDENCE) {
        return jsonResponse({ error: "Additional dispute evidence already submitted. Maximum 1 allowed." }, 409);
      }

      // Validate file
      const fileId = evidenceFileIds[0];
      const { data: files } = await adminClient
        .from("files")
        .select("id")
        .eq("id", fileId)
        .eq("uploaded_by_user_id", userId);

      if (!files || files.length === 0) {
        return jsonResponse({ error: "Evidence file not found or not owned by seller" }, 400);
      }

      // Insert evidence
      const { error: evidenceError } = await adminClient
        .from("dispute_evidence")
        .insert({
          dispute_id: disputeId,
          submitted_by_user_id: userId,
          submitted_by_role: "seller",
          file_id: fileId,
          evidence_type: "supporting_document",
          notes: "Additional dispute evidence",
        });

      if (evidenceError) {
        console.error("Insert additional evidence error:", evidenceError);
        return jsonResponse({ error: "Failed to upload additional evidence" }, 500);
      }

      // Log events
      await Promise.allSettled([
        adminClient.from("transaction_events").insert({
          transaction_id: dispute.transaction_id,
          event_type: "evidence_uploaded",
          actor_user_id: userId,
          actor_role: "seller",
          event_data: {
            dispute_id: disputeId,
            description: "Seller uploaded additional dispute evidence",
          },
        }),
        adminClient.from("audit_logs").insert({
          action: "dispute_response_submitted",
          actor_user_id: userId,
          transaction_id: dispute.transaction_id,
          description: `Seller uploaded additional dispute evidence for dispute ${disputeId}`,
          metadata: { dispute_id: disputeId, evidence_file_ids: evidenceFileIds, type: "additional_evidence" },
        }),
      ]);

      return jsonResponse({ success: true, type: "additional_evidence" });
    }

    // ── Regular response flow ──
    if (responseCount >= MAX_RESPONSES) {
      return jsonResponse({ error: "Maximum response limit reached. You can submit at most 2 responses per dispute." }, 409);
    }

    const newResponseNumber = responseCount + 1;

    // ── 7. Validate evidence files belong to seller ──
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

    // ── 8. Insert dispute response ──
    const { error: insertError } = await adminClient
      .from("dispute_responses")
      .insert({
        dispute_id: disputeId,
        responded_by_user_id: userId,
        response_text: responseText,
        response_number: newResponseNumber,
      });

    if (insertError) {
      console.error("Insert dispute response error:", insertError);
      return jsonResponse({ error: "Failed to submit response" }, 500);
    }

    // ── 9. Attach evidence files ──
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
      }
    }

    // ── 10. Status transition → under_review (only on first response) ──
    if (newResponseNumber === 1) {
      const oldStatus = dispute.status;
      const { error: statusError } = await adminClient
        .from("disputes")
        .update({ status: "under_review" })
        .eq("id", disputeId);

      if (statusError) {
        console.error("Status update error:", statusError);
      }

      await adminClient.from("dispute_status_history").insert({
        dispute_id: disputeId,
        old_status: oldStatus,
        new_status: "under_review",
        changed_by_user_id: userId,
        reason: "Seller submitted initial response",
      });
    }

    // ── 11. Transaction event logging ──
    await adminClient.from("transaction_events").insert({
      transaction_id: dispute.transaction_id,
      event_type: "seller_dispute_response",
      actor_user_id: userId,
      actor_role: "seller",
      event_data: {
        dispute_id: disputeId,
        response_number: newResponseNumber,
        evidence_count: evidenceFileIds.length,
        description: newResponseNumber === 1
          ? "Seller submitted dispute response"
          : "Seller submitted follow-up response",
      },
    });

    // ── 12. Audit logging ──
    await adminClient.from("audit_logs").insert({
      action: "dispute_response_submitted",
      actor_user_id: userId,
      transaction_id: dispute.transaction_id,
      description: `Seller submitted response ${newResponseNumber} of ${MAX_RESPONSES} to dispute ${disputeId} with ${evidenceFileIds.length} evidence file(s)`,
      metadata: {
        dispute_id: disputeId,
        response_number: newResponseNumber,
        evidence_file_ids: evidenceFileIds,
        response_length: responseText.length,
      },
    });

    // ── 13. Notification to buyer ──
    const buyerId = transaction.buyer_id;
    if (buyerId) {
      const message = newResponseNumber === 1
        ? "The seller has submitted their response to your dispute case. The case is now under review."
        : "The seller has submitted a follow-up response to your dispute case.";

      await adminClient.from("notifications").insert({
        user_id: buyerId,
        type: "dispute_update",
        channel: "in_app",
        title: newResponseNumber === 1
          ? "Seller has responded to your dispute"
          : "Seller submitted a follow-up response",
        message,
        related_dispute_id: disputeId,
        related_transaction_id: dispute.transaction_id,
      });
    }

    return jsonResponse({ success: true, response_number: newResponseNumber });
  } catch (err) {
    console.error("submit-seller-response error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
