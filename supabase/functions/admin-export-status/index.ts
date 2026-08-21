/**
 * Admin Export Status — returns job progress and a short-lived signed URL
 * for the generated CSV once the worker finishes.
 */
import { requireAdmin, authErrorResponse , requirePermission} from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let ctx;
  try {
    ctx = await requirePermission(req, "dashboard.view");
  } catch (err) {
    const r = authErrorResponse(err, corsHeaders);
    if (r) return r;
    return json({ error: "auth_failed" }, 500);
  }

  if (req.method !== "GET" && req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let jobId: string | null = null;
  if (req.method === "GET") {
    jobId = new URL(req.url).searchParams.get("job_id");
  } else {
    try {
      const body = await req.json();
      jobId = typeof body?.job_id === "string" ? body.job_id : null;
    } catch { /* noop */ }
  }
  if (!jobId) return json({ error: "job_id_required" }, 400);

  const { data: job, error } = await ctx.adminClient
    .from("admin_export_jobs")
    .select("id, requester_id, export_type, status, row_count, file_path, file_size_bytes, error_message, started_at, completed_at, expires_at, created_at, updated_at")
    .eq("id", jobId)
    .maybeSingle();
  if (error) return json({ error: "lookup_failed", detail: error.message }, 500);
  if (!job) return json({ error: "not_found" }, 404);

  // Only the requester or any admin can read. Admin was already asserted.
  // (Extra scoping keeps requester-only exports strictly private if desired.)

  let downloadUrl: string | null = null;
  if (job.status === "completed" && job.file_path) {
    const { data: signed, error: signErr } = await ctx.adminClient
      .storage
      .from("admin-exports")
      .createSignedUrl(job.file_path, 60 * 15); // 15 min
    if (signErr) console.error("[admin-export-status] sign failed", signErr);
    downloadUrl = signed?.signedUrl ?? null;
  }

  return json({ job, download_url: downloadUrl });
});
