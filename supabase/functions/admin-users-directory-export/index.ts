/**
 * Admin User Directory CSV export.
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
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  try { await requireAdmin(req); }
  catch (err) {
    const r = authErrorResponse(err, corsHeaders);
    if (r) return r;
    return new Response(JSON.stringify({ error: "auth_failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const overviewUrl = new URL(req.url);
  overviewUrl.pathname = overviewUrl.pathname.replace(/admin-users-directory-export$/, "admin-users-directory");
  overviewUrl.searchParams.set("page", "1");
  overviewUrl.searchParams.set("page_size", "2000");
  for (const k of ["q", "role", "status", "verification", "range", "sort"]) {
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
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const body = await res.json() as { rows: Array<Record<string, unknown>> };

  const header = [
    "user_id", "display_id", "full_name", "handle", "email", "phone",
    "roles", "verification_level", "id_status",
    "transactions_count", "transactions_volume_ngn",
    "disputes_total", "disputes_active",
    "status", "is_suspended", "is_flagged", "joined_at",
  ];
  const lines = [header.join(",")];
  for (const r of body.rows ?? []) {
    const v = r as Record<string, any>;
    lines.push([
      v.user_id, v.display_id, v.full_name, v.handle, v.email, v.phone ?? "",
      (v.roles ?? []).join("; "),
      v.verification?.level ?? "", v.verification?.id_status ?? "",
      v.transactions?.count ?? 0, v.transactions?.volume ?? 0,
      v.disputes?.total ?? 0, v.disputes?.active ?? 0,
      v.status, v.is_suspended ? "yes" : "no", v.is_flagged ? "yes" : "no",
      v.joined_at ?? "",
    ].map(csvEscape).join(","));
  }

  return new Response(lines.join("\n"), {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="user-directory-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
});