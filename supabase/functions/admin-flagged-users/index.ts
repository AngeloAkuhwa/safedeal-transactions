/**
 * Admin Flagged Users aggregator (read-only).
 * GET → returns summary + paginated user roll-ups derived from:
 *   - admin_actions (flag_user / freeze_transaction / escalate_case / flag_for_review)
 *   - transactions.needs_release_review / needs_admin_review (owner = buyer & seller)
 *   - disputes (multiple in 30d)
 *   - identity_submissions (rejected)
 *   - profiles.status (suspended/blocked)
 * Admin-only.
 */
import { requireAdmin, authErrorResponse } from "../_shared/auth.ts";

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

const DAY_MS = 24 * 60 * 60 * 1000;

type Reason =
  | "multiple_disputes"
  | "chargeback_pattern"
  | "identity_issues"
  | "suspicious_activity"
  | "fraud_detection"
  | "stuck_escrow"
  | "admin_flag";

type Risk = "critical" | "high" | "medium" | "low";
type FStatus = "active" | "under_review" | "suspended" | "resolved";

const REASON_LABEL: Record<Reason, string> = {
  multiple_disputes: "Multiple Disputes",
  chargeback_pattern: "Chargeback Pattern",
  identity_issues: "Identity Issues",
  suspicious_activity: "Suspicious Activity",
  fraud_detection: "Fraud Detection",
  stuck_escrow: "Stuck/Frozen Escrow",
  admin_flag: "Admin Flag",
};

interface UserAcc {
  user_id: string;
  reasons: Set<Reason>;
  disputes30d: number;
  refunds30d: number;
  identityRejected: boolean;
  adminFlags: number;
  lastTxId?: string;
  lastTxCode?: string;
  lastTxAmount?: number;
  totalEscrowAtRisk: number;
  lastSignalAt: number;
  flaggedByAdminId?: string | null;
  autoDetected: boolean;
  hasOpenCase: boolean;
  cleared: boolean;
}

function bump(acc: Map<string, UserAcc>, uid: string): UserAcc {
  let r = acc.get(uid);
  if (!r) {
    r = {
      user_id: uid,
      reasons: new Set(),
      disputes30d: 0,
      refunds30d: 0,
      identityRejected: false,
      adminFlags: 0,
      totalEscrowAtRisk: 0,
      lastSignalAt: 0,
      autoDetected: true,
      hasOpenCase: false,
      cleared: false,
    };
    acc.set(uid, r);
  }
  return r;
}

