import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  mapTransactionStatus as sharedMapTx,
  mapMoneyStatus as sharedMapMoney,
  mapDisputeStatus as sharedMapDispute,
  mapEscrowState as sharedMapEscrow,
  mapPayoutStatus as sharedMapPayout,
  mapRiskLevel as sharedMapRisk,
  getLastActivity as sharedLastActivity,
} from "../_shared/admin-mappers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function errResponse(message: string, status = 500) {
  return jsonResponse({ error: message }, status);
}

/* ---------------- Types & enums ---------------- */
const ACTIVE_DISPUTE_STATUSES = ["open", "seller_response_pending", "under_review"] as const;

type QuickFilter =
  | "all"
  | "awaiting_payment"
  | "funds_held"
  | "in_dispute"
  | "overdue"
  | "refunded"
  | "failed"
  | "flagged"
  | "frozen";

interface MonitorParams {
  search?: string;
  transactionStatus?: string;
  moneyStatus?: string;
  disputeStatus?: string;
  riskLevel?: string;
  amountMin?: number;
  amountMax?: number;
  dateFrom?: string;
  dateTo?: string;
  quickFilter?: QuickFilter;
  page?: number;
  pageSize?: number;
  sortBy?:
    | "created_at"
    | "updated_at"
    | "transaction_code"
    | "amount"
    | "last_activity_at"
    | "status"
    | "risk_level"
    | "urgency";
  sortDirection?: "asc" | "desc";
}

/* ---------------- Status mapping ---------------- */
/* Local thin adapters: monitor uses the shared mapper's `short` form so the
   compact column copy ("Held", "Frozen") is preserved while the detail page
   uses the full `label` ("Held in Escrow", "Funds Frozen"). Both sides share
   the same `key` for consistency comparison. */
function mapTxStatus(s: string) {
  const r = sharedMapTx(s);
  return { key: r.key, label: r.short, tone: r.tone, raw: s, fullLabel: r.label };
}
function mapMoneyStatus(s: string) {
  const r = sharedMapMoney(s);
  return { key: r.key, label: r.short, tone: r.tone, raw: s, fullLabel: r.label };
}
function mapDisputeStatus(s: string) {
  const r = sharedMapDispute(s);
  return { key: r.key, label: r.short, tone: r.tone, raw: s, fullLabel: r.label };
}
function mapEscrowState(s: string | null) {
  const r = sharedMapEscrow(s);
  return { key: r.key, label: r.short, tone: r.tone, raw: s, fullLabel: r.label };
}

