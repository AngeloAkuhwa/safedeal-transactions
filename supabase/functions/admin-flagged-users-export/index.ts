/**
 * Admin Flagged Users CSV export. Streams a CSV reflecting current filters.
 * Re-runs the same aggregation as admin-flagged-users but without pagination.
 */
import { requireAdmin, authErrorResponse } from "../_shared/auth.ts";

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
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    await requireAdmin(req);
  } catch (err) {
    const r = authErrorResponse(err, corsHeaders);
    if (r) return r;
    return new Response(JSON.stringify({ error: "auth_failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

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
    "user_id", "name", "email", "short_id", "risk", "status",
    "reasons", "disputes_30d", "refunds_30d", "escrow_at_risk",
    "related_tx_code", "related_tx_amount",
    "flagged_by", "flagged_at", "auto_detected",
  ];
  const lines = [header.join(",")];
  for (const r of body.rows ?? []) {
    lines.push([
      r.user_id, r.name, r.email ?? "", r.short_id, r.risk, r.status,
      (r.reasons ?? []).map((x: any) => x.label).join("; "),
      r.disputes_30d, r.refunds_30d, r.escrow_at_risk,
      r.related?.tx_code ?? "", r.related?.tx_amount ?? 0,
      r.flagged_by?.name ?? "", r.flagged_at ?? "", r.auto_detected ? "yes" : "no",
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
