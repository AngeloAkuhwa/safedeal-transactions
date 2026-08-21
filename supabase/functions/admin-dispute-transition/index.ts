// Dedicated dispute state-transition endpoint.
// Replaces client-side dispute status mutations. Validates transitions against
// the dispute state machine, writes dispute_status_history, and captures a
// unified admin_actions audit row with before/after diff.
//
// POST /admin-dispute-transition
// body: { dispute_id: string, target_status: "under_review"|"seller_response_pending"|"escalated"|"open", reason: string, notify_parties?: boolean }
import { requireAdmin, authErrorResponse, requirePermission, requireAnyPermission } from "../_shared/auth.ts";
import { logAdminAction } from "../_shared/audit.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

// Mirrors the DB state machine in payment-state-machine.ts (open/seller_response_pending/under_review/escalated/resolved).
// Terminal `resolved` is handled by admin-transaction-actions (resolve_dispute) and rejected here.
const ALLOWED: Record<string, string[]> = {
  open: ["under_review", "escalated", "seller_response_pending"],
  seller_response_pending: ["under_review", "escalated"],
  under_review: ["escalated", "seller_response_pending"],
  escalated: ["under_review"],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    // Authenticate FIRST — an anonymous caller must get 401 and an
    // authenticated non-admin 403, regardless of the request body.
    const baseCtx = await requireAdmin(req);

    let body: any;
    try { body = await req.json(); } catch { return json(400, { error: "invalid_json" }); }

    const disputeId: string = String(body?.dispute_id ?? "").trim();
    const target: string = String(body?.target_status ?? "").trim();
    const reason: string = String(body?.reason ?? "").trim();
    const notifyParties: boolean = Boolean(body?.notify_parties);

    if (!disputeId) return json(400, { error: "dispute_id_required" });
    if (!target) return json(400, { error: "target_status_required" });
    if (reason.length < 3) return json(400, { error: "reason_required" });

    // Gate per target status: escalations require disputes.escalate; all other
    // in-flight status changes accept disputes.update_status (new granular
    // action) OR the legacy disputes.update permission for back-compat.
    const requiredPerms =
      target === "escalated"
        ? ["disputes.escalate"]
        : ["disputes.update_status", "disputes.update"];
    const { userId, adminClient } = await requireAnyPermission(req, requiredPerms, baseCtx);


    const { data: dispute, error: dErr } = await adminClient
      .from("disputes")
      .select("id, status, transaction_id, filed_by_user_id")
      .eq("id", disputeId)
      .maybeSingle();
    if (dErr) return json(500, { error: "fetch_failed", detail: dErr.message });
    if (!dispute) return json(404, { error: "dispute_not_found" });
    if (dispute.status === "resolved") return json(400, { error: "already_resolved" });

    const allowed = ALLOWED[dispute.status] ?? [];
    if (!allowed.includes(target)) {
      return json(400, { error: "invalid_transition", from: dispute.status, to: target, allowed });
    }

    const nowIso = new Date().toISOString();
    const { error: upErr } = await adminClient
      .from("disputes")
      .update({ status: target, updated_at: nowIso })
      .eq("id", disputeId)
      .eq("status", dispute.status); // optimistic lock
    if (upErr) return json(500, { error: "update_failed", detail: upErr.message });

    await adminClient.from("dispute_status_history").insert({
      dispute_id: disputeId,
      old_status: dispute.status,
      new_status: target,
      changed_by_user_id: userId,
      reason,
    });

    // Mirror to transaction dispute_status column when helpful.
    await adminClient
      .from("transactions")
      .update({ dispute_status: target, updated_at: nowIso })
      .eq("id", dispute.transaction_id);

    await logAdminAction(adminClient, {
      actorId: userId,
      action: "dispute_transition",
      targetType: "dispute",
      targetId: disputeId,
      transactionId: dispute.transaction_id,
      disputeId,
      reason,
      before: { status: dispute.status },
      after: { status: target },
      metadata: { notify_parties: notifyParties },
      mirrorToAuditLogs: true,
    });

    return json(200, { ok: true, dispute_id: disputeId, status: target });
  } catch (err) {
    const authResp = authErrorResponse(err, cors);
    if (authResp) return authResp;
    console.error("[admin-dispute-transition] error", err);
    return json(500, { error: "internal_error" });
  }
});