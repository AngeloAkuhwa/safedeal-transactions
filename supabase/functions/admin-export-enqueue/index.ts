/**
 * Admin Export Enqueue — P1 scale item.
 *
 * Creates a background CSV export job in `admin_export_jobs`, then
 * fire-and-forgets the worker via HTTP. Returns { job_id } immediately so the
 * browser never blocks on a long-running edge function timeout.
 *
 * The client polls `admin-export-status` for progress and the final signed
 * download URL.
 */
import { requireAdmin, requirePermission, authErrorResponse } from "../_shared/auth.ts";
import { enforceAdminRateLimit } from "../_shared/rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPPORTED_TYPES = new Set([
  "escrow",
  "users_directory",
  "flagged_users",
  "transactions_monitor",
  "user_detail",
  "audit_logs",
]);

// Per-export-type permission gating (Support Agent RBAC finalisation).
// Every export must require its own module's `.export` permission so a role
// that can only view users cannot pull the full users CSV.
const EXPORT_PERMS: Record<string, string> = {
  escrow:               "escrow.export",
  users_directory:      "users_and_access.export",
  flagged_users:        "flagged_users.export",
  transactions_monitor: "transactions.export",
  user_detail:          "users_and_access.export",
  audit_logs:           "audit_logs.export",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Authenticate FIRST so anonymous callers get 401 and non-admins 403 before
  // any body parsing/validation can emit a 400.
  let ctx;
  try {
    ctx = await requireAdmin(req);
  } catch (err) {
    const r = authErrorResponse(err, corsHeaders);
    if (r) return r;
    return json({ error: "auth_failed" }, 500);
  }

  // Parse body so we know which export_type we're gating.
  let body: { export_type?: string; params?: Record<string, unknown> } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const exportType = String(body.export_type ?? "").trim();
  if (!SUPPORTED_TYPES.has(exportType)) {
    return json({ error: "unsupported_export_type", detail: exportType }, 400);
  }

  // Per-export-type permission gate (unchanged semantics).
  const requiredPerm = EXPORT_PERMS[exportType];
  try {
    if (requiredPerm) ctx = await requirePermission(req, requiredPerm, ctx);
  } catch (err) {
    const r = authErrorResponse(err, corsHeaders);
    if (r) return r;
    return json({ error: "auth_failed" }, 500);
  }


  const rl = await enforceAdminRateLimit(ctx, "export_enqueue", 20, corsHeaders);
  if (rl) return rl;

  const params = body.params && typeof body.params === "object" ? body.params : {};

  const { data: job, error: insErr } = await ctx.adminClient
    .from("admin_export_jobs")
    .insert({
      requester_id: ctx.userId,
      export_type: exportType,
      params,
      status: "queued",
    })
    .select("id")
    .single();

  if (insErr || !job) {
    console.error("[admin-export-enqueue] insert failed", insErr);
    return json({ error: "enqueue_failed", detail: insErr?.message ?? null }, 500);
  }

  // Fire-and-forget the worker. We do NOT await the response — the worker
  // runs in its own request lifecycle so this endpoint returns immediately.
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const workerUrl = `${supabaseUrl}/functions/v1/admin-export-worker`;
  try {
    fetch(workerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
      body: JSON.stringify({ job_id: job.id }),
    }).catch((e) => console.error("[admin-export-enqueue] worker dispatch error", e));
  } catch (e) {
    console.error("[admin-export-enqueue] worker dispatch throw", e);
  }

  return json({ job_id: job.id, status: "queued" }, 202);
});
