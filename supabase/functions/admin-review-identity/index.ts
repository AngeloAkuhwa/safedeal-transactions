import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { logAdminAction, extractRequestMeta } from "../_shared/audit.ts";
import { requirePermission, authErrorResponse } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS",
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
    let ctx;
    try {
      ctx = await requirePermission(
        req,
        req.method === "GET" ? "identity_verification.view" : "identity_verification.approve",
      );
    } catch (err) {
      const resp = authErrorResponse(err, corsHeaders);
      if (resp) return resp;
      throw err;
    }

    if (req.method !== "PATCH" && req.method !== "GET") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }
    const adminClient = ctx.adminClient;
    const adminUserId = ctx.userId;

    // ── GET: Review queue ──
    if (req.method === "GET") {
      const url = new URL(req.url);
      const statusFilter = url.searchParams.get("status") || "pending_review";
      const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
      const perPage = Math.min(50, Math.max(1, parseInt(url.searchParams.get("per_page") || "20", 10)));
      const offset = (page - 1) * perPage;

      const validStatuses = ["pending_review", "verified", "rejected", "more_info_needed"];
      if (!validStatuses.includes(statusFilter)) {
        return jsonResponse({ error: "Invalid status filter" }, 400);
      }

      // Count total
      const { count } = await adminClient
        .from("identity_submissions")
        .select("id", { count: "exact", head: true })
        .eq("status", statusFilter);

      // Fetch submissions with submitter info
      const { data: submissions, error: fetchError } = await adminClient
        .from("identity_submissions")
        .select("id, user_id, status, verification_method, legal_name, date_of_birth, masked_identifier, consent_accepted_at, consent_text_version, submitted_at, reviewed_at, reviewed_by, review_notes, rejected_at, rejection_reason, previous_submission_id, created_at")
        .eq("status", statusFilter)
        .order("submitted_at", { ascending: true })
        .range(offset, offset + perPage - 1);

      if (fetchError) {
        return jsonResponse({ error: fetchError.message }, 500);
      }

      // Enrich with submitter profile data
      const userIds = [...new Set((submissions || []).map((s: any) => s.user_id))];
      let profileMap: Record<string, any> = {};
      let verifMap: Record<string, any> = {};

      if (userIds.length > 0) {
        const [profileRes, verifRes] = await Promise.all([
          adminClient.from("profiles").select("id, full_name, email, phone").in("id", userIds),
          adminClient.from("account_verifications").select("user_id, verification_level").in("user_id", userIds),
        ]);
        for (const p of profileRes.data || []) profileMap[p.id] = p;
        for (const v of verifRes.data || []) verifMap[v.user_id] = v;
      }

      const enriched = (submissions || []).map((s: any) => ({
        ...s,
        submitter: profileMap[s.user_id] || null,
        verification_level: verifMap[s.user_id]?.verification_level || "unverified",
      }));

      return jsonResponse({
        submissions: enriched,
        total: count ?? 0,
        page,
        per_page: perPage,
      });
    }

    // ── PATCH: Approve / Reject / More Info ──
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const submissionId = body.submission_id;
    if (typeof submissionId !== "string") {
      return jsonResponse({ error: "submission_id is required" }, 400);
    }

    const decision = body.decision;
    if (decision !== "approve" && decision !== "reject" && decision !== "more_info_needed") {
      return jsonResponse({ error: "decision must be 'approve', 'reject', or 'more_info_needed'" }, 400);
    }

    // Fetch submission
    const { data: submission } = await adminClient
      .from("identity_submissions")
      .select("id, user_id, status")
      .eq("id", submissionId)
      .single();

    if (!submission) {
      return jsonResponse({ error: "Submission not found" }, 404);
    }

    if (submission.status !== "pending_review") {
      return jsonResponse({ error: "Only pending submissions can be reviewed" }, 400);
    }

    const now = new Date().toISOString();
    const reviewNotes = typeof body.review_notes === "string" ? body.review_notes : null;

    if (decision === "approve") {
      await adminClient
        .from("identity_submissions")
        .update({
          status: "verified",
          reviewed_at: now,
          reviewed_by: adminUserId,
          review_notes: reviewNotes,
        })
        .eq("id", submissionId);

      await adminClient
        .from("account_verifications")
        .update({ identity_verified: true })
        .eq("user_id", submission.user_id);

      const { data: newLevel } = await adminClient.rpc("compute_verification_level", {
        _user_id: submission.user_id,
      });
      if (newLevel) {
        await adminClient
          .from("account_verifications")
          .update({ verification_level: newLevel })
          .eq("user_id", submission.user_id);
      }

      const meta = extractRequestMeta(req);
      await logAdminAction(adminClient, {
        actorId: adminUserId,
        action: "identity_verified",
        targetType: "user",
        targetId: submission.user_id,
        before: { status: submission.status },
        after: { status: "verified", verification_level: newLevel },
        reason: reviewNotes ?? undefined,
        metadata: { submission_id: submissionId, new_level: newLevel },
        mirrorToAuditLogs: true,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });

      return jsonResponse({ success: true, new_level: newLevel });
    }

    if (decision === "reject") {
      const rejectionReason = typeof body.rejection_reason === "string" ? body.rejection_reason : "Submission did not meet verification requirements.";

      await adminClient
        .from("identity_submissions")
        .update({
          status: "rejected",
          reviewed_at: now,
          reviewed_by: adminUserId,
          review_notes: reviewNotes,
          rejected_at: now,
          rejection_reason: rejectionReason,
        })
        .eq("id", submissionId);

      const meta = extractRequestMeta(req);
      await logAdminAction(adminClient, {
        actorId: adminUserId,
        action: "identity_rejected",
        targetType: "user",
        targetId: submission.user_id,
        before: { status: submission.status },
        after: { status: "rejected" },
        reason: rejectionReason,
        metadata: { submission_id: submissionId, review_notes: reviewNotes },
        mirrorToAuditLogs: true,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });

      return jsonResponse({ success: true, status: "rejected" });
    }

    // more_info_needed
    const rejectionReason = typeof body.rejection_reason === "string" ? body.rejection_reason : "Additional information required.";

    await adminClient
      .from("identity_submissions")
      .update({
        status: "more_info_needed",
        reviewed_at: now,
        reviewed_by: adminUserId,
        review_notes: reviewNotes,
        rejection_reason: rejectionReason,
      })
      .eq("id", submissionId);

    const meta = extractRequestMeta(req);
    await logAdminAction(adminClient, {
      actorId: adminUserId,
      action: "identity_more_info",
      targetType: "user",
      targetId: submission.user_id,
      before: { status: submission.status },
      after: { status: "more_info_needed" },
      reason: rejectionReason,
      metadata: { submission_id: submissionId, review_notes: reviewNotes },
      mirrorToAuditLogs: true,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return jsonResponse({ success: true, status: "more_info_needed" });
  } catch (err) {
    console.error("admin-review-identity error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
