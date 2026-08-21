/**
 * Admin Flagged Users CSV export. Streams a CSV reflecting current filters.
 * Re-runs the same aggregation as admin-flagged-users but without pagination.
 */
import { requireAdmin, authErrorResponse , requirePermission} from "../_shared/auth.ts";
import { enforceAdminRateLimit } from "../_shared/rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let ctx;
  try {
    ctx = await requirePermission(req, "flagged_users.export");
  } catch (err) {
    const r = authErrorResponse(err, corsHeaders);
    if (r) return r;
    return new Response(JSON.stringify({ error: "auth_failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rl = await enforceAdminRateLimit(ctx!, "flagged_users_export", 10, corsHeaders);
  if (rl) return rl;

  const url = new URL(req.url);
  const overviewUrl = new URL(req.url);
  overviewUrl.pathname = overviewUrl.pathname.replace(
    /admin-flagged-users-export$/,
    "admin-flagged-users",
  );
  overviewUrl.searchParams.set("page", "1");
  overviewUrl.searchParams.set("page_size", "1000");
  // forward filter params
  for (const k of ["risk", "reason", "range", "status", "q", "sort"]) {
    const v = url.searchParams.get(k);
    if (v) overviewUrl.searchParams.set(k, v);
  }

  const res = await fetch(overviewUrl.toString(), {
    headers: {
      Authorization: req.headers.get("Authorization") ?? "",
      apikey: req.headers.get("apikey") ?? "",
    },
  });
  if (!res.ok) {
    return new Response(JSON.stringify({ error: "overview_fetch_failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const body = await res.json() as { rows: any[] };

  const header = [
    "public_user_id", "full_name", "email", "phone",
    "risk_level", "risk_score", "status",
    "flag_reasons", "amount_at_risk",
    "disputes_30d", "refunds_30d",
    "latest_transaction_code", "latest_transaction_id",
    "flagged_by", "flagged_by_type", "flagged_at",
    "auto_detected",
  ];
  const lines = [header.join(",")];
  for (const r of body.rows ?? []) {
    lines.push([
      r.user?.display_id ?? "",
      r.user?.full_name ?? "",
      r.user?.email ?? "",
      r.user?.phone ?? "",
      r.risk?.level ?? "",
      r.risk?.score ?? 0,
      r.status,
      (r.flag_reasons ?? []).map((x: any) => x.label).join("; "),
      r.related_context?.amount_at_risk ?? 0,
      r.related_context?.disputes_30d ?? 0,
      r.related_context?.refunds_30d ?? 0,
      r.related_context?.latest_transaction_code ?? "",
      r.related_context?.latest_transaction_id ?? "",
      r.flagged_by?.label ?? r.flagged_by?.admin_name ?? "",
      r.flagged_by?.type ?? "",
      r.flagged_at ?? "",
      r.auto_detected ? "yes" : "no",
    ].map(csvEscape).join(","));
  }

  return new Response(lines.join("\n"), {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="flagged-users-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
});
