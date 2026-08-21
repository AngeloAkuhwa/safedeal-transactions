/**
 * Mini fraud engine: shared aggregation & risk scoring.
 * Pure functions over a service-role Supabase client.
 */
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export type Risk = "critical" | "high" | "medium" | "low";
export type FStatus = "active" | "under_review" | "suspended" | "resolved";
export type Reason =
  | "multiple_disputes"
  | "chargeback_pattern"
  | "identity_issues"
  | "suspicious_activity"
  | "fraud_detection"
  | "stuck_frozen_escrow"
  | "admin_flag";

export interface Signal {
  key: string;
  reason: Reason;
  label: string;
  severity: Risk;
  score_impact: number;
  source_type: string;
  source_id?: string;
  description: string;
  detected_at: string;
  is_active: boolean;
}

export interface UserAcc {
  user_id: string;
  signals: Signal[];
  reasons: Set<Reason>;
  reasonDetails: Map<Reason, { count: number; description: string; severity: Risk }>;
  disputes30d: number;
  refunds30d: number;
  identityRejected: boolean;
  identityRejectionReason?: string;
  adminFlags: number;
  lastTxId?: string;
  lastTxCode?: string;
  lastTxAmount?: number;
  lastDisputeId?: string;
  lastDisputeCode?: string;
  totalEscrowAtRisk: number;
  lastSignalAt: number;
  flaggedByAdminId?: string | null;
  autoDetected: boolean;
  hasOpenInvestigation: boolean;
  hasOpenCaseReview: boolean;
  clearedAt: number;
  suspendedByAdmin: boolean;
  escalated: boolean;
}

export const REASON_LABEL: Record<Reason, string> = {
  multiple_disputes: "Multiple Disputes",
  chargeback_pattern: "Chargeback Pattern",
  identity_issues: "Identity Issues",
  suspicious_activity: "Suspicious Activity",
  fraud_detection: "Fraud Detection",
  stuck_frozen_escrow: "Stuck/Frozen Escrow",
  admin_flag: "Admin Flag",
};

const SIGNAL_WEIGHTS: Record<string, number> = {
  admin_flag: 20,
  freeze_transaction: 35,
  escalate_case: 40,
  suspend_user: 60,
  multiple_disputes: 25,
  chargeback_pattern: 35,
  identity_issues: 25,
  suspicious_activity: 20,
  fraud_detection: 30,
  stuck_frozen_escrow: 25,
  needs_release_review: 20,
  needs_admin_review: 20,
  active_investigation: 30,
  blocked_payout: 20,
  reversed_payout: 35,
};

const DAY_MS = 24 * 60 * 60 * 1000;

function bump(acc: Map<string, UserAcc>, uid: string): UserAcc {
  let r = acc.get(uid);
  if (!r) {
    r = {
      user_id: uid, signals: [], reasons: new Set(), reasonDetails: new Map(),
      disputes30d: 0, refunds30d: 0, identityRejected: false, adminFlags: 0,
      totalEscrowAtRisk: 0, lastSignalAt: 0, autoDetected: true,
      hasOpenInvestigation: false, hasOpenCaseReview: false, clearedAt: 0,
      suspendedByAdmin: false, escalated: false,
    };
    acc.set(uid, r);
  }
  return r;
}

function addReason(u: UserAcc, key: Reason, severity: Risk, description: string, count = 1) {
  u.reasons.add(key);
  const prev = u.reasonDetails.get(key);
  if (!prev || sev(severity) > sev(prev.severity)) {
    u.reasonDetails.set(key, { count, description, severity });
  } else if (count > prev.count) {
    u.reasonDetails.set(key, { ...prev, count });
  }
}

function sev(s: Risk): number {
  return s === "critical" ? 4 : s === "high" ? 3 : s === "medium" ? 2 : 1;
}

function rangeCutoff(range: string): string {
  const now = Date.now();
  if (range === "today") return new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").toISOString();
  if (range === "7d") return new Date(now - 7 * DAY_MS).toISOString();
  if (range === "30d") return new Date(now - 30 * DAY_MS).toISOString();
  return new Date(0).toISOString(); // all_time / custom
}

