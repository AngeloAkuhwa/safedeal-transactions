import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "PATCH, OPTIONS",
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

  if (req.method !== "PATCH") {
    return jsonResponse({ error: "Method not allowed" }, 405);
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
    const adminUserId = userData.user.id;

    // Check admin role
    const { data: hasRole } = await adminClient.rpc("has_role", {
      _user_id: adminUserId,
      _role: "admin",
    });
    if (!hasRole) {
      return jsonResponse({ error: "Admin role required" }, 403);
    }

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
      // Update submission
      await adminClient
        .from("identity_submissions")
        .update({
          status: "verified",
          reviewed_at: now,
          reviewed_by: adminUserId,
          review_notes: reviewNotes,
        })
        .eq("id", submissionId);

      // Set identity_verified = true
      await adminClient
        .from("account_verifications")
        .update({ identity_verified: true })
        .eq("user_id", submission.user_id);

      // Recompute verification level
      const { data: newLevel } = await adminClient.rpc("compute_verification_level", {
        _user_id: submission.user_id,
      });
      if (newLevel) {
        await adminClient
          .from("account_verifications")
          .update({ verification_level: newLevel })
          .eq("user_id", submission.user_id);
      }

      // Audit log
      await adminClient.from("audit_logs").insert({
        action: "identity_verified",
        actor_user_id: adminUserId,
        target_user_id: submission.user_id,
        description: `Identity submission ${submissionId} approved`,
        metadata: { submission_id: submissionId, new_level: newLevel },
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

      await adminClient.from("audit_logs").insert({
        action: "identity_rejected",
        actor_user_id: adminUserId,
        target_user_id: submission.user_id,
        description: `Identity submission ${submissionId} rejected`,
        metadata: { submission_id: submissionId, reason: rejectionReason },
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

    await adminClient.from("audit_logs").insert({
      action: "identity_more_info",
      actor_user_id: adminUserId,
      target_user_id: submission.user_id,
      description: `Identity submission ${submissionId} needs more info`,
      metadata: { submission_id: submissionId },
    });

    return jsonResponse({ success: true, status: "more_info_needed" });
  } catch (err) {
    console.error("admin-review-identity error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
