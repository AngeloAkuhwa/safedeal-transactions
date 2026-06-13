/**
 * Admin Flagged Users aggregator (read-only, mini fraud engine).
 * GET → summary + paginated user roll-ups derived from:
 *   - admin_actions (flag_user / freeze_transaction / escalate_case / suspend_user /
 *                    unsuspend_user / clear_flag / unflag_user / open_investigation /
 *                    flag_for_review / close_case)
 *   - transactions.needs_release_review / needs_admin_review (owner = buyer & seller)
 *   - disputes (count per user in 30d)
 *   - refunds (chargeback / repeated-refund pattern)
 *   - identity_submissions (rejected)
 *   - escrow_states (frozen / stuck)
 *   - admin_investigations (open/under_review/escalated)
 *   - case_reviews (open)
 *   - payouts (blocked / reversed)
 *   - profiles.status (suspended)
 * Admin-only.
 */
import { requireAdmin, authErrorResponse } from "../_shared/auth.ts";
import { buildRows, summarize, applyFilters, sortRows } from "../_shared/flagged-users-engine.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET") return json(405, { error: "method_not_allowed" });

  let ctx;
  try {
    ctx = await requireAdmin(req);
  } catch (err) {
    const r = authErrorResponse(err, corsHeaders);
    if (r) return r;
    return json(500, { error: "auth_failed" });
  }
  const admin = ctx.adminClient;
  const url = new URL(req.url);

  const risk = url.searchParams.get("risk") ?? "all";
  const reasonFilter = url.searchParams.get("reason") ?? "all";
  const range = url.searchParams.get("range") ?? "30d";
  const statusFilter = url.searchParams.get("status") ?? "active";
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const sort = url.searchParams.get("sort") ?? "risk";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(100, Math.max(5, Number(url.searchParams.get("page_size") ?? "15") || 15));

  const allRows = await buildRows(admin, range);
  const summary = summarize(allRows);
  const filtered = applyFilters(allRows, { risk, reason: reasonFilter, status: statusFilter, q });
  sortRows(filtered, sort);

  const total = filtered.length;
  const sliced = filtered.slice((page - 1) * pageSize, page * pageSize);

  return json(200, { summary, rows: sliced, total, page, page_size: pageSize });
});