function computeRisk(u: UserAcc): { score: number; level: Risk; color: "red" | "orange" | "yellow" | "blue"; urgency_label?: string } {
  let score = 0;
  for (const s of u.signals) score += s.score_impact;
  if (u.totalEscrowAtRisk >= 1_000_000) score += 20;
  else if (u.totalEscrowAtRisk >= 500_000) score += 15;
  else if (u.totalEscrowAtRisk >= 100_000) score += 10;
  const ageMs = Date.now() - u.lastSignalAt;
  if (u.lastSignalAt > 0 && ageMs <= DAY_MS) score += 10;
  else if (u.lastSignalAt > 0 && ageMs <= 7 * DAY_MS) score += 5;
  if (u.suspendedByAdmin) score = Math.max(score, 80);
  if (score > 100) score = 100;

  const level: Risk = score >= 80 ? "critical" : score >= 55 ? "high" : score >= 30 ? "medium" : "low";
  const color = level === "critical" ? "red" : level === "high" ? "orange" : level === "medium" ? "yellow" : "blue";
  const urgency_label = level === "critical" ? "URGENT: Review within 6 hours" : undefined;
  return { score, level, color, urgency_label };
}

function deriveStatus(u: UserAcc): FStatus {
  if (u.suspendedByAdmin) return "suspended";
  if (u.escalated || u.hasOpenInvestigation || u.hasOpenCaseReview) return "under_review";
  // resolved only when the latest clear happened after the latest auto-signal AND no live reasons remain
  if (u.clearedAt > 0 && u.clearedAt >= u.lastSignalAt && u.reasons.size === 0) return "resolved";
  return "active";
}

export interface Row {
  user: {
    id: string; display_id: string; full_name: string; email: string;
    phone: string | null; avatar_url: string | null;
    role: "buyer" | "seller" | "both" | null;
    account_tier: string | null; is_suspended: boolean;
  };
  risk: { level: Risk; score: number; color: "red" | "orange" | "yellow" | "blue"; urgency_label?: string };
  status: FStatus;
  flag_reasons: Array<{ key: Reason; label: string; severity: Risk; count?: number; description?: string }>;
  related_context: {
    latest_transaction_id?: string;
    latest_transaction_code?: string;
    latest_dispute_id?: string;
    latest_dispute_code?: string;
    amount_at_risk?: number;
    currency: "NGN";
    disputes_30d: number;
    refunds_30d: number;
    chargebacks_30d?: number;
    frozen_or_held_amount?: number;
    identity_status?: string;
    latest_signal_summary?: string;
  };
  flagged_by: {
    type: "admin" | "system";
    admin_id?: string; admin_name?: string; admin_avatar_url?: string | null; label: string;
  };
  flagged_at: string;
  flagged_at_label: string;
  actions: {
    can_review: boolean; can_investigate: boolean; can_suspend: boolean;
    can_clear: boolean; can_escalate: boolean; can_add_note: boolean;
  };
  // legacy / convenience
  user_id: string;
  auto_detected: boolean;
  escrow_at_risk: number;
}

function relativeLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} day${d === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" });
}