function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const idx = email.indexOf("@");
  if (idx <= 0) return email;
  const local = email.slice(0, idx);
  const domain = email.slice(idx);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${local.length > visible.length ? "***" : ""}${domain}`;
}

function relativeTimeLabel(iso: string | null) {
  return sharedLastActivity({ updatedAt: iso });
}

/* ---------------- Filter application ---------------- */
function applyFilters(
  qb: any,
  p: MonitorParams,
  failedTxIds: Set<string> | null,
  searchTxIds: Set<string> | null,
  riskTxIds: Set<string> | null,
  amountTxIds: Set<string> | null,
  riskLevelTxIds: Set<string> | null,
  riskLevelExcludeIds: Set<string> | null,
): any {
  let q = qb;

  // Search resolved upstream into searchTxIds (covers code, item title, party names/emails)
  if (p.search && p.search.trim()) {
    if (searchTxIds && searchTxIds.size > 0) {
      q = q.in("id", Array.from(searchTxIds));
    } else {
      q = q.eq("id", "00000000-0000-0000-0000-000000000000");
    }
  }

  // Quick filters
  switch (p.quickFilter) {
    case "awaiting_payment":
      q = q.eq("status", "awaiting_payment");
      break;
    case "funds_held":
      q = q.eq("money_status", "funds_held_in_escrow");
      break;
    case "in_dispute":
      q = q.in("dispute_status", ACTIVE_DISPUTE_STATUSES as unknown as string[]);
      break;
    case "overdue":
      // crude: stuck awaiting_payment > 24h
      q = q.eq("status", "awaiting_payment").lt("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
      break;
    case "refunded":
      q = q.in("money_status", ["refund_pending", "refund_issued"]);
      break;
    case "failed":
      if (failedTxIds && failedTxIds.size > 0) {
        q = q.in("id", Array.from(failedTxIds));
      } else {
        q = q.eq("id", "00000000-0000-0000-0000-000000000000");
      }
      break;
    case "flagged": {
      // Match any signal the Flags column can render:
      // needs_release_review, frozen money, active dispute, overdue awaiting_payment,
      // failed payments/payouts, admin freeze/escalate/flag actions, risky audit logs.
      const orParts: string[] = [
        "needs_release_review.eq.true",
        "money_status.eq.funds_frozen",
        `dispute_status.in.(${ACTIVE_DISPUTE_STATUSES.join(",")})`,
        `and(status.eq.awaiting_payment,created_at.lt.${new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()})`,
      ];
      if (riskTxIds && riskTxIds.size > 0) {
        const ids = Array.from(riskTxIds).slice(0, 1000).join(",");
        orParts.push(`id.in.(${ids})`);
      }
      q = q.or(orParts.join(","));
      break;
    }
    case "frozen":
      q = q.eq("money_status", "funds_frozen");
      break;
  }

  // Explicit filters
  if (p.transactionStatus) q = q.eq("status", p.transactionStatus);
  if (p.moneyStatus) q = q.eq("money_status", p.moneyStatus);
  if (p.disputeStatus) q = q.eq("dispute_status", p.disputeStatus);
  if (p.dateFrom) q = q.gte("created_at", p.dateFrom);
  if (p.dateTo) q = q.lte("created_at", p.dateTo);

  // Amount range (filtered via pre-resolved tx ids from transaction_pricing)
  if (amountTxIds) {
    if (amountTxIds.size === 0) {
      q = q.eq("id", "00000000-0000-0000-0000-000000000000");
    } else {
      q = q.in("id", Array.from(amountTxIds));
    }
  }

  // Risk level filter
  if (p.riskLevel) {
    if (p.riskLevel === "clean") {
      q = q
        .eq("needs_release_review", false)
        .neq("money_status", "funds_frozen")
        .not("dispute_status", "in", `(${ACTIVE_DISPUTE_STATUSES.join(",")})`);
      if (riskLevelExcludeIds && riskLevelExcludeIds.size > 0) {
        const ids = Array.from(riskLevelExcludeIds).slice(0, 5000).join(",");
        q = q.not("id", "in", `(${ids})`);
      }
    } else if (p.riskLevel === "escalated") {
      q = q
        .in("dispute_status", ACTIVE_DISPUTE_STATUSES as unknown as string[])
        .eq("needs_release_review", false)
        .neq("money_status", "funds_frozen");
    } else if (p.riskLevel === "high_risk" || p.riskLevel === "fraud_watch") {
      const orParts: string[] = ["needs_release_review.eq.true"];
      if (riskLevelTxIds && riskLevelTxIds.size > 0) {
        const ids = Array.from(riskLevelTxIds).slice(0, 5000).join(",");
        orParts.push(`id.in.(${ids})`);
      }
      q = q.or(orParts.join(","));
      if (p.riskLevel === "fraud_watch") {
        q = q.eq("money_status", "funds_frozen");
      } else {
        q = q.neq("money_status", "funds_frozen");
      }
    }
  }

  return q;
}

/* ---------------- Build payload ---------------- */
async function buildPayload(client: SupabaseClient, params: MonitorParams) {
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(params.pageSize ?? 25)));
  const requestedSort = params.sortBy ?? "urgency";
  const dbSortable = new Set(["created_at", "updated_at", "transaction_code", "status"]);
  const sortBy: "created_at" | "updated_at" | "transaction_code" | "status" =
    dbSortable.has(requestedSort)
      ? (requestedSort as "created_at" | "updated_at" | "transaction_code" | "status")
      : "created_at";
  const sortDirection = params.sortDirection === "asc" ? "asc" : "desc";

  // Pre-compute failed-payment tx ids if needed for quickFilter or row enrichment
  let failedTxIds: Set<string> | null = null;
  if (params.quickFilter === "failed") {
    const { data } = await client.from("payments").select("transaction_id").eq("status", "failed").limit(5000);
    failedTxIds = new Set((data ?? []).map((r: any) => r.transaction_id).filter(Boolean));
  }

  // Pre-compute risk-augmented tx ids for the "flagged" quick filter:
  // admin_actions (freeze/escalate/flag), recent risky audit_logs,
  // failed payments, failed payouts.
  let riskTxIds: Set<string> | null = null;
  if (params.quickFilter === "flagged") {
    const sinceIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const [adminActsRes, auditRes, failedPayRes, failedPayoutRes] = await Promise.all([
      client
        .from("admin_actions")
        .select("transaction_id, action_type")
        .in("action_type", ["freeze_funds", "escalate_case", "flag_for_review"])
        .not("transaction_id", "is", null)
        .limit(5000),
      client
        .from("audit_logs")
        .select("transaction_id, action, created_at")
        .gte("created_at", sinceIso)
        .not("transaction_id", "is", null)
        .limit(5000),
      client.from("payments").select("transaction_id").eq("status", "failed").limit(5000),
      client.from("payouts").select("transaction_id").eq("status", "failed").limit(5000),
    ]);
    riskTxIds = new Set<string>();
    for (const r of ((adminActsRes.data ?? []) as any[])) {
      if (r.transaction_id) riskTxIds.add(r.transaction_id);
    }
    for (const r of ((auditRes.data ?? []) as any[])) {
      if (r.transaction_id && typeof r.action === "string" && /(risk|fraud|suspicious|flag)/i.test(r.action)) {
        riskTxIds.add(r.transaction_id);
      }
    }
    for (const r of ((failedPayRes.data ?? []) as any[])) {
      if (r.transaction_id) riskTxIds.add(r.transaction_id);
    }
    for (const r of ((failedPayoutRes.data ?? []) as any[])) {
      if (r.transaction_id) riskTxIds.add(r.transaction_id);
    }
  }

  // Resolve search to a tx-id set (code + item title + party name/email)
  let searchTxIds: Set<string> | null = null;
  if (params.search && params.search.trim()) {
    const raw = params.search.trim();
    const s = raw.replace(/[%_]/g, "");
    const like = `%${s}%`;
    const digits = s.replace(/\D/g, "");
    const phoneOr = digits.length >= 3 ? `,phone.ilike.%${digits}%` : "";
    const [byCodeRes, byItemTitleRes, byItemCatRes, partyProfilesRes] = await Promise.all([
      client.from("transactions").select("id").ilike("transaction_code", like).limit(1000),
      client.from("transaction_items").select("transaction_id").ilike("title", like).limit(2000),
      client.from("transaction_items").select("transaction_id").ilike("category", like).limit(2000).then(
        (r: any) => r,
        () => ({ data: [] as any[] }),
      ),
      client
        .from("profiles")
        .select("id")
        .or(`full_name.ilike.${like},email.ilike.${like}${phoneOr}`)
        .limit(500),
    ]);
    const ids = new Set<string>();
    for (const r of ((byCodeRes.data ?? []) as any[])) if (r.id) ids.add(r.id);
    for (const r of ((byItemTitleRes.data ?? []) as any[])) if (r.transaction_id) ids.add(r.transaction_id);
    for (const r of ((byItemCatRes.data ?? []) as any[])) if (r.transaction_id) ids.add(r.transaction_id);
    const partyIds = ((partyProfilesRes.data ?? []) as any[]).map((r: any) => r.id).filter(Boolean);
    if (partyIds.length > 0) {
      const { data: partyTxRes } = await client
        .from("transactions")
        .select("id")
        .or(`buyer_id.in.(${partyIds.join(",")}),seller_id.in.(${partyIds.join(",")})`)
        .limit(2000);
      for (const r of ((partyTxRes ?? []) as any[])) if (r.id) ids.add(r.id);
    }
    searchTxIds = ids;
  }

  // Pre-compute amount-range tx ids via transaction_pricing
  let amountTxIds: Set<string> | null = null;
  if (typeof params.amountMin === "number" || typeof params.amountMax === "number") {
    let pq = client.from("transaction_pricing").select("transaction_id").limit(10000);
    if (typeof params.amountMin === "number") pq = pq.gte("buyer_total_amount", params.amountMin);
    if (typeof params.amountMax === "number") pq = pq.lte("buyer_total_amount", params.amountMax);
    const { data: amtRes } = await pq;
    amountTxIds = new Set<string>();
    for (const r of ((amtRes ?? []) as any[])) {
      if (r.transaction_id) amountTxIds.add(r.transaction_id);
    }
  }

  // Pre-compute risk-level tx ids when filtering by risk level
  let riskLevelTxIds: Set<string> | null = null;
  let riskLevelExcludeIds: Set<string> | null = null;
  if (params.riskLevel === "high_risk" || params.riskLevel === "fraud_watch" || params.riskLevel === "clean") {
    const sinceIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const [adminActsRes, auditRes] = await Promise.all([
      client
        .from("admin_actions")
        .select("transaction_id, action_type")
        .in("action_type", ["freeze_funds", "escalate_case", "flag_for_review"])
        .not("transaction_id", "is", null)
        .limit(5000),
      client
        .from("audit_logs")
        .select("transaction_id, action")
        .gte("created_at", sinceIso)
        .not("transaction_id", "is", null)
        .limit(5000),
    ]);
    const ids = new Set<string>();
    for (const r of ((adminActsRes.data ?? []) as any[])) if (r.transaction_id) ids.add(r.transaction_id);
    for (const r of ((auditRes.data ?? []) as any[])) {
      if (r.transaction_id && typeof r.action === "string" && /(risk|fraud|suspicious|flag)/i.test(r.action)) {
        ids.add(r.transaction_id);
      }
    }
    if (params.riskLevel === "clean") {
      riskLevelExcludeIds = ids;
    } else {
      riskLevelTxIds = ids;
    }
  }

  /* ---- Filtered transactions: list page + count ---- */
  let listQ = client
    .from("transactions")
    .select(
      "id, transaction_code, status, money_status, dispute_status, buyer_id, seller_id, needs_release_review, payment_received_at, completed_at, created_at, updated_at",
      { count: "exact" },
    );
  listQ = applyFilters(listQ, params, failedTxIds, searchTxIds, riskTxIds, amountTxIds, riskLevelTxIds, riskLevelExcludeIds);
  listQ = listQ
    .order(sortBy, { ascending: sortDirection === "asc" })
    .range((page - 1) * pageSize, page * pageSize - 1);
  const { data: txRows, count: totalCount, error: listErr } = await listQ;
  if (listErr) throw new Error(`tx_list_failed: ${listErr.message}`);

  const rows = (txRows ?? []) as any[];
  const txIds = rows.map((r) => r.id);

  /* ---- Side data for displayed rows ---- */
  const userIds = Array.from(new Set([
    ...rows.map((r) => r.buyer_id).filter(Boolean),
    ...rows.map((r) => r.seller_id).filter(Boolean),
  ]));

  const empty: any[] = [];
  const [
    itemsRes, pricingRes, escrowRes, disputesRes, msHistRes, eventsRes, paymentsRes, profilesRes,
    payoutsRes, statusHistRes, adminActsRowsRes, auditRowsRes, reviewQueueRes,
  ] = txIds.length === 0
    ? [
        { data: empty }, { data: empty }, { data: empty }, { data: empty },
        { data: empty }, { data: empty }, { data: empty }, { data: empty },
        { data: empty }, { data: empty }, { data: empty }, { data: empty }, { data: empty },
      ]
    : await Promise.all([
        client.from("transaction_items").select("transaction_id, title, condition_label, created_at").in("transaction_id", txIds),
        client.from("transaction_pricing").select("transaction_id, currency_code, item_amount, platform_fee_amount, payment_processing_fee_amount, seller_payout_amount, buyer_total_amount").in("transaction_id", txIds),
        client.from("escrow_states").select("transaction_id, state, held_amount, frozen_amount, released_amount, refunded_amount, last_changed_at").in("transaction_id", txIds),
        client.from("disputes").select("id, transaction_id, status, opened_at, seller_response_due_at").in("transaction_id", txIds),
        client.from("money_status_history").select("transaction_id, changed_at, new_status").in("transaction_id", txIds).order("changed_at", { ascending: false }).limit(2000),
        client.from("transaction_events").select("transaction_id, created_at, event_type").in("transaction_id", txIds).order("created_at", { ascending: false }).limit(2000),
        client.from("payments").select("transaction_id, status, created_at").in("transaction_id", txIds).order("created_at", { ascending: false }).limit(2000),
        userIds.length === 0
          ? Promise.resolve({ data: empty })
          : client.from("profiles").select("id, full_name, email").in("id", userIds),
        client.from("payouts").select("transaction_id, status, created_at, failure_reason").in("transaction_id", txIds).order("created_at", { ascending: false }).limit(2000),
        client.from("transaction_status_history").select("transaction_id, changed_at").in("transaction_id", txIds).order("changed_at", { ascending: false }).limit(2000),
        client.from("admin_actions").select("transaction_id, action_type, created_at").in("transaction_id", txIds).order("created_at", { ascending: false }).limit(2000),
        client.from("audit_logs").select("transaction_id, action, created_at").in("transaction_id", txIds).order("created_at", { ascending: false }).limit(2000),
        client.from("release_review_queue").select("transaction_id, status").in("transaction_id", txIds).limit(2000),
      ]);

  // Index helpers
  const itemsByTx = new Map<string, any>();
  for (const it of (itemsRes.data ?? []) as any[]) {
    if (!itemsByTx.has(it.transaction_id)) itemsByTx.set(it.transaction_id, it);
  }
  const pricingByTx = new Map<string, any>();
  for (const p of (pricingRes.data ?? []) as any[]) pricingByTx.set(p.transaction_id, p);
  const escrowByTx = new Map<string, any>();
  for (const e of (escrowRes.data ?? []) as any[]) escrowByTx.set(e.transaction_id, e);
  const disputesByTx = new Map<string, any[]>();
  for (const d of (disputesRes.data ?? []) as any[]) {
    const list = disputesByTx.get(d.transaction_id) ?? [];
    list.push(d);
    disputesByTx.set(d.transaction_id, list);
  }
  const lastMoneyChangeByTx = new Map<string, string>();
  for (const m of (msHistRes.data ?? []) as any[]) {
    if (!lastMoneyChangeByTx.has(m.transaction_id)) lastMoneyChangeByTx.set(m.transaction_id, m.changed_at);
  }
  const lastEventByTx = new Map<string, { created_at: string; event_type: string }>();
  for (const e of (eventsRes.data ?? []) as any[]) {
    if (!lastEventByTx.has(e.transaction_id)) lastEventByTx.set(e.transaction_id, e);
  }
  const lastPaymentByTx = new Map<string, any>();
  for (const p of (paymentsRes.data ?? []) as any[]) {
    if (!lastPaymentByTx.has(p.transaction_id)) lastPaymentByTx.set(p.transaction_id, p);
  }
  const profileById = new Map<string, any>();
  for (const p of (profilesRes.data ?? []) as any[]) profileById.set(p.id, p);

  // Payouts: latest + failed flag
  const lastPayoutByTx = new Map<string, any>();
  const hasFailedPayoutTx = new Set<string>();
  for (const p of ((payoutsRes.data ?? []) as any[])) {
    if (!lastPayoutByTx.has(p.transaction_id)) lastPayoutByTx.set(p.transaction_id, p);
    if (p.status === "failed") hasFailedPayoutTx.add(p.transaction_id);
  }
  // transaction_status_history: latest changed_at
  const lastStatusChangeByTx = new Map<string, string>();
  for (const s of ((statusHistRes.data ?? []) as any[])) {
    if (!lastStatusChangeByTx.has(s.transaction_id)) lastStatusChangeByTx.set(s.transaction_id, s.changed_at);
  }
  // admin_actions: freeze + escalate flags
  const adminFrozenTx = new Set<string>();
  const adminEscalatedTx = new Set<string>();
  for (const a of ((adminActsRowsRes.data ?? []) as any[])) {
    if (a.action_type === "freeze_funds") adminFrozenTx.add(a.transaction_id);
    if (a.action_type === "escalate_case") adminEscalatedTx.add(a.transaction_id);
  }
  // audit_logs: risk-tagged actions
  const riskFlaggedTx = new Set<string>();
  for (const a of ((auditRowsRes.data ?? []) as any[])) {
    if (typeof a.action === "string" && /(risk|fraud|suspicious|flag)/i.test(a.action)) {
      riskFlaggedTx.add(a.transaction_id);
    }
  }
  // release_review_queue: open queue
  const inReviewQueueTx = new Set<string>();
  const OPEN_QUEUE = new Set(["pending", "claimed", "processing", "awaiting_info", "held", "failed"]);
  for (const q of ((reviewQueueRes.data ?? []) as any[])) {
    if (q.status && OPEN_QUEUE.has(q.status)) inReviewQueueTx.add(q.transaction_id);
  }

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  const outRows = rows.map((t) => {
    const item = itemsByTx.get(t.id);
    const pricing = pricingByTx.get(t.id);
    const escrow = escrowByTx.get(t.id);
    const txDisputes = disputesByTx.get(t.id) ?? [];
    const activeDispute = txDisputes.find((d) => (ACTIVE_DISPUTE_STATUSES as readonly string[]).includes(d.status));
    const lastMoney = lastMoneyChangeByTx.get(t.id) ?? null;
    const lastEvt = lastEventByTx.get(t.id) ?? null;
    const lastPayment = lastPaymentByTx.get(t.id) ?? null;
    const lastStatus = lastStatusChangeByTx.get(t.id) ?? null;
    const lastPayout = lastPayoutByTx.get(t.id) ?? null;
    const buyer = t.buyer_id ? profileById.get(t.buyer_id) : null;
    const seller = t.seller_id ? profileById.get(t.seller_id) : null;

    const lastActivityCandidates = [t.updated_at, lastMoney, lastEvt?.created_at, lastStatus, lastPayout?.created_at]
      .filter(Boolean)
      .map((d) => new Date(d as string).getTime())
      .filter((n) => Number.isFinite(n));
    const lastActivityIso = lastActivityCandidates.length
      ? new Date(Math.max(...lastActivityCandidates)).toISOString()
      : t.updated_at;
    const last = relativeTimeLabel(lastActivityIso);

    const isOverdue =
      (activeDispute?.seller_response_due_at && new Date(activeDispute.seller_response_due_at).getTime() < now) ||
      (t.status === "awaiting_payment" && new Date(t.created_at).getTime() < now - day);
    const isFrozen = t.money_status === "funds_frozen" || adminFrozenTx.has(t.id);
    const isPayoutFailed = hasFailedPayoutTx.has(t.id);
    const isRiskFlagged = riskFlaggedTx.has(t.id);
    const isAdminEscalated = adminEscalatedTx.has(t.id);

    let riskLevel: "clean" | "escalated" | "high_risk" | "fraud_watch" = "clean";
    const flags: string[] = [];
    if ((t.needs_release_review || isAdminEscalated) && isFrozen) {
      riskLevel = "fraud_watch";
      flags.push("fraud_watch");
    } else if (t.needs_release_review || isRiskFlagged || isAdminEscalated) {
      riskLevel = "high_risk";
      flags.push("high_risk");
    } else if (activeDispute) {
      riskLevel = "escalated";
      flags.push("escalated");
    }
    if (isFrozen && !flags.includes("fraud_watch")) flags.push("frozen");
    if (isOverdue) flags.push("overdue");
    if (lastPayment?.status === "failed") flags.push("payment_failed");
    if (isPayoutFailed) flags.push("payout_failed");
    if (adminFrozenTx.has(t.id)) flags.push("admin_frozen");
    if (isRiskFlagged) flags.push("risk_flagged");

    const txStatus = mapTxStatus(t.status);
    const moneyStatus = mapMoneyStatus(t.money_status);
    const disputeStatus = mapDisputeStatus(t.dispute_status);
    const escrowStatus = mapEscrowState(escrow?.state ?? null);

    const amount = pricing ? Number(pricing.buyer_total_amount ?? 0) : 0;
    const protectionFee = pricing
      ? Number(pricing.platform_fee_amount ?? 0) + Number(pricing.payment_processing_fee_amount ?? 0)
      : 0;
    const sellerNet = pricing ? Number(pricing.seller_payout_amount ?? 0) : null;

    return {
      transactionId: t.id,
      transactionCode: t.transaction_code,
      createdAt: t.created_at,
      itemTitle: item?.title ?? "—",
      itemCategory: item?.condition_label ?? null,
      buyerName: buyer?.full_name || (buyer?.email ? buyer.email.split("@")[0] : "—"),
      buyerEmailMasked: maskEmail(buyer?.email ?? null),
      sellerName: seller?.full_name || (seller?.email ? seller.email.split("@")[0] : "—"),
      sellerEmailMasked: maskEmail(seller?.email ?? null),
      amount: Number(amount.toFixed(2)),
      protectionFee: Number(protectionFee.toFixed(2)),
      sellerNetAmount: sellerNet === null ? null : Number(sellerNet.toFixed(2)),
      currency: pricing?.currency_code ?? "NGN",
      transactionStatus: txStatus,
      moneyStatus,
      disputeStatus,
      escrowStatus,
      riskLevel,
      flags,
      lastActivityAt: last.iso,
      lastActivityLabel: last.label,
      lastActivityTone: last.tone,
      hasUnreadMessages: null,
      isOverdue: !!isOverdue,
      isFrozen,
      needsReleaseReview: !!t.needs_release_review,
      actionAvailability: (() => {
        const isTerminal = ["completed", "cancelled", "refunded", "timed_out"].includes(t.status);
        const canFreeze = t.money_status === "funds_held_in_escrow" && !isFrozen;
        const canUnfreeze = t.money_status === "funds_frozen";
        const canFlagForReview = !isTerminal;
        const hasActiveDispute = !!activeDispute;
        const isHighRisk = riskLevel === "high_risk" || riskLevel === "fraud_watch";
        const canEscalateDispute = hasActiveDispute || isHighRisk;
        let freezeReason: string | null = null;
        if (!canFreeze) {
          if (t.money_status === "funds_released") freezeReason = "Funds already released";
          else if (t.money_status === "refund_issued") freezeReason = "Funds already refunded";
          else if (isFrozen) freezeReason = "Already frozen";
          else freezeReason = "Transaction is not eligible for freeze";
        }
        let unfreezeReason: string | null = null;
        if (!canUnfreeze) unfreezeReason = "Transaction is not currently frozen";
        let flagReason: string | null = null;
        if (!canFlagForReview) flagReason = "Transaction is in a terminal state";
        let escalateReason: string | null = null;
        if (!canEscalateDispute) escalateReason = "No active dispute";
        return {
          canView: true,
          canViewNotes: true,
          canTrace: true,
          canFreeze,
          canUnfreeze,
          canFlagForReview,
          canEscalateDispute,
          canAddNote: true,
          canMore: true,
          freezeReason,
          unfreezeReason,
          flagReason,
          escalateReason,
        };
      })(),
    };
  });

  /* ---- Summary (filter scope, ignoring page) ---- */
  // Total count is already known.
  // For sums we need ALL filtered ids (chunked).
  let allIds: string[] = [];
  if ((totalCount ?? 0) > 0) {
    // Cap for safety
    const cap = 5000;
    const want = Math.min(totalCount ?? 0, cap);
    let from = 0;
    while (from < want) {
      const to = Math.min(from + 1000, want) - 1;
      let idsQ = client.from("transactions").select("id");
      idsQ = applyFilters(idsQ, params, failedTxIds, searchTxIds, riskTxIds);
      idsQ = idsQ.order(sortBy, { ascending: sortDirection === "asc" }).range(from, to);
      const { data: idRows, error: idErr } = await idsQ;
      if (idErr) break;
      allIds = allIds.concat(((idRows ?? []) as any[]).map((r) => r.id));
      from += 1000;
    }
  }

  let totalAmount = 0;
  let inEscrowAmount = 0;
  let inDisputeCount = 0;
  let flaggedCount = 0;
  let awaitingActionCount = 0;

  if (allIds.length) {
    // Sum buyer_total in chunks
    for (let i = 0; i < allIds.length; i += 1000) {
      const chunk = allIds.slice(i, i + 1000);
      const { data: pr } = await client
        .from("transaction_pricing")
        .select("buyer_total_amount")
        .in("transaction_id", chunk);
      for (const r of (pr ?? []) as any[]) totalAmount += Number(r.buyer_total_amount ?? 0);

      const { data: er } = await client
        .from("escrow_states")
        .select("held_amount, frozen_amount")
        .in("transaction_id", chunk);
      for (const r of (er ?? []) as any[]) {
        inEscrowAmount += Number(r.held_amount ?? 0) + Number(r.frozen_amount ?? 0);
      }

      const { count: disputeC } = await client
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .in("id", chunk)
        .in("dispute_status", ACTIVE_DISPUTE_STATUSES as unknown as string[]);
      inDisputeCount += disputeC ?? 0;

      // Pull risk + ops signals for this chunk in parallel
      const sinceIso = new Date(now - 30 * day).toISOString();
      const [stuckRes, queueRes, payoutFailedRes, overdueDispRes, adminActsChunkRes, auditChunkRes, paymentsFailedChunkRes] = await Promise.all([
        client.from("transactions").select("id, status, money_status, created_at, needs_release_review, dispute_status").in("id", chunk),
        client.from("release_review_queue").select("transaction_id, status").in("transaction_id", chunk).in("status", ["pending", "claimed", "processing", "awaiting_info", "held", "failed"]),
        client.from("payouts").select("transaction_id, status").in("transaction_id", chunk).eq("status", "failed"),
        client.from("disputes").select("transaction_id, seller_response_due_at, status").in("transaction_id", chunk).in("status", ACTIVE_DISPUTE_STATUSES as unknown as string[]).lt("seller_response_due_at", new Date(now).toISOString()),
        client.from("admin_actions").select("transaction_id, action_type").in("transaction_id", chunk).in("action_type", ["freeze_funds", "escalate_case"]),
        client.from("audit_logs").select("transaction_id, action").in("transaction_id", chunk).gte("created_at", sinceIso),
        client.from("payments").select("transaction_id, status").in("transaction_id", chunk).eq("status", "failed"),
      ]);

      const dayAgo = now - day;
      const flaggedSet = new Set<string>();
      const awaitingSet = new Set<string>();
      for (const r of ((stuckRes.data ?? []) as any[])) {
        if (r.needs_release_review) {
          flaggedSet.add(r.id);
          awaitingSet.add(r.id);
        }
        if (r.money_status === "funds_frozen") {
          flaggedSet.add(r.id);
        }
        if ((ACTIVE_DISPUTE_STATUSES as readonly string[]).includes(r.dispute_status)) {
          awaitingSet.add(r.id);
          flaggedSet.add(r.id);
        }
        if (r.status === "awaiting_payment" && new Date(r.created_at).getTime() < dayAgo) {
          awaitingSet.add(r.id);
          flaggedSet.add(r.id);
        }
      }
      for (const r of ((queueRes.data ?? []) as any[])) awaitingSet.add(r.transaction_id);
      for (const r of ((payoutFailedRes.data ?? []) as any[])) {
        awaitingSet.add(r.transaction_id);
        flaggedSet.add(r.transaction_id);
      }
      for (const r of ((overdueDispRes.data ?? []) as any[])) {
        awaitingSet.add(r.transaction_id);
        flaggedSet.add(r.transaction_id);
      }
      for (const r of ((paymentsFailedChunkRes.data ?? []) as any[])) {
        flaggedSet.add(r.transaction_id);
      }
      for (const r of ((adminActsChunkRes.data ?? []) as any[])) {
        flaggedSet.add(r.transaction_id);
        awaitingSet.add(r.transaction_id);
      }
      for (const r of ((auditChunkRes.data ?? []) as any[])) {
        if (typeof r.action === "string" && /(risk|fraud|suspicious|flag)/i.test(r.action)) {
          flaggedSet.add(r.transaction_id);
        }
      }
      flaggedCount += flaggedSet.size;
      awaitingActionCount += awaitingSet.size;
    }
  }

  // In-memory sort for non-DB-native keys
  const dir = sortDirection === "asc" ? 1 : -1;
  const cmp = (a: number, b: number) => (a === b ? 0 : a < b ? -1 : 1) * dir;
  const riskRank: Record<string, number> = { fraud_watch: 4, high_risk: 3, escalated: 2, clean: 1 };
  if (requestedSort === "amount") {
    outRows.sort((a, b) => cmp(a.amount, b.amount));
  } else if (requestedSort === "last_activity_at") {
    outRows.sort((a, b) => cmp(
      a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0,
      b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0,
    ));
  } else if (requestedSort === "risk_level") {
    outRows.sort((a, b) => cmp(riskRank[a.riskLevel] ?? 0, riskRank[b.riskLevel] ?? 0));
  } else if (requestedSort === "urgency") {
    const score = (r: any) => {
      let s = 0;
      if (r.disputeStatus.key && ["open", "awaiting_seller", "under_review"].includes(r.disputeStatus.key)) s += 1000;
      if (r.isFrozen) s += 500;
      if (r.riskLevel === "fraud_watch") s += 400;
      else if (r.riskLevel === "high_risk") s += 300;
      if (r.needsReleaseReview) s += 200;
      if (r.isOverdue) s += 100;
      if (r.flags?.includes("payment_failed") || r.flags?.includes("payout_failed")) s += 80;
      const t = r.lastActivityAt ? new Date(r.lastActivityAt).getTime() : 0;
      return s * 1e13 + t;
    };
    outRows.sort((a, b) => cmp(score(a), score(b)));
  }

  return {
    summary: {
      totalTransactions: totalCount ?? 0,
      totalAmount: Number(totalAmount.toFixed(2)),
      inEscrowAmount: Number(inEscrowAmount.toFixed(2)),
      inDisputeCount,
      awaitingActionCount,
      flaggedCount,
      currency: "NGN",
    },
    rows: outRows,
    pagination: {
      page,
      pageSize,
      totalCount: totalCount ?? 0,
      hasNextPage: page * pageSize < (totalCount ?? 0),
      hasPreviousPage: page > 1,
    },
  };
}

/* ---------------- Handler ---------------- */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return errResponse("Not authenticated", 401);
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = authHeader.replace("Bearer ", "");

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: userData, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !userData?.user) {
      return errResponse("Invalid session", 401);
    }
    const userId = userData.user.id;

    const { data: hasRole, error: roleError } = await adminClient.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (roleError || !hasRole) {
      return errResponse("Admin role required", 403);
    }

    let body: MonitorParams = {};
    if (req.method === "POST") {
      try {
        body = (await req.json()) ?? {};
      } catch {
        body = {};
      }
    }

    const payload = await buildPayload(adminClient, body);
    return jsonResponse(payload);
  } catch (e) {
    return errResponse(`Unexpected error: ${(e as Error).message}`, 500);
  }
});