import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { enqueueOrchestrationTask } from "../_shared/orchestration.ts";

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
const RESPONDABLE_STATUSES = ["open", "seller_response_pending"];

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

    // ── 3. Parse input ──
    let body: Record<string, unknown> = {};
    try {
      const parsed = await req.json();
      if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
    } catch {
      return jsonResponse({ error: "Invalid request body" }, 400);
    }

    const disputeId = String(body.dispute_id || "").trim();
    if (!disputeId) {
      return jsonResponse({ error: "dispute_id is required" }, 400);
    }

    const action = String(body.action || "submit_response").trim();

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

    // ── 5. Respondable state validation ──
    if (!RESPONDABLE_STATUSES.includes(dispute.status as string)) {
      return jsonResponse({
        error: `Dispute is in '${dispute.status}' status. Only 'open' or 'seller_response_pending' statuses allow actions.`,
      }, 409);
    }

    // ── Route by action ──
    if (action === "edit_response") {
      return await handleEditResponse(adminClient, body, disputeId, dispute, userId);
    }

    if (action === "replace_additional_evidence") {
      return await handleReplaceAdditionalEvidence(adminClient, body, disputeId, dispute, userId);
    }

    // Default: submit_response (includes additional evidence only)
    return await handleSubmitResponse(adminClient, body, disputeId, dispute, transaction, userId);
  } catch (err) {
    console.error("submit-seller-response error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});

// ═══════════════════════════════════════════════
// ACTION: edit_response
// ═══════════════════════════════════════════════
async function handleEditResponse(
  adminClient: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
  disputeId: string,
  dispute: Record<string, unknown>,
  userId: string
) {
  const responseId = String(body.response_id || "").trim();
  const newText = String(body.new_response_text || "").trim();

  if (!responseId) return jsonResponse({ error: "response_id is required" }, 400);
  if (!newText || newText.length < 10) return jsonResponse({ error: "new_response_text must be at least 10 characters" }, 400);
  if (newText.length > 5000) return jsonResponse({ error: "new_response_text must not exceed 5000 characters" }, 400);

  // Fetch all responses to find the latest
  const { data: responses, error: fetchErr } = await adminClient
    .from("dispute_responses")
    .select("id, response_text, response_number")
    .eq("dispute_id", disputeId)
    .eq("responded_by_user_id", userId)
    .order("response_number", { ascending: false });

  if (fetchErr || !responses || responses.length === 0) {
    return jsonResponse({ error: "No responses found to edit" }, 404);
  }

  const latestResponse = responses[0];
  if (latestResponse.id !== responseId) {
    return jsonResponse({ error: "Only the latest response can be edited" }, 403);
  }

  const oldText = latestResponse.response_text as string;

  // Update the response with edit tracking
  const { error: updateErr } = await adminClient
    .from("dispute_responses")
    .update({
      response_text: newText,
      edited_at: new Date().toISOString(),
      edited_by_user_id: userId,
      previous_response_text: oldText,
    })
    .eq("id", responseId);

  if (updateErr) {
    console.error("Edit response error:", updateErr);
    return jsonResponse({ error: "Failed to edit response" }, 500);
  }

  // Canonical audit log (dispute-centric, source of truth)
  await adminClient.from("audit_logs").insert({
    action: "dispute_response_edited",
    actor_user_id: userId,
    transaction_id: dispute.transaction_id as string,
    description: `Seller edited response ${latestResponse.response_number} for dispute ${disputeId}`,
    metadata: {
      dispute_id: disputeId,
      response_id: responseId,
      response_number: latestResponse.response_number,
      old_text: oldText,
      new_text: newText,
    },
  });

  // Summary mirror in transaction events
  await adminClient.from("transaction_events").insert({
    transaction_id: dispute.transaction_id as string,
    event_type: "seller_response_edited",
    actor_user_id: userId,
    actor_role: "seller",
    event_data: {
      dispute_id: disputeId,
      response_number: latestResponse.response_number,
      description: "Seller edited their dispute response",
    },
  });

  return jsonResponse({ success: true, action: "edit_response", response_id: responseId });
}

// ═══════════════════════════════════════════════
// ACTION: replace_additional_evidence
// ═══════════════════════════════════════════════
async function handleReplaceAdditionalEvidence(
  adminClient: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
  disputeId: string,
  dispute: Record<string, unknown>,
  userId: string
) {
  const oldEvidenceId = String(body.old_evidence_id || "").trim();
  const newFileId = String(body.new_file_id || "").trim();

  if (!oldEvidenceId) return jsonResponse({ error: "old_evidence_id is required" }, 400);
  if (!newFileId) return jsonResponse({ error: "new_file_id is required" }, 400);

  // Verify old evidence exists, is active, and is the right type
  const { data: oldEvidence, error: oldErr } = await adminClient
    .from("dispute_evidence")
    .select("id, file_id, evidence_type, is_active")
    .eq("id", oldEvidenceId)
    .eq("dispute_id", disputeId)
    .eq("submitted_by_user_id", userId)
    .single();

  if (oldErr || !oldEvidence) {
    return jsonResponse({ error: "Evidence not found" }, 404);
  }

  if (oldEvidence.evidence_type !== "seller_additional_dispute_evidence") {
    return jsonResponse({ error: "Only additional dispute evidence can be replaced" }, 400);
  }

  if (!oldEvidence.is_active) {
    return jsonResponse({ error: "This evidence has already been replaced" }, 409);
  }

  // Validate new file ownership
  const { data: newFile } = await adminClient
    .from("files")
    .select("id")
    .eq("id", newFileId)
    .eq("uploaded_by_user_id", userId);

  if (!newFile || newFile.length === 0) {
    return jsonResponse({ error: "New file not found or not owned by seller" }, 400);
  }

  // Deactivate old evidence
  const { error: deactivateErr } = await adminClient
    .from("dispute_evidence")
    .update({
      is_active: false,
      replaced_at: new Date().toISOString(),
      replaced_by_file_id: newFileId,
    })
    .eq("id", oldEvidenceId);

  if (deactivateErr) {
    console.error("Deactivate evidence error:", deactivateErr);
    return jsonResponse({ error: "Failed to replace evidence" }, 500);
  }

  // Insert new active evidence
  const { error: insertErr } = await adminClient
    .from("dispute_evidence")
    .insert({
      dispute_id: disputeId,
      submitted_by_user_id: userId,
      submitted_by_role: "seller",
      file_id: newFileId,
      evidence_type: "seller_additional_dispute_evidence",
      is_active: true,
      notes: "Replacement additional dispute evidence",
    });

  if (insertErr) {
    console.error("Insert replacement evidence error:", insertErr);
    return jsonResponse({ error: "Failed to insert replacement evidence" }, 500);
  }

  // Canonical audit log
  await adminClient.from("audit_logs").insert({
    action: "dispute_evidence_replaced",
    actor_user_id: userId,
    transaction_id: dispute.transaction_id as string,
    description: `Seller replaced additional evidence for dispute ${disputeId}`,
    metadata: {
      dispute_id: disputeId,
      old_evidence_id: oldEvidenceId,
      old_file_id: oldEvidence.file_id,
      new_file_id: newFileId,
    },
  });

  // Summary mirror
  await adminClient.from("transaction_events").insert({
    transaction_id: dispute.transaction_id as string,
    event_type: "additional_evidence_uploaded",
    actor_user_id: userId,
    actor_role: "seller",
    event_data: {
      dispute_id: disputeId,
      description: "Seller replaced additional dispute evidence",
      replaced_old_evidence_id: oldEvidenceId,
    },
  });

  return jsonResponse({ success: true, action: "replace_additional_evidence" });
}

// ═══════════════════════════════════════════════
// ACTION: submit_response (default) + additional evidence only
// ═══════════════════════════════════════════════
async function handleSubmitResponse(
  adminClient: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
  disputeId: string,
  dispute: Record<string, unknown>,
  transaction: Record<string, unknown>,
  userId: string
) {
  const isAdditionalEvidenceOnly = body.is_additional_evidence_only === true;
  const responseText = isAdditionalEvidenceOnly ? "" : String(body.response_text || "").trim();
  const evidenceFileIds: string[] = Array.isArray(body.evidence_file_ids)
    ? (body.evidence_file_ids as string[]).map((id) => String(id).trim()).filter(Boolean)
    : [];

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
    if (evidenceFileIds.length !== 1) {
      return jsonResponse({ error: "Exactly 1 evidence file is required for additional evidence upload" }, 400);
    }
  }

  // Count existing responses
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
    // Check existing additional evidence (using dedicated type + is_active)
    const { data: existingAdditionalEvidence } = await adminClient
      .from("dispute_evidence")
      .select("id")
      .eq("dispute_id", disputeId)
      .eq("submitted_by_user_id", userId)
      .eq("submitted_by_role", "seller")
      .eq("evidence_type", "seller_additional_dispute_evidence")
      .eq("is_active", true);

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

    // Insert with dedicated type
    const { error: evidenceError } = await adminClient
      .from("dispute_evidence")
      .insert({
        dispute_id: disputeId,
        submitted_by_user_id: userId,
        submitted_by_role: "seller",
        file_id: fileId,
        evidence_type: "seller_additional_dispute_evidence",
        is_active: true,
        notes: "Additional dispute evidence",
      });

    if (evidenceError) {
      console.error("Insert additional evidence error:", evidenceError);
      return jsonResponse({ error: "Failed to upload additional evidence" }, 500);
    }

    await Promise.allSettled([
      adminClient.from("transaction_events").insert({
        transaction_id: dispute.transaction_id as string,
        event_type: "additional_evidence_uploaded",
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
        transaction_id: dispute.transaction_id as string,
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

  // Validate evidence files
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

  // Insert dispute response
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

  // Attach evidence files
  if (evidenceFileIds.length > 0) {
    const evidenceInserts = evidenceFileIds.map((fileId) => ({
      dispute_id: disputeId,
      submitted_by_user_id: userId,
      submitted_by_role: "seller" as const,
      file_id: fileId,
      evidence_type: "supporting_document" as const,
      is_active: true,
    }));

    const { error: evidenceError } = await adminClient
      .from("dispute_evidence")
      .insert(evidenceInserts);

    if (evidenceError) {
      console.error("Insert dispute evidence error:", evidenceError);
    }
  }

  // Status transition → under_review (only on first response)
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

    // Orchestration: enqueue a review task for admins/agents.
    await enqueueOrchestrationTask(adminClient, {
      type: "dispute_response_review",
      title: `Review seller response for dispute ${disputeId.slice(0, 8)}`,
      description: "Seller submitted their initial response. Review evidence and progress the case.",
      priority: "high",
      queue: "disputes",
      disputeId,
      transactionId: dispute.transaction_id as string,
      sellerId: userId,
      requiredPermissions: ["disputes.view", "disputes.resolve"],
      sourceEventKey: `dispute_response_first:${disputeId}`,
    });
  }

  // Transaction event
  await adminClient.from("transaction_events").insert({
    transaction_id: dispute.transaction_id as string,
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

  // Audit log
  await adminClient.from("audit_logs").insert({
    action: "dispute_response_submitted",
    actor_user_id: userId,
    transaction_id: dispute.transaction_id as string,
    description: `Seller submitted response ${newResponseNumber} of ${MAX_RESPONSES} to dispute ${disputeId} with ${evidenceFileIds.length} evidence file(s)`,
    metadata: {
      dispute_id: disputeId,
      response_number: newResponseNumber,
      evidence_file_ids: evidenceFileIds,
      response_length: responseText.length,
    },
  });

  // Notification to buyer
  const buyerId = transaction.buyer_id as string | null;
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
      related_transaction_id: dispute.transaction_id as string,
    });
  }

  return jsonResponse({ success: true, response_number: newResponseNumber });
}
