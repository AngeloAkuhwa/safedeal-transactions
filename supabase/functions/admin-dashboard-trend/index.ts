import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { requirePermission, authErrorResponse } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    let ctx;
    try { ctx = await requirePermission(req, "dashboard.view"); }
    catch (err) {
      const resp = authErrorResponse(err, corsHeaders);
      if (resp) return resp;
      throw err;
    }
    const client = ctx.adminClient;

    const url = new URL(req.url);
    const winRaw = (url.searchParams.get("window") || "7D").toUpperCase();
    const win = winRaw === "30D" ? "30D" : winRaw === "90D" ? "90D" : "7D";
    const days = win === "7D" ? 7 : win === "30D" ? 30 : 90;

    // SQL-side date bucketing (P1 scalability fix. Replaces .limit(50000) scans).
    const { data: rows, error: rpcErr } = await client.rpc("admin_daily_activity_counts", { _days: days });
    if (rpcErr) return jsonResp({ error: `Trend query failed: ${rpcErr.message}` }, 500);
    const points = ((rows ?? []) as Array<{ bucket_date: string; tx_count: number; dispute_count: number }>)
      .map((r) => ({
        label: String(r.bucket_date).slice(5), // MM-DD
        date: String(r.bucket_date),
        primary: Number(r.tx_count ?? 0),
        secondary: Number(r.dispute_count ?? 0),
      }));

    return jsonResp({
      primary_label: "Transactions",
      secondary_label: "Disputes",
      points,
    });
  } catch (e) {
    return jsonResp({ error: `Unexpected error: ${(e as Error).message}` }, 500);
  }
});