export async function buildRows(admin: SupabaseClient, range: string): Promise<Row[]> {
  const cutoffIso = rangeCutoff(range);
  const since30 = new Date(Date.now() - 30 * DAY_MS).toISOString();
  const acc = new Map<string, UserAcc>();

  // 1) admin_actions
  const { data: adminActions } = await admin
    .from("admin_actions")
    .select("id, admin_user_id, target_user_id, action_type, transaction_id, dispute_id, action_notes, created_at")
    .gte("created_at", cutoffIso)
    .order("created_at", { ascending: false })
    .limit(3000);

  for (const a of adminActions ?? []) {
    const uid = a.target_user_id as string | null;
    if (!uid) continue;
    const at = a.action_type as string;
    const ts = new Date(a.created_at as string).getTime();
    const u = bump(acc, uid);

    if (at === "unflag_user" || at === "clear_flag" || at === "close_case") {
      if (ts > u.clearedAt) u.clearedAt = ts;
      continue;
    }
    if (at === "unsuspend_user") {
      u.suspendedByAdmin = false;
      continue;
    }

    u.adminFlags++;
    u.autoDetected = false;
    if (ts > u.lastSignalAt) { u.lastSignalAt = ts; u.flaggedByAdminId = a.admin_user_id as string | null; }

    if (at === "flag_user" || at === "flag_for_review") {
      addReason(u, "admin_flag", "high", a.action_notes ? String(a.action_notes).slice(0, 120) : "Flagged by admin");
      u.signals.push({ key: "admin_flag", reason: "admin_flag", label: "Admin Flag", severity: "high",
        score_impact: SIGNAL_WEIGHTS.admin_flag, source_type: "admin_action", source_id: a.id as string,
        description: a.action_notes ? String(a.action_notes) : "Flagged by admin",
        detected_at: a.created_at as string, is_active: true });
    } else if (at === "freeze_transaction") {
      addReason(u, "stuck_frozen_escrow", "high", "Funds frozen by admin");
      u.signals.push({ key: "freeze_transaction", reason: "stuck_frozen_escrow", label: "Funds frozen",
        severity: "high", score_impact: SIGNAL_WEIGHTS.freeze_transaction, source_type: "transaction",
        source_id: (a.transaction_id as string) ?? undefined, description: "Escrow frozen pending review",
        detected_at: a.created_at as string, is_active: true });
    } else if (at === "escalate_case") {
      u.escalated = true;
      addReason(u, "suspicious_activity", "high", "Case escalated for review");
      u.signals.push({ key: "escalate_case", reason: "suspicious_activity", label: "Escalated",
        severity: "high", score_impact: SIGNAL_WEIGHTS.escalate_case, source_type: "admin_action",
        source_id: a.id as string, description: a.action_notes ? String(a.action_notes) : "Escalated for review",
        detected_at: a.created_at as string, is_active: true });
    } else if (at === "suspend_user") {
      u.suspendedByAdmin = true;
      addReason(u, "admin_flag", "critical", "User suspended by admin");
      u.signals.push({ key: "suspend_user", reason: "admin_flag", label: "Suspended", severity: "critical",
        score_impact: SIGNAL_WEIGHTS.suspend_user, source_type: "admin_action", source_id: a.id as string,
        description: a.action_notes ? String(a.action_notes) : "Account suspended",
        detected_at: a.created_at as string, is_active: true });
    } else if (at === "open_investigation") {
      addReason(u, "fraud_detection", "high", "Investigation opened");
      u.signals.push({ key: "open_investigation", reason: "fraud_detection", label: "Investigation",
        severity: "high", score_impact: SIGNAL_WEIGHTS.active_investigation, source_type: "investigation",
        source_id: a.id as string, description: "Active investigation",
        detected_at: a.created_at as string, is_active: true });
    }
  }

  // 2) flagged transactions
  const { data: flaggedTx } = await admin
    .from("transactions")
    .select("id, transaction_code, buyer_id, seller_id, money_status, needs_admin_review, needs_release_review, release_review_reason, admin_review_reason, updated_at")
    .or("needs_admin_review.eq.true,needs_release_review.eq.true,money_status.eq.funds_frozen")
    .limit(3000);

  const txIds = (flaggedTx ?? []).map((t) => t.id as string);
  const escrowByTx = new Map<string, number>();
  if (txIds.length) {
    const { data: es } = await admin
      .from("escrow_states")
      .select("transaction_id, held_amount, frozen_amount")
      .in("transaction_id", txIds);
    for (const e of es ?? []) {
      escrowByTx.set(e.transaction_id as string,
        Number(e.held_amount ?? 0) + Number(e.frozen_amount ?? 0));
    }
  }

  for (const t of flaggedTx ?? []) {
    const amt = escrowByTx.get(t.id as string) ?? 0;
    const ts = new Date(t.updated_at as string).getTime();
    const frozen = (t.money_status as string) === "funds_frozen";
    const reasonText = (t.admin_review_reason ?? t.release_review_reason) as string | null;
    for (const uid of [t.buyer_id, t.seller_id].filter(Boolean) as string[]) {
      const u = bump(acc, uid);
      if (frozen) {
        addReason(u, "stuck_frozen_escrow", "high", `Funds frozen on ${t.transaction_code ?? "transaction"}`);
        u.signals.push({ key: "stuck_frozen_escrow", reason: "stuck_frozen_escrow",
          label: "Stuck/Frozen Escrow", severity: "high",
          score_impact: SIGNAL_WEIGHTS.stuck_frozen_escrow, source_type: "transaction",
          source_id: t.id as string, description: reasonText ?? "Escrow frozen",
          detected_at: t.updated_at as string, is_active: true });
      } else if (t.needs_admin_review) {
        addReason(u, "suspicious_activity", "medium", reasonText ?? "Transaction needs admin review");
        u.signals.push({ key: "needs_admin_review", reason: "suspicious_activity",
          label: "Needs admin review", severity: "medium",
          score_impact: SIGNAL_WEIGHTS.needs_admin_review, source_type: "transaction",
          source_id: t.id as string, description: reasonText ?? "Flagged for admin review",
          detected_at: t.updated_at as string, is_active: true });
      } else if (t.needs_release_review) {
        addReason(u, "suspicious_activity", "medium", reasonText ?? "Pending release review");
        u.signals.push({ key: "needs_release_review", reason: "suspicious_activity",
          label: "Release review", severity: "medium",
          score_impact: SIGNAL_WEIGHTS.needs_release_review, source_type: "transaction",
          source_id: t.id as string, description: reasonText ?? "Pending release review",
          detected_at: t.updated_at as string, is_active: true });
      }
      u.totalEscrowAtRisk += amt;
      if (ts > u.lastSignalAt || !u.lastTxId) {
        u.lastSignalAt = Math.max(u.lastSignalAt, ts);
        u.lastTxId = t.id as string;
        u.lastTxCode = t.transaction_code as string;
        u.lastTxAmount = amt;
      }
    }
  }

  // 3) disputes (always 30d window)
  const { data: dList } = await admin
    .from("disputes")
    .select("id, transaction_id, opened_by_user_id, opened_at, status")
    .gte("opened_at", since30)
    .limit(5000);

  const txToParticipants = new Map<string, { buyer: string | null; seller: string | null; code: string | null }>();
  const dispTxIds = Array.from(new Set((dList ?? []).map((d) => d.transaction_id as string).filter(Boolean)));
  if (dispTxIds.length) {
    const { data: ts } = await admin
      .from("transactions").select("id, buyer_id, seller_id, transaction_code").in("id", dispTxIds);
    for (const t of ts ?? []) {
      txToParticipants.set(t.id as string,
        { buyer: t.buyer_id as string | null, seller: t.seller_id as string | null, code: t.transaction_code as string | null });
    }
  }

  const disputeCountAgainst = new Map<string, number>();
  for (const d of dList ?? []) {
    const tx = txToParticipants.get(d.transaction_id as string);
    if (!tx) continue;
    // count disputes against seller (most common fraud signal)
    if (tx.seller && d.opened_by_user_id !== tx.seller) {
      disputeCountAgainst.set(tx.seller, (disputeCountAgainst.get(tx.seller) ?? 0) + 1);
    }
    // also against buyer if seller-initiated
    if (tx.buyer && d.opened_by_user_id === tx.seller) {
      disputeCountAgainst.set(tx.buyer, (disputeCountAgainst.get(tx.buyer) ?? 0) + 1);
    }
  }

  for (const [uid, count] of disputeCountAgainst) {
    if (count < 2) continue;
    const u = bump(acc, uid);
    u.disputes30d = count;
    const sev: Risk = count >= 4 ? "critical" : "high";
    addReason(u, "multiple_disputes", sev, `${count} disputes in 30 days`, count);
    u.signals.push({ key: "multiple_disputes", reason: "multiple_disputes",
      label: "Multiple disputes", severity: sev,
      score_impact: SIGNAL_WEIGHTS.multiple_disputes + (count >= 4 ? 10 : 0),
      source_type: "disputes", description: `${count} disputes in last 30 days`,
      detected_at: new Date().toISOString(), is_active: true });
    // attach latest dispute id
    const latest = (dList ?? [])
      .filter((d) => {
        const tx = txToParticipants.get(d.transaction_id as string);
        return tx && (tx.seller === uid || tx.buyer === uid);
      })
      .sort((a, b) => new Date(b.opened_at as string).getTime() - new Date(a.opened_at as string).getTime())[0];
    if (latest) {
      u.lastDisputeId = latest.id as string;
      u.lastDisputeCode = `DSP-${(latest.id as string).slice(0, 8).toUpperCase()}`;
    }
  }

  // 4) refunds (chargeback pattern, always 30d)
  const { data: refunds } = await admin
    .from("refunds")
    .select("buyer_id, created_at, status")
    .gte("created_at", since30)
    .limit(5000);
  const refundCount = new Map<string, number>();
  for (const r of refunds ?? []) {
    const uid = (r as Record<string, unknown>).buyer_id as string | null;
    if (!uid) continue;
    refundCount.set(uid, (refundCount.get(uid) ?? 0) + 1);
  }
  for (const [uid, count] of refundCount) {
    if (count < 2) continue;
    const u = bump(acc, uid);
    u.refunds30d = count;
    const sev: Risk = count >= 4 ? "critical" : "high";
    addReason(u, "chargeback_pattern", sev, `${count} refunds/chargebacks in 30 days`, count);
    u.signals.push({ key: "chargeback_pattern", reason: "chargeback_pattern",
      label: "Chargeback pattern", severity: sev,
      score_impact: SIGNAL_WEIGHTS.chargeback_pattern,
      source_type: "refunds", description: `${count} refunds in 30 days`,
      detected_at: new Date().toISOString(), is_active: true });
  }

  // 5) identity rejected
  const { data: idSubs } = await admin
    .from("identity_submissions")
    .select("id, user_id, status, rejected_at, updated_at, rejection_reason")
    .eq("status", "rejected")
    .gte("updated_at", cutoffIso)
    .limit(2000);
  for (const s of idSubs ?? []) {
    if (!s.user_id) continue;
    const u = bump(acc, s.user_id as string);
    u.identityRejected = true;
    u.identityRejectionReason = (s.rejection_reason as string) ?? undefined;
    addReason(u, "identity_issues", "high", "Identity submission rejected");
    u.signals.push({ key: "identity_issues", reason: "identity_issues",
      label: "Identity rejected", severity: "high",
      score_impact: SIGNAL_WEIGHTS.identity_issues, source_type: "identity_submission",
      source_id: s.id as string,
      description: (s.rejection_reason as string) ?? "Identity verification rejected",
      detected_at: (s.rejected_at ?? s.updated_at) as string, is_active: true });
    const ts = new Date((s.rejected_at ?? s.updated_at) as string).getTime();
    if (ts > u.lastSignalAt) u.lastSignalAt = ts;
  }

  // 6) active investigations
  const { data: invs } = await admin
    .from("admin_investigations")
    .select("id, transaction_id, status, opened_by_user_id, opened_at")
    .in("status", ["open", "under_review", "escalated"])
    .limit(2000);
  const invTxIds = Array.from(new Set((invs ?? []).map((i) => i.transaction_id as string).filter(Boolean)));
  const invTxOwners = new Map<string, { buyer: string | null; seller: string | null }>();
  if (invTxIds.length) {
    const { data: ts } = await admin.from("transactions").select("id, buyer_id, seller_id").in("id", invTxIds);
    for (const t of ts ?? []) invTxOwners.set(t.id as string,
      { buyer: t.buyer_id as string | null, seller: t.seller_id as string | null });
  }
  for (const i of invs ?? []) {
    const owners = invTxOwners.get(i.transaction_id as string);
    if (!owners) continue;
    for (const uid of [owners.buyer, owners.seller].filter(Boolean) as string[]) {
      const u = bump(acc, uid);
      u.hasOpenInvestigation = true;
      addReason(u, "fraud_detection", "high", "Active investigation");
      u.signals.push({ key: "active_investigation", reason: "fraud_detection",
        label: "Active investigation", severity: "high",
        score_impact: SIGNAL_WEIGHTS.active_investigation, source_type: "investigation",
        source_id: i.id as string, description: `Investigation ${i.status}`,
        detected_at: i.opened_at as string, is_active: true });
      const ts = new Date(i.opened_at as string).getTime();
      if (ts > u.lastSignalAt) u.lastSignalAt = ts;
    }
  }

  // 7) blocked / reversed payouts
  const { data: badPayouts } = await admin
    .from("payouts")
    .select("id, seller_id, status, failure_reason, updated_at")
    .in("status", ["blocked", "reversed"])
    .limit(2000);
  for (const p of badPayouts ?? []) {
    const uid = p.seller_id as string | null;
    if (!uid) continue;
    const u = bump(acc, uid);
    const isReversed = (p.status as string) === "reversed";
    addReason(u, "suspicious_activity", "high", isReversed ? "Payout reversed" : "Payout blocked");
    u.signals.push({
      key: isReversed ? "reversed_payout" : "blocked_payout",
      reason: "suspicious_activity",
      label: isReversed ? "Reversed payout" : "Blocked payout",
      severity: "high",
      score_impact: isReversed ? SIGNAL_WEIGHTS.reversed_payout : SIGNAL_WEIGHTS.blocked_payout,
      source_type: "payout", source_id: p.id as string,
      description: (p.failure_reason as string) ?? "",
      detected_at: p.updated_at as string, is_active: true,
    });
  }

  // 8) profile suspended (independent source of truth)
  const userIds = Array.from(acc.keys());
  const profiles = new Map<string, { id: string; full_name: string | null; email: string | null;
    avatar_url: string | null; status: string | null; phone: string | null;
    default_role: string | null; created_at: string | null }>();
  if (userIds.length) {
    const { data: ps } = await admin
      .from("profiles")
      .select("id, public_user_id, full_name, email, avatar_url, status, phone, default_role, created_at")
      .in("id", userIds);
    for (const p of ps ?? []) profiles.set(p.id as string, p as never);
  }
  for (const [uid, p] of profiles) {
    if ((p.status as string) === "suspended" || (p.status as string) === "blocked") {
      const u = bump(acc, uid);
      u.suspendedByAdmin = true;
    }
  }

  // Admin name lookup
  const adminIds = Array.from(new Set(
    Array.from(acc.values()).map((u) => u.flaggedByAdminId).filter(Boolean) as string[],
  ));
  const adminMap = new Map<string, { name: string; avatar_url: string | null }>();
  if (adminIds.length) {
    const { data: ps } = await admin
      .from("profiles").select("id, full_name, avatar_url").in("id", adminIds);
    for (const p of ps ?? []) adminMap.set(p.id as string,
      { name: (p.full_name as string) ?? "Admin", avatar_url: p.avatar_url as string | null });
  }

  // Build rows
  const rows: Row[] = [];
  for (const u of acc.values()) {
    const p = profiles.get(u.user_id);
    if (!p && u.reasons.size === 0 && !u.suspendedByAdmin) continue;
    if (u.reasons.size === 0 && !u.suspendedByAdmin && !u.hasOpenInvestigation) continue;

    const risk = computeRisk(u);
    const status = deriveStatus(u);
    const fbProfile = u.flaggedByAdminId ? adminMap.get(u.flaggedByAdminId) : undefined;
    const flagged_by = fbProfile
      ? { type: "admin" as const, admin_id: u.flaggedByAdminId ?? undefined,
          admin_name: fbProfile.name, admin_avatar_url: fbProfile.avatar_url, label: fbProfile.name }
      : { type: "system" as const, label: "Auto-Detection" };

    const isSuspended = u.suspendedByAdmin || (p?.status as string) === "suspended" || (p?.status as string) === "blocked";
    const flaggedAtIso = u.lastSignalAt > 0 ? new Date(u.lastSignalAt).toISOString() : new Date().toISOString();

    const flag_reasons = Array.from(u.reasons).map((k) => {
      const detail = u.reasonDetails.get(k);
      return { key: k, label: REASON_LABEL[k], severity: detail?.severity ?? "medium" as Risk,
        count: detail?.count, description: detail?.description };
    }).sort((a, b) => sev(b.severity) - sev(a.severity));

    const latestSignal = u.signals.sort((a, b) =>
      new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime())[0];

    rows.push({
      user_id: u.user_id,
      user: {
        id: u.user_id,
        display_id: String((p as Record<string, unknown> | undefined)?.public_user_id ?? ""),
        full_name: (p?.full_name as string) ?? "Unknown user",
        email: (p?.email as string) ?? "",
        phone: (p?.phone as string) ?? null,
        avatar_url: (p?.avatar_url as string) ?? null,
        role: (p?.default_role as "buyer" | "seller" | "both" | null) ?? null,
        account_tier: null,
        is_suspended: isSuspended,
      },
      risk,
      status,
      flag_reasons,
      related_context: {
        latest_transaction_id: u.lastTxId,
        latest_transaction_code: u.lastTxCode,
        latest_dispute_id: u.lastDisputeId,
        latest_dispute_code: u.lastDisputeCode,
        amount_at_risk: u.totalEscrowAtRisk > 0 ? u.totalEscrowAtRisk : undefined,
        currency: "NGN",
        disputes_30d: u.disputes30d,
        refunds_30d: u.refunds30d,
        chargebacks_30d: u.refunds30d,
        frozen_or_held_amount: u.totalEscrowAtRisk > 0 ? u.totalEscrowAtRisk : undefined,
        identity_status: u.identityRejected ? "rejected" : undefined,
        latest_signal_summary: latestSignal?.description,
      },
      flagged_by,
      flagged_at: flaggedAtIso,
      flagged_at_label: relativeLabel(flaggedAtIso),
      actions: {
        can_review: true,
        can_investigate: !u.hasOpenInvestigation,
        can_suspend: !isSuspended,
        can_clear: u.reasons.size > 0 || u.adminFlags > 0,
        can_escalate: !u.escalated && status !== "suspended",
        can_add_note: true,
      },
      auto_detected: u.autoDetected,
      escrow_at_risk: u.totalEscrowAtRisk,
    });
  }

  return rows;
}

