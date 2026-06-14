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
    .select("id, transaction_code, status, money_status, created_at, buyer_id, seller_id, transaction_pricing(buyer_total_amount)")
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
    .or(`target_user_id.eq.${userId},transaction_id.in.(${(txs ?? []).map((t) => `'${t.id}'`).join(",") || "''"})`)
    .order("created_at", { ascending: false })
    .limit(30);

  // Audit logs (widened to transactions involving this user)
  const { data: audits } = await admin
    .from("audit_logs")
    .select("id, action, description, actor_user_id, created_at, transaction_id")
    .or(`target_user_id.eq.${userId},transaction_id.in.(${(txs ?? []).map((t) => `'${t.id}'`).join(",") || "''"})`)
    .order("created_at", { ascending: false })
    .limit(30);

  // Transaction events for any transaction where the user is buyer or seller
  const { data: txEvents } = await admin
    .from("transaction_events")
    .select("id, event_type, transaction_id, actor_user_id, occurred_at")
    .in("transaction_id", (txs ?? []).map((t) => t.id as string))
    .order("occurred_at", { ascending: false })
    .limit(30);

  const adminIds = Array.from(new Set([
    ...((actions ?? []).map((a) => a.admin_user_id as string)),
    ...((audits ?? []).map((a) => a.actor_user_id as string)),
  ].filter(Boolean)));
  const adminNames = new Map<string, string>();
  if (adminIds.length) {
    const { data: aprofs } = await admin.from("profiles").select("id, full_name").in("id", adminIds);
    for (const p of aprofs ?? []) adminNames.set(p.id as string, (p.full_name as string) ?? "Admin");
  }

  // --- Additive blocks for the full-screen user detail page ---

  // Aggregate stats per role (buyer/seller volumes and counts)
  const { data: allTxAgg } = await admin
    .from("transactions")
    .select("id, buyer_id, seller_id, status, transaction_pricing(buyer_total_amount)")
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`);

  let buyerCount = 0, sellerCount = 0, buyerVolume = 0, sellerVolume = 0;
  for (const t of allTxAgg ?? []) {
    const pricing = (t as Record<string, unknown>).transaction_pricing as
      | { buyer_total_amount?: number | string | null }
      | Array<{ buyer_total_amount?: number | string | null }>
      | null;
    const pricingRow = Array.isArray(pricing) ? pricing[0] : pricing;
    const amt = Number(pricingRow?.buyer_total_amount ?? 0);
    if (t.buyer_id === userId) { buyerCount += 1; buyerVolume += amt; }
    if (t.seller_id === userId) { sellerCount += 1; sellerVolume += amt; }
  }

  // Disputes split: filed (by user) vs received (against user)
  const txIds = (allTxAgg ?? []).map((t) => t.id as string);
  let disputesFiled = 0, disputesReceived = 0;
  if (txIds.length > 0) {
    const { data: allDisp } = await admin
      .from("disputes")
      .select("id, transaction_id, status, opened_by_user_id")
      .in("transaction_id", txIds);
    for (const d of allDisp ?? []) {
      if (d.opened_by_user_id === userId) disputesFiled += 1;
      else disputesReceived += 1;
    }
  }

  // Payout account
  const { data: payout } = await admin
    .from("payout_accounts")
    .select("bank_name, account_name, masked_account_number, verification_status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Last login + IP from user_sessions
  const { data: lastSession } = await admin
    .from("user_sessions")
    .select("last_seen_at, ip_address, city_name, state_name, country_code")
    .eq("user_id", userId)
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Address (best-effort from identity_submissions)
  const { data: idSub } = await admin
    .from("identity_submissions")
    .select("address_line, city, state, country")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Identity level + provider
  const { data: idVerified } = await admin
    .from("identity_submissions")
    .select("status, provider, reviewed_at, rejection_reason")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Admin notes (notes/flags) — derived from admin_actions
  const adminNotes = (actions ?? [])
    .filter((a) => {
      const t = String(a.action_type ?? "");
      return t.includes("note") || t.includes("flag");
    })
    .map((a) => ({
      id: a.id,
      type: a.action_type,
      note: a.action_notes,
      admin_name: adminNames.get(a.admin_user_id as string) ?? "System",
      created_at: a.created_at,
      priority: String(a.action_type ?? "").includes("flag") ? "high" : "normal",
    }));

  // Verification progress (server-computed)
  const isSeller = (row.roles as string[]).some((r) => r === "seller" || r === "business");
  const emailOk = row.verification.email ? 1 : 0;
  const phoneOk = row.verification.phone ? 1 : 0;
  const idOk = row.verification.id ? 1 : 0;
  const amlOk = 0; // aml_screenings table not present → always 0
  const payoutOk = payout && String((payout as Record<string, unknown>).verification_status ?? "") === "verified" ? 1 : 0;
  const numerator = emailOk * 20 + phoneOk * 20 + idOk * 30 + amlOk * 20 + (isSeller ? payoutOk * 10 : 0);
  const denominator = isSeller ? 100 : 90;
  const progress_percent = Math.round((numerator / denominator) * 100);

  const available_actions = {
    can_flag: !row.is_flagged,
    can_unflag: !!row.is_flagged,
    can_suspend: !row.is_suspended,
    can_unsuspend: !!row.is_suspended,
    can_impersonate: false,
    can_review_payout: !!payout,
  };

  return json(200, {
    user: row,
    available_actions,
    recent_transactions: (txs ?? []).map((t) => {
      const pricing = (t as Record<string, unknown>).transaction_pricing as
        | { buyer_total_amount?: number | string | null }
        | Array<{ buyer_total_amount?: number | string | null }>
        | null;
      const pricingRow = Array.isArray(pricing) ? pricing[0] : pricing;
      return {
        transaction_id: t.id, transaction_code: t.transaction_code,
        amount: Number(pricingRow?.buyer_total_amount ?? 0),
        status: t.status, money_status: t.money_status,
        created_at: t.created_at,
        counterparty: t.buyer_id === userId ? "as_buyer" : "as_seller",
      };
    }),
    recent_disputes: (disp ?? []).map((d) => ({
      dispute_id: d.id, transaction_id: d.transaction_id, status: d.status,
      reason: d.reason, created_at: d.opened_at,
    })),
    timeline: [
      ...((actions ?? []).map((a) => ({
        id: `aa_${a.id}`, type: a.action_type as string, note: a.action_notes as string | null,
        admin_name: adminNames.get(a.admin_user_id as string) ?? "System",
        created_at: a.created_at as string,
        transaction_id: a.transaction_id as string | null, dispute_id: a.dispute_id as string | null,
        source: "admin_action" as const,
      }))),
      ...((audits ?? []).map((a) => ({
        id: `au_${a.id}`, type: a.action as string, note: (a.description as string | null) ?? null,
        admin_name: adminNames.get(a.actor_user_id as string) ?? "System",
        created_at: a.created_at as string,
        transaction_id: a.transaction_id as string | null, dispute_id: null,
        source: "audit" as const,
      }))),
      ...((txEvents ?? []).map((e) => ({
        id: `te_${e.id}`, type: e.event_type as string, note: null,
        admin_name: "System",
        created_at: e.occurred_at as string,
        transaction_id: e.transaction_id as string | null, dispute_id: null,
        source: "transaction_event" as const,
      }))),
    ]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 30),
    stats: {
      as_buyer: { count: buyerCount, volume: buyerVolume },
      as_seller: { count: sellerCount, volume: sellerVolume },
      disputes: {
        total: row.disputes.total,
        active: row.disputes.active,
        filed: disputesFiled,
        received: disputesReceived,
      },
    },
    payout_account: payout
      ? {
          bank_name: (payout as Record<string, unknown>).bank_name ?? null,
          account_name: (payout as Record<string, unknown>).account_name ?? null,
          masked_account_number: (payout as Record<string, unknown>).masked_account_number ?? null,
          status: (payout as Record<string, unknown>).verification_status ?? null,
          added_on: (payout as Record<string, unknown>).created_at ?? null,
        }
      : null,
    profile_extra: lastSession
      ? {
          last_login_at: (lastSession as Record<string, unknown>).last_seen_at ?? null,
          last_login_ip: (lastSession as Record<string, unknown>).ip_address ?? null,
          last_login_city: (lastSession as Record<string, unknown>).city_name ?? null,
          last_login_state: (lastSession as Record<string, unknown>).state_name ?? null,
          last_login_country: (lastSession as Record<string, unknown>).country_code ?? null,
        }
      : null,
    verification_detail: {
      email: row.verification.email,
      phone: row.verification.phone,
      identity_level: row.verification.id ? 2 : row.verification.id_status === "pending" ? 1 : 0,
      identity_provider: (idVerified as Record<string, unknown> | null)?.provider ?? null,
      identity_reviewed_at: (idVerified as Record<string, unknown> | null)?.reviewed_at ?? null,
      identity_rejection_reason: (idVerified as Record<string, unknown> | null)?.rejection_reason ?? null,
      bank_status: payout
        ? String((payout as Record<string, unknown>).verification_status ?? "pending")
        : "not_added",
      aml_status: "not_screened",
      aml_provider: null,
      aml_last_screened_at: null,
      address_status: idSub
        ? "provided"
        : "not_provided",
      address_line: (idSub as Record<string, unknown> | null)?.address_line ?? null,
      address_city: (idSub as Record<string, unknown> | null)?.city ?? null,
      address_state: (idSub as Record<string, unknown> | null)?.state ?? null,
      address_country: (idSub as Record<string, unknown> | null)?.country ?? null,
      progress_percent,
    },
    admin_notes: adminNotes,
  });
});