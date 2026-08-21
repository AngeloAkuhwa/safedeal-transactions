/**
 * Admin User Detail (read-only). Backs the user-directory drawer.
 * GET ?user_id=<uuid> → profile + verification + tx/dispute summary + admin_actions timeline.
 */
import { requireAdmin, authErrorResponse , requirePermission} from "../_shared/auth.ts";
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
  const userId = url.searchParams.get("user_id");
  if (!userId) return json(400, { error: "user_id_required" });

  const all = await buildDirectory(admin);
  const row = all.find((r) => r.user_id === userId);
  if (!row) return json(404, { error: "user_not_found" });

  // Recent transactions (top 5)
  const { data: txs } = await admin
    .from("transactions")
    .select("id, transaction_code, status, money_status, created_at, buyer_id, seller_id, transaction_pricing(buyer_total_amount, currency_code)")
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

  // Recent login sessions
  const { data: sessions } = await admin
    .from("user_sessions")
    .select("id, created_at, ip_address, city_name, country_code")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);

  // Payout account history (create + update events)
  const { data: payouts } = await admin
    .from("payout_accounts")
    .select("id, bank_name, masked_account_number, verification_status, created_at, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(10);

  // Identity submission events
  const { data: idSubs } = await admin
    .from("identity_submissions")
    .select("id, status, provider, rejection_reason, created_at, reviewed_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);

  const adminIds = Array.from(new Set([
    ...((actions ?? []).map((a) => a.admin_user_id as string)),
    ...((audits ?? []).map((a) => a.actor_user_id as string)),
  ].filter(Boolean)));
  const adminNames = new Map<string, string>();
  if (adminIds.length) {
    const { data: aprofs } = await admin.from("profiles").select("id, full_name").in("id", adminIds);
    for (const p of aprofs ?? []) adminNames.set(p.id as string, (p.full_name as string) ?? "Admin");
  }

  // Map transaction_id → transaction_code for context lines
  const txCodeById = new Map<string, string>();
  for (const t of txs ?? []) txCodeById.set(t.id as string, (t.transaction_code as string) ?? "");

  // --- Additive blocks for the full-screen user detail page ---

  // Aggregate stats per role (buyer/seller volumes and counts)
  const { data: allTxAgg } = await admin
    .from("transactions")
    .select("id, buyer_id, seller_id, status, transaction_pricing(buyer_total_amount, currency_code)")
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`);

  let buyerCount = 0, sellerCount = 0, buyerVolume = 0, sellerVolume = 0;
  // Volumes are only meaningful in a single currency. Report one when every
  // priced transaction agrees, otherwise null so the UI renders an em dash.
  const statsCurrencies = new Set<string>();
  for (const t of allTxAgg ?? []) {
    const pricing = (t as Record<string, unknown>).transaction_pricing as
      | { buyer_total_amount?: number | string | null; currency_code?: string | null }
      | Array<{ buyer_total_amount?: number | string | null; currency_code?: string | null }>
      | null;
    const pricingRow = Array.isArray(pricing) ? pricing[0] : pricing;
    if (pricingRow?.currency_code) statsCurrencies.add(pricingRow.currency_code);
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

  // Admin notes (notes/flags): derived from admin_actions
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
        | { buyer_total_amount?: number | string | null; currency_code?: string | null }
        | Array<{ buyer_total_amount?: number | string | null; currency_code?: string | null }>
        | null;
      const pricingRow = Array.isArray(pricing) ? pricing[0] : pricing;
      return {
        transaction_id: t.id, transaction_code: t.transaction_code,
        amount: Number(pricingRow?.buyer_total_amount ?? 0),
        currency_code: pricingRow?.currency_code ?? null,
        status: t.status, money_status: t.money_status,
        created_at: t.created_at,
        counterparty: t.buyer_id === userId ? "as_buyer" : "as_seller",
      };
    }),
    recent_disputes: (disp ?? []).map((d) => ({
      dispute_id: d.id, transaction_id: d.transaction_id, status: d.status,
      reason: d.reason, created_at: d.opened_at,
    })),
    timeline: buildTimeline({
      actions: actions ?? [],
      audits: audits ?? [],
      txEvents: txEvents ?? [],
      sessions: sessions ?? [],
      payouts: payouts ?? [],
      idSubs: idSubs ?? [],
      txCodeById,
      adminNames,
    }),
    stats: {
      currency_code: statsCurrencies.size === 1 ? [...statsCurrencies][0] : null,
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

// ---------------- Humanized timeline builder ----------------

type TimelineItem = {
  id: string;
  type: string;
  title: string;
  context: string | null;
  note: string | null;
  admin_name: string;
  created_at: string;
  transaction_id: string | null;
  transaction_code: string | null;
  dispute_id: string | null;
  source: "admin_action" | "audit" | "transaction_event" | "session" | "payout" | "identity";
  severity: "high" | "warning" | "success" | "info" | "neutral";
};

function buildTimeline(input: {
  actions: Array<Record<string, unknown>>;
  audits: Array<Record<string, unknown>>;
  txEvents: Array<Record<string, unknown>>;
  sessions: Array<Record<string, unknown>>;
  payouts: Array<Record<string, unknown>>;
  idSubs: Array<Record<string, unknown>>;
  txCodeById: Map<string, string>;
  adminNames: Map<string, string>;
}): TimelineItem[] {
  const { actions, audits, txEvents, sessions, payouts, idSubs, txCodeById, adminNames } = input;
  const items: TimelineItem[] = [];
  const codeFor = (txId: unknown): string | null => {
    const id = typeof txId === "string" ? txId : null;
    if (!id) return null;
    return txCodeById.get(id) ?? null;
  };
  const withCode = (txId: unknown, suffix?: string): string | null => {
    const c = codeFor(txId);
    if (!c && !suffix) return null;
    if (!c) return suffix ?? null;
    return suffix ? `${c} · ${suffix}` : c;
  };

  // 1) Transaction events
  const TX_EVENT_MAP: Record<string, { title: string; severity: TimelineItem["severity"] }> = {
    transaction_created: { title: "Transaction created", severity: "info" },
    buyer_joined: { title: "Buyer joined transaction", severity: "info" },
    transaction_link_opened: { title: "Transaction link opened", severity: "neutral" },
    agreement_locked: { title: "Agreement locked", severity: "info" },
    payment_received: { title: "Payment received", severity: "success" },
    funds_held: { title: "Funds held in escrow", severity: "success" },
    verification_window_opened: { title: "Verification window opened", severity: "info" },
    seller_preparing_delivery: { title: "Seller preparing delivery", severity: "info" },
    seller_dispatched: { title: "Seller marked as dispatched", severity: "info" },
    delivered: { title: "Delivery confirmed", severity: "success" },
    buyer_confirmed: { title: "Buyer confirmed receipt", severity: "success" },
    payout_released: { title: "Funds released to seller", severity: "success" },
    refund_issued: { title: "Refund issued to buyer", severity: "warning" },
    auto_cancelled: { title: "Transaction auto-cancelled", severity: "warning" },
    dispute_opened: { title: "Dispute filed", severity: "warning" },
    dispute_resolved: { title: "Dispute resolved", severity: "success" },
    admin_funds_frozen: { title: "Admin froze transaction funds", severity: "high" },
    admin_funds_unfrozen: { title: "Admin unfroze transaction funds", severity: "info" },
    admin_note_added: { title: "Admin added internal note", severity: "neutral" },
    admin_investigation_opened: { title: "Investigation opened", severity: "high" },
    admin_investigation_updated: { title: "Investigation updated", severity: "warning" },
  };
  for (const e of txEvents) {
    const t = String(e.event_type ?? "");
    const m = TX_EVENT_MAP[t] ?? { title: t.replace(/_/g, " "), severity: "neutral" as const };
    items.push({
      id: `te_${e.id}`, type: t, title: m.title, context: codeFor(e.transaction_id), note: null,
      admin_name: "System",
      created_at: String(e.occurred_at ?? ""),
      transaction_id: (e.transaction_id as string) ?? null,
      transaction_code: codeFor(e.transaction_id),
      dispute_id: null,
      source: "transaction_event", severity: m.severity,
    });
  }

  // 2) Admin actions
  const ADMIN_ACTION_MAP: Record<string, { title: string; severity: TimelineItem["severity"] }> = {
    freeze_transaction: { title: "Admin froze transaction", severity: "high" },
    unfreeze_transaction: { title: "Admin unfroze transaction", severity: "info" },
    release_funds: { title: "Admin released funds", severity: "success" },
    add_internal_note: { title: "Admin added internal note", severity: "neutral" },
    escalate_case: { title: "Admin escalated case", severity: "high" },
    open_investigation: { title: "Admin opened investigation", severity: "high" },
    update_investigation: { title: "Admin updated investigation", severity: "warning" },
    resolve_dispute: { title: "Admin resolved dispute", severity: "success" },
  };
  for (const a of actions) {
    const t = String(a.action_type ?? "");
    const m = ADMIN_ACTION_MAP[t] ?? { title: `Admin ${t.replace(/_/g, " ")}`, severity: "info" as const };
    const adminName = adminNames.get(a.admin_user_id as string) ?? "Admin";
    items.push({
      id: `aa_${a.id}`, type: t, title: m.title,
      context: withCode(a.transaction_id, `by ${adminName}`),
      note: (a.action_notes as string | null) ?? null,
      admin_name: adminName,
      created_at: String(a.created_at ?? ""),
      transaction_id: (a.transaction_id as string) ?? null,
      transaction_code: codeFor(a.transaction_id),
      dispute_id: (a.dispute_id as string) ?? null,
      source: "admin_action", severity: m.severity,
    });
  }

  // 3) Audit logs (dedupe vs admin_actions by minute + transaction)
  const seen = new Set<string>();
  for (const it of items) seen.add(`${it.type}|${it.transaction_id ?? ""}|${it.created_at.slice(0, 16)}`);
  for (const a of audits) {
    const t = String(a.action ?? "").replace(/^admin_/, "");
    const key = `${t}|${(a.transaction_id as string) ?? ""}|${String(a.created_at ?? "").slice(0, 16)}`;
    if (seen.has(key)) continue;
    const adminName = adminNames.get(a.actor_user_id as string) ?? "Admin";
    items.push({
      id: `au_${a.id}`, type: String(a.action ?? ""), title: `Audit: ${t.replace(/_/g, " ")}`,
      context: withCode(a.transaction_id, `by ${adminName}`),
      note: (a.description as string | null) ?? null,
      admin_name: adminName,
      created_at: String(a.created_at ?? ""),
      transaction_id: (a.transaction_id as string) ?? null,
      transaction_code: codeFor(a.transaction_id),
      dispute_id: null,
      source: "audit", severity: "neutral",
    });
  }

  // 4) Sessions: Login events
  for (const s of sessions) {
    const ip = s.ip_address ? String(s.ip_address) : null;
    const city = (s.city_name as string | null) ?? null;
    const country = (s.country_code as string | null) ?? null;
    const loc = [city, country].filter(Boolean).join(", ");
    const ctxParts = [ip ? `IP: ${ip}` : null, loc || null].filter(Boolean) as string[];
    items.push({
      id: `ss_${s.id}`, type: "login", title: "Login from new device",
      context: ctxParts.join(" · ") || null, note: null,
      admin_name: "System",
      created_at: String(s.created_at ?? ""),
      transaction_id: null, transaction_code: null, dispute_id: null,
      source: "session", severity: "info",
    });
  }

  // 5) Payout accounts: add + update
  for (const p of payouts) {
    const bank = (p.bank_name as string | null) ?? "Bank";
    const mask = (p.masked_account_number as string | null) ?? "";
    const ctx = `${bank}${mask ? ` · ${mask}` : ""}`;
    items.push({
      id: `pa_add_${p.id}`, type: "payout_added", title: "Payout account added",
      context: ctx, note: null,
      admin_name: "System",
      created_at: String(p.created_at ?? ""),
      transaction_id: null, transaction_code: null, dispute_id: null,
      source: "payout", severity: "info",
    });
    const updated = String(p.updated_at ?? "");
    const created = String(p.created_at ?? "");
    if (updated && updated !== created) {
      items.push({
        id: `pa_upd_${p.id}`, type: "payout_updated", title: "Payout account updated",
        context: `${ctx} · status: ${(p.verification_status as string) ?? "pending"}`,
        note: null,
        admin_name: "System",
        created_at: updated,
        transaction_id: null, transaction_code: null, dispute_id: null,
        source: "payout", severity: "info",
      });
    }
  }

  // 6) Identity submissions
  for (const k of idSubs) {
    const status = String(k.status ?? "pending_review");
    const provider = (k.provider as string | null) ?? null;
    items.push({
      id: `id_sub_${k.id}`, type: "identity_submitted", title: "KYC verification submitted",
      context: provider ? `${provider} · pending review` : "pending review",
      note: null,
      admin_name: "System",
      created_at: String(k.created_at ?? ""),
      transaction_id: null, transaction_code: null, dispute_id: null,
      source: "identity", severity: "info",
    });
    if (k.reviewed_at) {
      const ok = status === "approved";
      const rejected = status === "rejected";
      items.push({
        id: `id_rev_${k.id}`, type: ok ? "identity_approved" : rejected ? "identity_rejected" : "identity_reviewed",
        title: ok ? "KYC verification approved" : rejected ? "KYC verification rejected" : "KYC verification reviewed",
        context: rejected ? ((k.rejection_reason as string | null) ?? "Rejected") : (provider ?? null),
        note: null,
        admin_name: "System",
        created_at: String(k.reviewed_at ?? ""),
        transaction_id: null, transaction_code: null, dispute_id: null,
        source: "identity", severity: ok ? "success" : rejected ? "high" : "info",
      });
    }
  }

  return items
    .filter((i) => !!i.created_at)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 30);
}