export function summarize(rows: Row[]) {
  const todayStart = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").getTime();
  const weekAgo = Date.now() - 7 * DAY_MS;
  const total_flagged = rows.filter((r) => r.status !== "resolved").length;
  const critical_risk = rows.filter((r) => r.risk.level === "critical" && r.status !== "resolved").length;
  const high_risk = rows.filter((r) => (r.risk.level === "critical" || r.risk.level === "high") && r.status !== "resolved").length;
  const suspended = rows.filter((r) => r.status === "suspended").length;
  const cleared_this_week = rows.filter((r) =>
    r.status === "resolved" && new Date(r.flagged_at).getTime() >= weekAgo).length;
  const auto_detected = rows.filter((r) => r.flagged_by.type === "system" && r.status !== "resolved").length;
  const todayFlagged = rows.filter((r) => new Date(r.flagged_at).getTime() >= todayStart).length;
  const todaySuspended = rows.filter((r) => r.status === "suspended" && new Date(r.flagged_at).getTime() >= todayStart).length;
  const todayCleared = rows.filter((r) => r.status === "resolved" && new Date(r.flagged_at).getTime() >= todayStart).length;

  return {
    total_flagged, critical_risk, high_risk, suspended, cleared_this_week, auto_detected,
    delta_today: { flagged: todayFlagged, suspended: todaySuspended, cleared: todayCleared },
  };
}

