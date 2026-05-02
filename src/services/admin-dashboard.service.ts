/**
 * Admin Dashboard service contract.
 *
 * Currently returns demo data so the polished prototype works end-to-end.
 * The shape of `AdminDashboardResponse` is the future edge function's
 * response contract — when the backend is wired, only `getAdminDashboard`
 * needs to switch from `Promise.resolve(DEMO)` to
 * `supabase.functions.invoke("admin-dashboard")`.
 *
 * MONEY ACCURACY RULES (ENFORCED — do not change without updating both
 * the edge function and this contract):
 *   - kpis.escrow_balance_amount = funds_held_in_escrow + funds_frozen ONLY.
 *     Never includes released or refunded amounts.
 *   - payout_health.pending_payouts_amount = funds_pending_release +
 *     payouts currently being processed. Never includes already paid-out
 *     amounts. Released funds live in a separate metric.
 *   - Refunded funds must already be subtracted from the held/frozen bucket
 *     by the edge function — the UI does no math on money values.
 *   - All money values are NGN minor->major (₦) and must be rendered via
 *     `formatMoney(value, "NGN")` so they show 2 decimal places.
 */

export type Severity = "blue" | "red" | "orange" | "purple" | "cyan" | "yellow" | "emerald";

export interface AdminKpis {
  total_transactions: number;
  total_transactions_delta_pct: number;
  /** Funds currently held + frozen in escrow. Excludes released, excludes refunded. */
  escrow_balance_amount: number;
  escrow_balance_delta_pct: number;
  active_users: number;
  active_users_delta_pct: number;
  flagged_activity: number;
  flagged_activity_delta_pct: number;
}

export interface AdminActionItem {
  key:
    | "awaiting_release"
    | "failed_payouts"
    | "disputes_needing_decision"
    | "stuck_transactions"
    | "identity_reviews_pending"
    | "webhook_recon_issues";
  label: string;
  count: number;
  severity: Severity;
  action_label: string;
  /** Route to navigate to. If `null`, the action shows a "Coming soon" toast. */
  action_href: string | null;
}

export interface TrendPoint {
  label: string;
  primary: number;
  secondary?: number;
  tertiary?: number;
}

export interface TrendSeries {
  primary_label: string;
  secondary_label?: string;
  tertiary_label?: string;
  points: TrendPoint[];
}

export interface AdminHotspot {
  key: "overdue_responses" | "frozen_escrow" | "flagged_today" | "stale_transactions";
  count: number;
  label: string;
  severity: Severity;
  action_label: string;
  action_href: string | null;
}

export interface DisputeSlaBuckets {
  due_soon: number;
  overdue: number;
  escalated: number;
  under_review: number;
}

export interface PaymentHealthRow {
  key: "successful" | "failed" | "webhook_failures" | "recon_mismatches";
  label: string;
  count: number;
  severity: Severity;
}

export interface IdentityHealth {
  pending_reviews: number;
  avg_review_hours: number;
  spark: number[];
}

export interface PayoutHealth {
  /** Funds awaiting release + currently processing. NEVER includes paid-out amounts. */
  pending_payouts_amount: number;
  avg_payout_hours: number;
  spark: number[];
}

export interface AuditComplianceSignal {
  last_audit_entry: { actor: string; summary: string; at_iso: string } | null;
  high_severity_actions_24h: number;
  impersonation_sessions_24h: number;
  failed_admin_logins_24h: number;
  compliance_status: "green" | "amber" | "red";
  compliance_last_check_iso: string;
}

export interface AdminAlert {
  id: string;
  title: string;
  description: string;
  severity: "red" | "yellow" | "blue";
  at_iso: string;
}

export interface AdminActivityItem {
  id: string;
  kind: "transaction_completed" | "escrow_released" | "user_registered";
  title: string;
  subtitle: string;
  at_iso: string;
}

