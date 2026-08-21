import { z } from "https://esm.sh/zod@3.23.8";
import { requirePermission, authErrorResponse } from "../_shared/auth.ts";
import { notifyOpsTeam } from "../_shared/notify.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Reasons map to release_review_queue.queue_type inside flag_for_release_review SQL
// helper. The two missing-confirmation reasons collapse to queue_type='stuck'.
const ReasonEnum = z.enum([
  "payout_account_missing",
  "pricing_missing",
  "stuck_confirmation",
  "missing_seller_confirmation",
  "missing_buyer_confirmation",
  "silent_dispute",
  "failed_payout",
  "refund_request",
  "transfer_reversed",
  "manual_hold",
  "delivery_proof_missing",
  "suspicious_activity",
]);

const SeverityEnum = z.enum(["low", "medium", "high"]);

const BodySchema = z.object({
  transaction_id: z.string().uuid(),
  reason: ReasonEnum,
  notes: z.string().trim().min(3).max(500),
  severity: SeverityEnum.optional(),
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
  try { ctx = await requirePermission(req, "release_review.flag"); }
  catch (err) {
    const r = authErrorResponse(err, corsHeaders);
    if (r) return r;
    console.error("flag-for-release-review auth error", err);
    return json(500, { error: "auth_failed" });
  }

  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  let raw: unknown;
  try { raw = await req.json(); } catch { return json(400, { error: "invalid_json" }); }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return json(400, { error: "invalid_body", issues: parsed.error.flatten().fieldErrors });
  }
  const { transaction_id, reason, notes, severity } = parsed.data;
  const effectiveSeverity = severity ?? "medium";
  const admin = ctx.adminClient;

  // Confirm the tx exists and load identifiers for the ops fanout
  const { data: tx, error: txErr } = await admin
    .from("transactions")
    .select("id, transaction_code, money_status, seller_id, buyer_id")
    .eq("id", transaction_id)
    .maybeSingle();
  if (txErr) return json(500, { error: "tx_fetch_failed" });
  if (!tx) return json(404, { error: "transaction_not_found" });

  const { data: queueId, error: rpcErr } = await admin.rpc("flag_for_release_review", {
    p_transaction_id: transaction_id,
    p_reason: reason,
    p_actor_user_id: ctx.userId,
    p_notes: notes,
  });
  if (rpcErr) {
    console.error("flag-for-release-review: rpc", rpcErr);
    return json(409, { error: "flag_failed", detail: rpcErr.message });
  }

  // Note: we intentionally do NOT write a transaction_events row here — none
  // of the enum labels describe an admin-flag action. The admin_actions row
  // inserted by flag_for_release_review() is the canonical audit record.

  await notifyOpsTeam(admin, {
    type: "security_alert",
    title: "Transaction flagged for release review",
    message: `${tx.transaction_code} flagged: ${reason}`,
    related_transaction_id: transaction_id,
    metadata: { reason, queue_id: queueId, money_status: tx.money_status, severity: effectiveSeverity },
  });

  return json(200, {
    ok: true,
    queue_id: queueId,
    reason,
    severity: effectiveSeverity,
    transaction_code: tx.transaction_code,
  });
});
