/**
 * Admin User Directory CSV export.
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
  try { ctx = await requirePermission(req, "users_and_access.export"); }
  catch (err) {
    const r = authErrorResponse(err, corsHeaders);
    if (r) return r;
    return new Response(JSON.stringify({ error: "auth_failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rl = await enforceAdminRateLimit(ctx!, "users_directory_export", 10, corsHeaders);
  if (rl) return rl;

  const url = new URL(req.url);
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const overviewUrl = new URL(`${supabaseUrl}/functions/v1/admin-users-directory`);
  overviewUrl.searchParams.set("page", "1");
  overviewUrl.searchParams.set("page_size", "2000");
  for (const k of ["q", "role", "status", "verification", "range", "sort"]) {
    const v = url.searchParams.get(k);
    if (v) overviewUrl.searchParams.set(k, v);
  }
  const auth = req.headers.get("Authorization") ?? "";
  const apikey = req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  let body: { rows: Array<Record<string, unknown>> };
  try {
    const res = await fetch(overviewUrl.toString(), {
      headers: { Authorization: auth, apikey },
    });
    const text = await res.text();
    if (!res.ok) {
      console.error("[admin-users-directory-export] overview fetch failed", res.status, text);
      return new Response(JSON.stringify({ error: "overview_fetch_failed", status: res.status, detail: text.slice(0, 500) }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    body = JSON.parse(text) as { rows: Array<Record<string, unknown>> };
  } catch (e) {
    console.error("[admin-users-directory-export] fetch error", e);
    return new Response(JSON.stringify({ error: "overview_fetch_failed", detail: (e as Error).message }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const header = [
    "public_user_id", "full_name", "handle", "email", "phone",
    "roles", "verification_level", "id_status",
    "transactions_count", "transactions_volume_ngn",
    "disputes_total", "disputes_active",
    "status", "is_suspended", "is_flagged", "joined_at",
  ];
  const lines = [header.join(",")];
  for (const r of body.rows ?? []) {
    const v = r as Record<string, any>;
    lines.push([
      v.display_id, v.full_name, v.handle, v.email, v.phone ?? "",
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