export interface PerformanceMetric {
  key: string;
  label: string;
  value: string;
  delta_label: string;
  delta_direction: "up" | "down" | "flat";
  /** When true, an "up" delta is good (e.g. success rate). When false, "down" is good (e.g. processing time). */
  up_is_good: boolean;
}

export interface AdminDashboardResponse {
  kpis: AdminKpis;
  action_required: AdminActionItem[];
  trends: {
    transactions_vs_disputes: TrendSeries;
    escrow_releases_refunds: TrendSeries;
  };
  hotspots: AdminHotspot[];
  dispute_sla: DisputeSlaBuckets;
  payment_health: PaymentHealthRow[];
  identity_health: IdentityHealth;
  payout_health: PayoutHealth;
  audit_signal: AuditComplianceSignal;
  critical_alerts: AdminAlert[];
  recent_activity: AdminActivityItem[];
  performance: PerformanceMetric[];
  sidebar_badges: {
    disputes: number;
    identity: number;
    payouts: number;
    flagged_users: number;
    exports: number;
  };
}

const NOW = Date.now();
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

function buildTrend(days: number, basePrimary: number, baseSecondary: number): TrendSeries {
  const points: TrendPoint[] = Array.from({ length: days }).map((_, i) => {
    const t = i / Math.max(1, days - 1);
    const wave = Math.sin(i * 0.7) * 0.15;
    return {
      label: `D${i + 1}`,
      primary: Math.round(basePrimary * (0.7 + t * 0.5 + wave)),
      secondary: Math.round(baseSecondary * (0.6 + t * 0.4 - wave * 0.4)),
    };
  });
  return {
    primary_label: "Transactions",
    secondary_label: "Disputes",
    points,
  };
}

function buildEscrowTrend(): TrendSeries {
  const days = 30;
  const points: TrendPoint[] = Array.from({ length: days }).map((_, i) => {
    const wave = Math.cos(i * 0.5) * 0.1;
    return {
      label: `D${i + 1}`,
      primary: Math.round(120_000 * (0.85 + wave + i * 0.005)),
      secondary: Math.round(45_000 * (0.7 + wave * 0.5 + i * 0.004)),
      tertiary: Math.round(8_000 * (0.6 + Math.abs(wave))),
    };
  });
  return {
    primary_label: "Escrow Held",
    secondary_label: "Released",
    tertiary_label: "Refunded",
    points,
  };
}

