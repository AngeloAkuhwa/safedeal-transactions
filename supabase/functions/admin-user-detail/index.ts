/**
 * Admin User Detail (read-only). Backs the user-directory drawer.
 * GET ?user_id=<uuid> → profile + verification + tx/dispute summary + admin_actions timeline.
 */
import { requireAdmin, authErrorResponse } from "../_shared/auth.ts";
import { buildDirectory } from "../_shared/users-directory-engine.ts";

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
  if (req.method !== "GET") return json(405, { error: "method_not_allowed" });

  let ctx;
  try { ctx = await requireAdmin(req); }
  catch (err) {
    const r = authErrorResponse(err, corsHeaders);
    if (r) return r;
    return json(500, { error: "auth_failed" });
  }
  const admin = ctx.adminClient;
  const url = new URL(req.url);
  const userId = url.searchParams.get("user_id");
  if (!userId) return json(400, { error: "user_id_required" });

  const all = await buildDirectory(admin);
  const row = all.find((r) => r.user_id === userId);
  if (!row) return json(404, { error: "user_not_found" });

  // Recent transactions (top 5)
  const { data: txs } = await admin
    .from("transactions")
    .select("id, transaction_code, total_amount, status, money_status, created_at, buyer_id, seller_id")
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(5);

  // Recent disputes (top 5)
  const { data: disp } = await admin
    .from("disputes")
    .select("id, transaction_id, status, opened_at, reason")
    .or(
      `transaction_id.in.(${(txs ?? []).map((t) => `'${t.id}'`).join(",") || "''"})`,
    )
    .order("opened_at", { ascending: false })
    .limit(5);

  // Admin actions timeline
  const { data: actions } = await admin
    .from("admin_actions")
    .select("id, action_type, action_notes, admin_user_id, created_at, transaction_id, dispute_id")
    .eq("target_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  const adminIds = Array.from(new Set((actions ?? []).map((a) => a.admin_user_id as string).filter(Boolean)));
  const adminNames = new Map<string, string>();
  if (adminIds.length) {
    const { data: aprofs } = await admin.from("profiles").select("id, full_name").in("id", adminIds);
    for (const p of aprofs ?? []) adminNames.set(p.id as string, (p.full_name as string) ?? "Admin");
  }

  return json(200, {
    user: row,
    recent_transactions: (txs ?? []).map((t) => ({
      transaction_id: t.id, transaction_code: t.transaction_code,
      amount: Number(t.total_amount ?? 0), status: t.status, money_status: t.money_status,
      created_at: t.created_at,
      counterparty: t.buyer_id === userId ? "as_buyer" : "as_seller",
    })),
    recent_disputes: (disp ?? []).map((d) => ({
      dispute_id: d.id, transaction_id: d.transaction_id, status: d.status,
      reason: d.reason, created_at: d.opened_at,
    })),
    timeline: (actions ?? []).map((a) => ({
      id: a.id, type: a.action_type, note: a.action_notes,
      admin_name: adminNames.get(a.admin_user_id as string) ?? "System",
      created_at: a.created_at,
      transaction_id: a.transaction_id, dispute_id: a.dispute_id,
    })),
  });
});