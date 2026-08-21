import { z } from "https://esm.sh/zod@3.23.8";
import { requirePermission, authErrorResponse } from "../_shared/auth.ts";
import { enforceAdminRateLimit } from "../_shared/rate-limit.ts";
import { checkMakerChecker } from "../_shared/maker-checker.ts";
import { refundBuyerCore } from "../_shared/release-core.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BodySchema = z.object({
  transaction_id: z.string().uuid(),
  reason: z.string().trim().min(3).max(200),
  notes: z.string().trim().max(500).optional(),
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
  try { ctx = await requirePermission(req, "refunds.issue"); }
  catch (err) {
    const r = authErrorResponse(err, corsHeaders);
    if (r) return r;
    console.error("refund-buyer auth error", err);
    return json(500, { error: "auth_failed" });
  }

  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const rl = await enforceAdminRateLimit(ctx, "refund_transaction", 30, corsHeaders);
  if (rl) return rl;

  let raw: unknown;
  try { raw = await req.json(); } catch { return json(400, { error: "invalid_json" }); }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return json(400, { error: "invalid_body", issues: parsed.error.flatten().fieldErrors });
  }
  const { transaction_id, reason, notes } = parsed.data;

  // Maker-checker: the approver must differ from whoever opened/flagged the
  // refund. Enforced only when `finance.maker_checker_enforced` is on.
  const mc = await checkMakerChecker(ctx.adminClient, {
    transactionId: transaction_id,
    approverId: ctx.userId,
    kind: "refund",
  });
  if (!mc.allowed) {
    return json(409, { error: mc.error, initiator_user_id: mc.initiatorId });
  }

  const result = await refundBuyerCore(ctx.adminClient, {
    transaction_id,
    reason,
    notes: notes ?? null,
    actor_user_id: ctx.userId,
  });
  return json(result.status, result.body);
});