function deriveRisk(u: UserAcc): Risk {
  const signals = u.reasons.size;
  const amt = u.totalEscrowAtRisk;
  if (signals >= 3 || amt >= 1_000_000 || u.refunds30d >= 4) return "critical";
  if (signals >= 2 || amt >= 250_000 || u.disputes30d >= 3) return "high";
  if (signals >= 1 || u.disputes30d >= 1) return "medium";
  return "low";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET") return json(405, { error: "method_not_allowed" });

  let ctx;
  try {
    ctx = await requireAdmin(req);
  } catch (err) {
    const r = authErrorResponse(err, corsHeaders);
    if (r) return r;
    return json(500, { error: "auth_failed" });
  }
  const admin = ctx.adminClient;
  const url = new URL(req.url);

  const risk = url.searchParams.get("risk") ?? "all";
  const reasonFilter = url.searchParams.get("reason") ?? "all";
  const range = url.searchParams.get("range") ?? "30d";
  const statusFilter = url.searchParams.get("status") ?? "all";
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const sort = url.searchParams.get("sort") ?? "risk";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(100, Math.max(5, Number(url.searchParams.get("page_size") ?? "15") || 15));

  const now = Date.now();
  const since30 = new Date(now - 30 * DAY_MS).toISOString();
  const since7 = new Date(now - 7 * DAY_MS).toISOString();
  const todayStart = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").toISOString();
  const rangeCutoffIso =
    range === "today" ? todayStart
    : range === "7d" ? since7
    : range === "30d" ? since30
    : new Date(0).toISOString();

  const acc = new Map<string, UserAcc>();

  // 1) admin_actions → admin-flagged users
  const { data: adminActions } = await admin
    .from("admin_actions")
    .select("admin_user_id, target_user_id, action_type, transaction_id, created_at")
    .gte("created_at", rangeCutoffIso)
    .in("action_type", [
      "flag_user",
      "freeze_transaction",
      "escalate_case",
      "flag_for_review",
      "open_investigation",
      "unflag_user",
      "close_case",
    ])
    .order("created_at", { ascending: false })
    .limit(2000);

  // Track latest unflag/close per user for "resolved" state
  const lastResolution = new Map<string, number>();
  for (const a of adminActions ?? []) {
    if (!a.target_user_id) continue;
    const ts = new Date(a.created_at as string).getTime();
    const at = a.action_type as string;
    if (at === "unflag_user" || at === "close_case") {
      const prev = lastResolution.get(a.target_user_id as string) ?? 0;
      if (ts > prev) lastResolution.set(a.target_user_id as string, ts);
    }
  }

  for (const a of adminActions ?? []) {
    if (!a.target_user_id) continue;
    const at = a.action_type as string;
    if (at === "unflag_user" || at === "close_case") continue;
    const r = bump(acc, a.target_user_id as string);
    r.adminFlags++;
    r.autoDetected = false;
    if (at === "flag_user") r.reasons.add("admin_flag");
    if (at === "freeze_transaction") r.reasons.add("stuck_escrow");
    if (at === "escalate_case") r.reasons.add("suspicious_activity");
    if (at === "flag_for_review") r.reasons.add("admin_flag");
    if (at === "open_investigation") r.reasons.add("fraud_detection");
    const ts = new Date(a.created_at as string).getTime();
    if (ts > r.lastSignalAt) {
      r.lastSignalAt = ts;
      r.flaggedByAdminId = a.admin_user_id as string | null;
    }
  }

  // 2) transactions flagged for admin / release review → owners (buyer + seller)
  const { data: flaggedTx } = await admin
    .from("transactions")
    .select("id, transaction_code, buyer_id, seller_id, money_status, needs_admin_review, needs_release_review, updated_at")
    .or("needs_admin_review.eq.true,needs_release_review.eq.true")
    .gte("updated_at", rangeCutoffIso)
    .limit(2000);

  const txIds = (flaggedTx ?? []).map((t) => t.id as string);
  const escrowByTx = new Map<string, number>();
  if (txIds.length) {
    const { data: es } = await admin
      .from("escrow_states")
      .select("transaction_id, held_amount, frozen_amount")
      .in("transaction_id", txIds);
    for (const e of es ?? []) {
      escrowByTx.set(
        e.transaction_id as string,
        Number(e.held_amount ?? 0) + Number(e.frozen_amount ?? 0),
      );
    }
  }

  for (const t of flaggedTx ?? []) {
    const amt = escrowByTx.get(t.id as string) ?? 0;
    const ts = new Date(t.updated_at as string).getTime();
    for (const uid of [t.buyer_id, t.seller_id].filter(Boolean) as string[]) {
      const r = bump(acc, uid);
      r.reasons.add("suspicious_activity");
      if ((t.money_status as string) === "funds_frozen") r.reasons.add("stuck_escrow");
      r.totalEscrowAtRisk += amt;
      if (ts > r.lastSignalAt || !r.lastTxId) {
        r.lastSignalAt = Math.max(r.lastSignalAt, ts);
        r.lastTxId = t.id as string;
        r.lastTxCode = t.transaction_code as string;
        r.lastTxAmount = amt;
      }
    }
  }

  // 3) disputes (count per opener in 30d, flag if >=2)
  const { data: dList } = await admin
    .from("disputes")
    .select("opened_by_user_id, opened_at, status, transaction_id")
    .gte("opened_at", since30)
    .limit(5000);
  const disputeCount = new Map<string, number>();
  for (const d of dList ?? []) {
    if (!d.opened_by_user_id) continue;
    disputeCount.set(d.opened_by_user_id as string, (disputeCount.get(d.opened_by_user_id as string) ?? 0) + 1);
  }
  for (const [uid, count] of disputeCount) {
    if (count < 2) continue;
    const r = bump(acc, uid);
    r.disputes30d = count;
    r.reasons.add("multiple_disputes");
    if (count >= 4) r.reasons.add("chargeback_pattern");
  }

  // 4) refunds (chargeback pattern signal)
  const { data: refunds } = await admin
    .from("refunds")
    .select("buyer_id, created_at, status")
    .gte("created_at", since30)
    .in("status", ["completed", "processing", "approved"])
    .limit(5000);
  const refundCount = new Map<string, number>();
  for (const r of refunds ?? []) {
    const uid = (r as any).buyer_id as string | null;
    if (!uid) continue;
    refundCount.set(uid, (refundCount.get(uid) ?? 0) + 1);
  }
  for (const [uid, count] of refundCount) {
    if (count < 2) continue;
    const r = bump(acc, uid);
    r.refunds30d = count;
    r.reasons.add("chargeback_pattern");
  }

  // 5) identity rejected
  const { data: idSubs } = await admin
    .from("identity_submissions")
    .select("user_id, status, rejected_at, updated_at")
    .eq("status", "rejected")
    .gte("updated_at", rangeCutoffIso)
    .limit(2000);
  for (const s of idSubs ?? []) {
    if (!s.user_id) continue;
    const r = bump(acc, s.user_id as string);
    r.identityRejected = true;
    r.reasons.add("identity_issues");
    const ts = new Date((s.rejected_at ?? s.updated_at) as string).getTime();
    if (ts > r.lastSignalAt) r.lastSignalAt = ts;
  }

  // ---- Hydrate profiles ----
  const userIds = Array.from(acc.keys());
  const profiles = new Map<string, { id: string; full_name: string | null; email: string | null; avatar_url: string | null; status: string | null; created_at: string | null }>();
  if (userIds.length) {
    const { data: ps } = await admin
      .from("profiles")
      .select("id, full_name, email, avatar_url, status, created_at")
      .in("id", userIds);
    for (const p of ps ?? []) profiles.set(p.id as string, p as any);
  }

  // Admin name lookup for "flagged_by"
  const adminIds = Array.from(new Set(
    Array.from(acc.values()).map((u) => u.flaggedByAdminId).filter(Boolean) as string[],
  ));
  const adminMap = new Map<string, { name: string; avatar_url: string | null }>();
  if (adminIds.length) {
    const { data: ps } = await admin
      .from("profiles")
      .select("id, full_name, avatar_url")
      .in("id", adminIds);
    for (const p of ps ?? []) {
      adminMap.set(p.id as string, { name: (p.full_name as string) ?? "Admin", avatar_url: p.avatar_url as string | null });
    }
  }

  // Build rows
  type Row = {
    user_id: string;
    name: string;
    email: string | null;
    avatar_url: string | null;
    short_id: string;
    risk: Risk;
    reasons: { key: Reason; label: string }[];
    disputes_30d: number;
    refunds_30d: number;
    identity_rejected: boolean;
    auto_detected: boolean;
    related: {
      tx_code: string | null;
      tx_id: string | null;
      tx_amount: number;
      dispute_count: number;
    };
    escrow_at_risk: number;
    flagged_by: { name: string; avatar_url: string | null; is_system: boolean };
    flagged_at: string | null;
    status: FStatus;
  };

  const rows: Row[] = [];
  for (const u of acc.values()) {
    const p = profiles.get(u.user_id);
    // Skip ghost users with no profile + no signals beyond a single stale row.
    if (!p && u.reasons.size === 0) continue;

    const profileStatus = (p?.status as string | null) ?? "active";
    let s: FStatus = "active";
    if (profileStatus === "suspended" || profileStatus === "blocked") s = "suspended";
    else if ((lastResolution.get(u.user_id) ?? 0) >= u.lastSignalAt && u.lastSignalAt > 0) s = "resolved";
    else if (u.adminFlags > 0) s = "under_review";

    const fbId = u.flaggedByAdminId;
    const fbProfile = fbId ? adminMap.get(fbId) : undefined;
    const flagged_by = fbProfile
      ? { name: fbProfile.name, avatar_url: fbProfile.avatar_url, is_system: false }
      : { name: "Auto-Detection", avatar_url: null, is_system: true };

    rows.push({
      user_id: u.user_id,
      name: (p?.full_name as string) ?? "Unknown user",
      email: (p?.email as string) ?? null,
      avatar_url: (p?.avatar_url as string) ?? null,
      short_id: `USR-${u.user_id.slice(0, 8).toUpperCase()}`,
      risk: deriveRisk(u),
      reasons: Array.from(u.reasons).map((k) => ({ key: k, label: REASON_LABEL[k] })),
      disputes_30d: u.disputes30d,
      refunds_30d: u.refunds30d,
      identity_rejected: u.identityRejected,
      auto_detected: u.autoDetected,
      related: {
        tx_code: u.lastTxCode ?? null,
        tx_id: u.lastTxId ?? null,
        tx_amount: u.lastTxAmount ?? 0,
        dispute_count: u.disputes30d,
      },
      escrow_at_risk: u.totalEscrowAtRisk,
      flagged_by,
      flagged_at: u.lastSignalAt > 0 ? new Date(u.lastSignalAt).toISOString() : null,
      status: s,
    });
  }

  // ---- Summary ----
  const allRows = rows.slice();
  const summary = {
    total_flagged: allRows.filter((r) => r.status !== "resolved").length,
    high_risk: allRows.filter((r) => r.risk === "critical" || r.risk === "high").length,
    critical: allRows.filter((r) => r.risk === "critical").length,
    suspended: allRows.filter((r) => r.status === "suspended").length,
    cleared_this_week: allRows.filter(
      (r) => r.status === "resolved" && r.flagged_at && new Date(r.flagged_at).getTime() >= now - 7 * DAY_MS,
    ).length,
    auto_detected: allRows.filter((r) => r.auto_detected).length,
    delta: {
      flagged_today: allRows.filter(
        (r) => r.flagged_at && new Date(r.flagged_at).getTime() >= new Date(todayStart).getTime(),
      ).length,
      suspended_today: allRows.filter(
        (r) => r.status === "suspended" && r.flagged_at && new Date(r.flagged_at).getTime() >= new Date(todayStart).getTime(),
      ).length,
      cleared_today: allRows.filter(
        (r) => r.status === "resolved" && r.flagged_at && new Date(r.flagged_at).getTime() >= new Date(todayStart).getTime(),
      ).length,
    },
  };

  // ---- Filters ----
  let filtered = allRows;
  if (risk !== "all") filtered = filtered.filter((r) => r.risk === risk);
  if (statusFilter !== "all") filtered = filtered.filter((r) => r.status === statusFilter);
  if (reasonFilter !== "all") filtered = filtered.filter((r) => r.reasons.some((rr) => rr.key === reasonFilter));
  if (q) {
    filtered = filtered.filter((r) =>
      (r.name?.toLowerCase().includes(q)) ||
      (r.email?.toLowerCase().includes(q)) ||
      (r.short_id.toLowerCase().includes(q)) ||
      (r.related.tx_code?.toLowerCase().includes(q)),
    );
  }

  // ---- Sort ----
  const riskOrder: Record<Risk, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  filtered.sort((a, b) => {
    if (sort === "recent") {
      return (new Date(b.flagged_at ?? 0).getTime()) - (new Date(a.flagged_at ?? 0).getTime());
    }
    const d = riskOrder[a.risk] - riskOrder[b.risk];
    if (d !== 0) return d;
    return (new Date(b.flagged_at ?? 0).getTime()) - (new Date(a.flagged_at ?? 0).getTime());
  });

  const total = filtered.length;
  const sliced = filtered.slice((page - 1) * pageSize, page * pageSize);

  return json(200, {
    summary,
    rows: sliced,
    total,
    page,
    page_size: pageSize,
  });
});