export function applyFilters(rows: Row[], f: { risk: string; reason: string; status: string; q: string }): Row[] {
  let out = rows;
  if (f.status === "active") out = out.filter((r) => r.status === "active");
  else if (f.status !== "all") out = out.filter((r) => r.status === f.status);
  if (f.risk !== "all") out = out.filter((r) => r.risk.level === f.risk);
  if (f.reason !== "all") out = out.filter((r) => r.flag_reasons.some((rr) => rr.key === f.reason));
  if (f.q) {
    const q = f.q.toLowerCase();
    out = out.filter((r) =>
      r.user.full_name.toLowerCase().includes(q) ||
      r.user.email.toLowerCase().includes(q) ||
      (r.user.phone ?? "").toLowerCase().includes(q) ||
      r.user.display_id.toLowerCase().includes(q) ||
      r.user.id.toLowerCase().includes(q) ||
      (r.related_context.latest_transaction_code ?? "").toLowerCase().includes(q) ||
      (r.related_context.latest_dispute_code ?? "").toLowerCase().includes(q),
    );
  }
  return out;
}

export function sortRows(rows: Row[], sort: string) {
  const order: Record<Risk, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  rows.sort((a, b) => {
    if (sort === "recent") return new Date(b.flagged_at).getTime() - new Date(a.flagged_at).getTime();
    const d = order[a.risk.level] - order[b.risk.level];
    if (d !== 0) return d;
    if (b.risk.score !== a.risk.score) return b.risk.score - a.risk.score;
    return new Date(b.flagged_at).getTime() - new Date(a.flagged_at).getTime();
  });
}

export function recommendationFor(level: Risk): string {
  switch (level) {
    case "critical": return "Immediate review required. Consider suspension while investigation is active.";
    case "high": return "Review recent transactions and disputes before allowing payout or new high-value activity.";
    case "medium": return "Monitor activity and verify identity before clearing.";
    default: return "Low severity signal. Review context and clear if no issue is found.";
  }
}