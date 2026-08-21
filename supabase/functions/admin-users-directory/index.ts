/**
 * Admin User Directory aggregator (read-only).
 * GET → summary + paginated user roll-ups.
 */
import { requireAdmin, authErrorResponse , requirePermission} from "../_shared/auth.ts";
import { getDirectoryPage, getDirectorySummary } from "../_shared/users-directory-sql.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let ctx;
  try { ctx = await requirePermission(req, "users_and_access.view"); }
  catch (err) {
    const r = authErrorResponse(err, corsHeaders);
    if (r) return r;
    return json(500, { error: "auth_failed" });
  }

  if (req.method !== "GET") return json(405, { error: "method_not_allowed" });
  const admin = ctx.adminClient;
  const url = new URL(req.url);

  const filters = {
    q: (url.searchParams.get("q") ?? "").trim().toLowerCase(),
    role: (url.searchParams.get("role") ?? "all") as never,
    status: (url.searchParams.get("status") ?? "all") as never,
    verification: (url.searchParams.get("verification") ?? "all") as never,
    range: (url.searchParams.get("range") ?? "all") as never,
  };
  const sort = url.searchParams.get("sort") ?? "recent";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(100, Math.max(5, Number(url.searchParams.get("page_size") ?? "20") || 20));

  const [summary, pageResult] = await Promise.all([
    getDirectorySummary(admin),
    getDirectoryPage(admin, filters, sort, page, pageSize),
  ]);

  return json(200, {
    summary,
    rows: pageResult.rows,
    total: pageResult.total,
    page,
    page_size: pageSize,
  });
});