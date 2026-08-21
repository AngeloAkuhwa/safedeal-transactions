/**
 * Admin Flagged User Detail (drawer payload).
 * GET ?user_id=<uuid> → full per-user fraud roll-up + timeline.
 * Admin-only.
 */
import { requireAdmin, authErrorResponse , requirePermission} from "../_shared/auth.ts";
import { buildRows, recommendationFor } from "../_shared/flagged-users-engine.ts";

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

  let ctx;
  try { ctx = await requirePermission(req, "flagged_users.view"); }
  catch (err) {
    const r = authErrorResponse(err, corsHeaders);
    if (r) return r;
    return json(500, { error: "auth_failed" });
  }

  if (req.method !== "GET") return json(405, { error: "method_not_allowed" });
  const admin = ctx.adminClient;

  const url = new URL(req.url);
  const user_id = url.searchParams.get("user_id");
  if (!user_id) return json(400, { error: "user_id_required" });

  // Run the same engine to get the up-to-date row for this user.
  const all = await buildRows(admin, "all_time");
  const row = all.find((r) => r.user_id === user_id);

  // Profile (even if no flag, return 404 only when neither profile nor signals exist)
  const { data: profile } = await admin
    .from("profiles")
    .select("id, public_user_id, full_name, email, phone, avatar_url, status, default_role, created_at")
    .eq("id", user_id).maybeSingle();

  if (!row && !profile) return json(404, { error: "user_not_found" });

  const user = row?.user ?? {
    id: user_id,
    display_id: String((prof as Record<string, unknown> | null)?.public_user_id ?? ""),
    full_name: (profile?.full_name as string) ?? "Unknown user",
    email: (profile?.email as string) ?? "",
    phone: (profile?.phone as string) ?? null,
    avatar_url: (profile?.avatar_url as string) ?? null,
    role: (profile?.default_role as never) ?? null,
    account_tier: null,
    is_suspended: (profile?.status as string) === "suspended" || (profile?.status as string) === "blocked",
  };

  const risk = row?.risk ?? { level: "low" as const, score: 0, color: "blue" as const };

  // Related transactions (latest 10 where user is buyer or seller)
  const { data: relTx } = await admin
    .from("transactions")
    .select("id, transaction_code, status, money_status, created_at")
    .or(`buyer_id.eq.${user_id},seller_id.eq.${user_id}`)
    .order("created_at", { ascending: false })
    .limit(10);

  const txIds = (relTx ?? []).map((t) => t.id as string);
  const pricingByTx = new Map<string, number>();
  if (txIds.length) {
    const { data: pr } = await admin
      .from("transaction_pricing")
      .select("transaction_id, total_amount")
      .in("transaction_id", txIds);
    for (const p of pr ?? []) pricingByTx.set(p.transaction_id as string, Number(p.total_amount ?? 0));
  }

  const related_transactions = (relTx ?? []).map((t) => ({
    transaction_id: t.id as string,
    transaction_code: t.transaction_code as string,
    amount: pricingByTx.get(t.id as string) ?? 0,
    currency: "NGN" as const,
    status_label: (t.status as string) ?? "",
    money_status_label: (t.money_status as string) ?? "",
    created_at: t.created_at as string,
  }));

  // Related disputes (latest 10 against this user. Opened against their txs)
  const { data: dList } = await admin
    .from("disputes")
    .select("id, transaction_id, reason, status, opened_at, opened_by_user_id")
    .order("opened_at", { ascending: false })
    .limit(50);
  const myTxIds = new Set(txIds);
  const related_disputes = (dList ?? [])
    .filter((d) => myTxIds.has(d.transaction_id as string))
    .slice(0, 10)
    .map((d) => ({
      dispute_id: d.id as string,
      dispute_code: `DSP-${(d.id as string).slice(0, 8).toUpperCase()}`,
      status_label: (d.status as string) ?? "",
      reason: (d.reason as string) ?? "",
      created_at: d.opened_at as string,
    }));

  // Refunds / chargebacks
  const { data: refunds } = await admin
    .from("refunds")
    .select("id, refund_amount, status, created_at")
    .eq("buyer_id", user_id)
    .order("created_at", { ascending: false })
    .limit(10);
  const refunds_or_chargebacks = (refunds ?? []).map((r) => ({
    id: r.id as string,
    type: "refund" as const,
    amount: Number(r.refund_amount ?? 0),
    status_label: (r.status as string) ?? "",
    created_at: r.created_at as string,
  }));

  // Identity
  const { data: idSub } = await admin
    .from("identity_submissions")
    .select("status, rejection_reason, submitted_at, reviewed_at")
    .eq("user_id", user_id)
    .order("submitted_at", { ascending: false })
    .limit(1).maybeSingle();
  const identity = idSub ? {
    latest_status: (idSub.status as string) ?? undefined,
    rejection_reason: (idSub.rejection_reason as string) ?? undefined,
    submitted_at: (idSub.submitted_at as string) ?? undefined,
    reviewed_at: (idSub.reviewed_at as string) ?? undefined,
  } : {};

  // Admin actions timeline (latest 30 against this user)
  const { data: actions } = await admin
    .from("admin_actions")
    .select("id, admin_user_id, action_type, action_notes, created_at")
    .eq("target_user_id", user_id)
    .order("created_at", { ascending: false })
    .limit(30);

  const adminIds = Array.from(new Set((actions ?? []).map((a) => a.admin_user_id as string).filter(Boolean)));
  const adminNames = new Map<string, string>();
  if (adminIds.length) {
    const { data: ps } = await admin.from("profiles").select("id, full_name").in("id", adminIds);
    for (const p of ps ?? []) adminNames.set(p.id as string, (p.full_name as string) ?? "Admin");
  }
  const ACTION_LABELS: Record<string, string> = {
    flag_user: "Flagged user", unflag_user: "Unflagged user", clear_flag: "Cleared flag",
    suspend_user: "Suspended user", unsuspend_user: "Unsuspended user",
    freeze_transaction: "Froze transaction", unfreeze_transaction: "Unfroze transaction",
    escalate_case: "Escalated case", open_investigation: "Opened investigation",
    close_case: "Closed case", add_note: "Added note", add_internal_note: "Added internal note",
    flag_for_review: "Flagged for review", resolve_dispute: "Resolved dispute",
  };
  const admin_actions = (actions ?? []).map((a) => ({
    id: a.id as string,
    type: a.action_type as string,
    label: ACTION_LABELS[a.action_type as string] ?? (a.action_type as string),
    admin_name: adminNames.get(a.admin_user_id as string) ?? "Admin",
    note: (a.action_notes as string) ?? undefined,
    created_at: a.created_at as string,
  }));

  return json(200, {
    user,
    risk: {
      score: risk.score,
      level: risk.level,
      first_blocker: row?.flag_reasons?.[0]?.label,
      recommendation: recommendationFor(risk.level),
    },
    signals: (row as never as { signals?: unknown })?.signals ?? [],
    related_transactions,
    related_disputes,
    refunds_or_chargebacks,
    identity,
    admin_actions,
    available_actions: {
      can_suspend: row?.actions.can_suspend ?? !user.is_suspended,
      can_clear: row?.actions.can_clear ?? false,
      can_escalate: row?.actions.can_escalate ?? false,
      can_add_note: true,
      can_open_profile: true,
    },
    related_context: row?.related_context,
    flag_reasons: row?.flag_reasons ?? [],
    status: row?.status ?? "active",
    flagged_at: row?.flagged_at ?? null,
  });
});