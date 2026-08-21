// Admin Audit Compliance Report — enqueues a filtered audit_logs export for
// the requested date range with severity=high+critical, then returns the
// export job id. Client uses the standard export polling flow.
import { requireAdmin, authErrorResponse , requirePermission} from "../_shared/auth.ts";
import { logAdminAction, extractRequestMeta } from "../_shared/audit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function computeRange(range: string): { from: string; to: string } {
  const now = Date.now();
  const to = new Date(now).toISOString();
  const map: Record<string, number> = { "24h": 1, "7d": 7, "30d": 30, "90d": 90 };
  const days = map[range] ?? 30;
  return { from: new Date(now - days * 24 * 3600 * 1000).toISOString(), to };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let ctx;
  try { ctx = await requirePermission(req, "audit_logs.export"); }
  catch (err) {
    const r = authErrorResponse(err, corsHeaders); if (r) return r;
    return json({ error: "auth_failed" }, 500);
  }

  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: { range?: string; severity?: string; from?: string; to?: string } = {};
  try { body = await req.json(); } catch { /* accept empty body */ }
  const rangeKey = String(body.range ?? "30d");
  const custom = body.from && body.to ? { from: String(body.from), to: String(body.to) } : null;
  const { from, to } = custom ?? computeRange(rangeKey);
  const severity = String(body.severity ?? "high"); // groups high+critical via regex bucket "high"

  const meta = extractRequestMeta(req);
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Server-to-server enqueue so we can call as the same admin without
  // re-implementing rate-limit or worker dispatch.
  const enqueueRes = await fetch(`${supabaseUrl}/functions/v1/admin-export-enqueue`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: req.headers.get("Authorization") ?? `Bearer ${serviceKey}`,
      apikey: serviceKey,
    },
    body: JSON.stringify({
      export_type: "audit_logs",
      params: { severity, from, to, compliance: true },
    }),
  });
  const enqueueJson = await enqueueRes.json().catch(() => ({}));
  if (!enqueueRes.ok) {
    return json({ error: "enqueue_failed", detail: enqueueJson?.error ?? enqueueJson }, enqueueRes.status);
  }

  await logAdminAction(ctx.adminClient, {
    actorId: ctx.userId,
    action: "audit_compliance_report",
    targetType: "system",
    reason: `Compliance report ${rangeKey} (${from} → ${to})`,
    metadata: { range: rangeKey, from, to, severity, job_id: enqueueJson?.job_id ?? null },
    ip: meta.ip,
    userAgent: meta.userAgent,
    mirrorToAuditLogs: true,
  });

  return json({ job_id: enqueueJson.job_id, status: "queued", from, to, severity }, 202);
});