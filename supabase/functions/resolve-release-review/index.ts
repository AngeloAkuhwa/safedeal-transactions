import { z } from "https://esm.sh/zod@3.23.8";
import { requirePermission, authErrorResponse } from "../_shared/auth.ts";
import { releasePayoutCore, refundBuyerCore } from "../_shared/release-core.ts";
import { notifyUser, notifyOpsTeam } from "../_shared/notify.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const Resolution = z.enum(["release", "refund", "hold", "dismiss", "request_more_info"]);

const BodySchema = z.object({
  transaction_id: z.string().uuid(),
  resolution: Resolution,
  notes: z.string().trim().min(10).max(2000),
  // Used only for `refund` resolution.
  refund_reason: z.string().trim().min(3).max(200).optional(),
  // Used only for `request_more_info`. 'buyer' or 'seller'.
  request_target: z.enum(["buyer", "seller"]).optional(),
});

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let ctx;
  try { ctx = await requirePermission(req, "release_review.resolve"); }
  catch (err) {
    const r = authErrorResponse(err, corsHeaders);
    if (r) return r;
    console.error("resolve-release-review auth error", err);
    return json(500, { error: "auth_failed" });
  }

  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  let raw: unknown;
  try { raw = await req.json(); } catch { return json(400, { error: "invalid_json" }); }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return json(400, { error: "invalid_body", issues: parsed.error.flatten().fieldErrors });
  }
  const { transaction_id, resolution, notes, refund_reason, request_target } = parsed.data;
  const admin = ctx.adminClient;

  // 1. Tx exists
  const { data: tx, error: txErr } = await admin
    .from("transactions")
    .select("id, transaction_code, buyer_id, seller_id, money_status, release_review_reason, needs_release_review")
    .eq("id", transaction_id)
    .maybeSingle();
  if (txErr) return json(500, { error: "tx_fetch_failed" });
  if (!tx) return json(404, { error: "transaction_not_found" });

  // 2. Open queue row
  const { data: queueRow, error: queueErr } = await admin
    .from("release_review_queue")
    .select("id, queue_type, status, payout_id")
    .eq("transaction_id", transaction_id)
    .in("status", ["pending", "claimed", "processing", "awaiting_info", "held", "failed"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (queueErr) return json(500, { error: "queue_fetch_failed" });
  if (!queueRow) return json(409, { error: "no_open_queue_row" });

  // 3. Branch
  if (resolution === "release") {
    const result = await releasePayoutCore(admin, {
      transaction_id,
      actor_user_id: ctx.userId,
      notes,
    });
    if (!result.ok) return json(result.status, result.body);
    // Canonical audit lives in admin_actions (written by releasePayoutCore).
    // case_reviews is a dispute-review table — not a release-review table.
    return json(200, { ok: true, resolution: "release", ...result.body });
  }

  if (resolution === "refund") {
    if (!refund_reason) return json(400, { error: "refund_reason_required" });
    const result = await refundBuyerCore(admin, {
      transaction_id,
      reason: refund_reason,
      notes,
      actor_user_id: ctx.userId,
    });
    if (!result.ok) return json(result.status, result.body);
    // Canonical audit lives in admin_actions (written by refundBuyerCore).
    return json(200, { ok: true, resolution: "refund", ...result.body });
  }

  if (resolution === "hold") {
    // Spec: hold must actually freeze the funds via the money state machine.
    const { error: freezeErr } = await admin.rpc("freeze_funds_atomic", {
      p_transaction_id: transaction_id,
      p_actor: ctx.userId,
      p_reason: "manual_hold",
    });
    if (freezeErr) {
      const detail = freezeErr.message ?? "freeze_failed";
      const code = detail.startsWith("transition_not_allowed")
        ? "transition_not_allowed"
        : "freeze_failed";
      return json(409, { error: code, detail });
    }
    await admin
      .from("release_review_queue")
      .update({
        status: "held",
        notes: notes,
        claimed_by_user_id: ctx.userId,
        claimed_at: new Date().toISOString(),
      })
      .eq("id", queueRow.id);
    await admin.from("admin_actions").insert({
      admin_user_id: ctx.userId,
      transaction_id,
      action_type: "escalate_case",
      action_notes: `hold: ${notes}`,
    });
    await notifyOpsTeam(admin, {
      type: "transaction_update",
      title: "Case placed on hold",
      message: `${(tx as any).transaction_code} held by SafeDeal review.`,
      related_transaction_id: transaction_id,
      metadata: { severity: "medium" },
    });
    return json(200, { ok: true, resolution: "hold" });
  }

  if (resolution === "dismiss") {
    // Block dismissal if a real blocker still exists.
    const blocker = (tx as any).release_review_reason as string | null;
    const blockingReasons = new Set([
      "payout_account_missing",
      "pricing_missing",
      "silent_dispute",
      "transfer_reversed",
      "failed_payout",
    ]);
    if (blocker && blockingReasons.has(blocker)) {
      return json(409, { error: "blocker_still_active", reason: blocker });
    }
    // Also block if there's an open dispute.
    const { data: openDispute } = await admin
      .from("disputes")
      .select("id")
      .eq("transaction_id", transaction_id)
      .neq("status", "resolved")
      .limit(1);
    if (openDispute && openDispute.length > 0) {
      return json(409, { error: "open_dispute" });
    }
    await admin
      .from("transactions")
      .update({ needs_release_review: false, release_review_reason: null })
      .eq("id", transaction_id);
    await admin
      .from("release_review_queue")
      .update({
        status: "dismissed",
        notes,
        claimed_by_user_id: ctx.userId,
        claimed_at: new Date().toISOString(),
        resolved_at: new Date().toISOString(),
      })
      .eq("id", queueRow.id);
    await admin.from("admin_actions").insert({
      admin_user_id: ctx.userId,
      transaction_id,
      action_type: "close_case",
      action_notes: `dismiss: ${notes}`,
    });
    return json(200, { ok: true, resolution: "dismiss" });
  }

  if (resolution === "request_more_info") {
    const target = request_target ?? "seller";
    const targetUserId = target === "buyer" ? (tx as any).buyer_id : (tx as any).seller_id;
    await admin
      .from("release_review_queue")
      .update({
        status: "awaiting_info",
        notes,
        claimed_by_user_id: ctx.userId,
        claimed_at: new Date().toISOString(),
      })
      .eq("id", queueRow.id);
    await admin.from("admin_actions").insert({
      admin_user_id: ctx.userId,
      transaction_id,
      action_type: "request_evidence",
      action_notes: `request_more_info (${target}): ${notes}`,
    });
    await notifyUser(admin, {
      user_id: targetUserId,
      type: "transaction_update",
      title: "SafeDeal needs more information",
      message: `Please review and respond on ${(tx as any).transaction_code}.`,
      related_transaction_id: transaction_id,
    });
    return json(200, { ok: true, resolution: "request_more_info", target });
  }

  return json(400, { error: "unknown_resolution" });
});