const DEMO: AdminDashboardResponse = {
  kpis: {
    total_transactions: 24_583,
    total_transactions_delta_pct: 12.5,
    escrow_balance_amount: 124_890_000,
    escrow_balance_delta_pct: 8.2,
    active_users: 124_890,
    active_users_delta_pct: 2.1,
    flagged_activity: 1_248,
    flagged_activity_delta_pct: 15.3,
  },
  action_required: [
    {
      key: "awaiting_release",
      label: "Awaiting Release",
      count: 17,
      severity: "blue",
      action_label: "Open Release Queue",
      action_href: null,
    },
    {
      key: "failed_payouts",
      label: "Failed Payouts",
      count: 4,
      severity: "red",
      action_label: "Investigate",
      action_href: null,
    },
    {
      key: "disputes_needing_decision",
      label: "Disputes Needing Decision",
      count: 9,
      severity: "orange",
      action_label: "Decide",
      action_href: null,
    },
    {
      key: "stuck_transactions",
      label: "Stuck Transactions",
      count: 11,
      severity: "purple",
      action_label: "Review Queue",
      action_href: null,
    },
    {
      key: "identity_reviews_pending",
      label: "Identity Reviews Pending",
      count: 47,
      severity: "cyan",
      action_label: "Open Reviews",
      action_href: null,
    },
    {
      key: "webhook_recon_issues",
      label: "Webhook & Reconciliation",
      count: 11,
      severity: "yellow",
      action_label: "Investigate",
      action_href: null,
    },
  ],
  trends: {
    transactions_vs_disputes: buildTrend(7, 420, 28),
    escrow_releases_refunds: buildEscrowTrend(),
  },
  hotspots: [
    { key: "overdue_responses", count: 23, label: "Overdue Responses", severity: "orange", action_label: "Review Now", action_href: null },
    { key: "frozen_escrow", count: 8, label: "Frozen Escrow", severity: "red", action_label: "Investigate", action_href: null },
    { key: "flagged_today", count: 12, label: "Flagged Today", severity: "yellow", action_label: "View Users", action_href: null },
    { key: "stale_transactions", count: 34, label: "Stale Transactions", severity: "purple", action_label: "Take Action", action_href: null },
  ],
  dispute_sla: { due_soon: 18, overdue: 7, escalated: 3, under_review: 12 },
  payment_health: [
    { key: "successful", label: "Successful Payments", count: 23_891, severity: "emerald" },
    { key: "failed", label: "Failed Payments", count: 142, severity: "red" },
    { key: "webhook_failures", label: "Webhook Failures", count: 8, severity: "orange" },
    { key: "recon_mismatches", label: "Reconciliation Mismatches", count: 3, severity: "yellow" },
  ],
  identity_health: { pending_reviews: 47, avg_review_hours: 2.4, spark: [10, 14, 12, 18, 22, 17, 24, 21, 28] },
  payout_health: { pending_payouts_amount: 18_200, avg_payout_hours: 6.2, spark: [4, 6, 5, 7, 9, 8, 10, 7, 9] },
  audit_signal: {
    last_audit_entry: { actor: "ops.admin", summary: "Released funds for TX-AB81", at_iso: minutesAgo(3) },
    high_severity_actions_24h: 4,
    impersonation_sessions_24h: 1,
    failed_admin_logins_24h: 2,
    compliance_status: "green",
    compliance_last_check_iso: hoursAgo(6),
  },
  critical_alerts: [
    { id: "a1", title: "Escrow Balance Alert", description: "Balance below threshold for 3 days", severity: "red", at_iso: hoursAgo(2) },
    { id: "a2", title: "Dispute Queue Overflow", description: "32 disputes pending resolution", severity: "yellow", at_iso: hoursAgo(1) },
  ],
  recent_activity: [
    { id: "r1", kind: "transaction_completed", title: "Transaction Completed", subtitle: "User 1234567890 — ₦249.99", at_iso: minutesAgo(2) },
    { id: "r2", kind: "escrow_released", title: "Escrow Released", subtitle: "User 9876543210 — ₦124.99", at_iso: minutesAgo(15) },
    { id: "r3", kind: "user_registered", title: "New User Registered", subtitle: "User 5555555555 — Premium Plan", at_iso: hoursAgo(1) },
  ],
  performance: [
    { key: "tx_success", label: "Transaction Success Rate", value: "99.8%", delta_label: "+0.2% from last month", delta_direction: "up", up_is_good: true },
    { key: "avg_processing", label: "Average Processing Time", value: "2.3s", delta_label: "-0.5s from last month", delta_direction: "down", up_is_good: false },
    { key: "dau", label: "Daily Active Users", value: "12,489", delta_label: "+1.2% from last month", delta_direction: "up", up_is_good: true },
    { key: "dispute_res", label: "Dispute Resolution Time", value: "48h", delta_label: "+2h from last month", delta_direction: "up", up_is_good: false },
  ],
  sidebar_badges: { disputes: 12, identity: 8, payouts: 3, flagged_users: 5, exports: 2 },
};

export async function getAdminDashboard(): Promise<AdminDashboardResponse> {
  // Simulate network so loading skeletons are visible.
  await new Promise((r) => setTimeout(r, 200));
  return DEMO;
}

/** Build a fresh trend series for the chosen window without re-fetching everything. */
export function buildTransactionsDisputesTrend(window: "7D" | "30D" | "90D"): TrendSeries {
  const days = window === "7D" ? 7 : window === "30D" ? 30 : 90;
  return buildTrend(days, 420, 28);
}