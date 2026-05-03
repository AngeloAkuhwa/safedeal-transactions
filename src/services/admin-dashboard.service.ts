/**
 * Admin Dashboard service contract.
 *
 * Data source: `admin-dashboard` edge function (database-driven).
 * No demo/hardcoded values are produced here.
 *
 * MONEY ACCURACY RULES (ENFORCED — do not change without updating both
 * the edge function and this contract):
 *   - kpis.escrow_balance_amount = funds_held_in_escrow + funds_frozen ONLY.
 *   - payout_health.pending_payouts_amount = funds awaiting release / processing.
 *   - All money values are NGN and rendered via `formatMoney(value, "NGN")`.
 */

import { supabase } from "@/integrations/supabase/client";

export type Severity = "blue" | "red" | "orange" | "purple" | "cyan" | "yellow" | "emerald";

export interface AdminKpis {
  total_transactions: number;
  total_transactions_delta_pct: number;
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
  avg_review_hours: number | null;
  spark: number[];
}

export interface PayoutHealth {
  pending_payouts_amount: number;
  avg_payout_hours: number | null;
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

export class AdminAccessRequiredError extends Error {
  constructor() {
    super("Admin access required");
    this.name = "AdminAccessRequiredError";
  }
}

export async function getAdminDashboard(): Promise<AdminDashboardResponse> {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session;

  if (!session) {
    if (typeof window !== "undefined") {
      window.location.replace("/auth");
    }
    return new Promise<AdminDashboardResponse>(() => {});
  }

  const { data, error } = await supabase.functions.invoke<AdminDashboardResponse>(
    "admin-dashboard",
    {
      headers: { Authorization: `Bearer ${session.access_token}` },
    },
  );

  if (error) {
    const ctx = (error as unknown as { context?: Response }).context;
    const status = ctx?.status;

    if (status === 401) {
      if (typeof window !== "undefined") {
        window.location.replace("/auth");
      }
      return new Promise<AdminDashboardResponse>(() => {});
    }
    if (status === 403) {
      throw new AdminAccessRequiredError();
    }
    throw error;
  }

  if (!data) {
    throw new Error("Empty admin dashboard response");
  }
  return data;
}

/**
 * Empty trend series used as a placeholder while the edge function does not
 * yet compute windowed trends. The frontend MUST NOT synthesize data — when
 * the edge function adds windowed trend support, this helper will call it.
 */
export function buildTransactionsDisputesTrend(_window: "7D" | "30D" | "90D"): TrendSeries {
  return {
    primary_label: "Transactions",
    secondary_label: "Disputes",
    points: [],
  };
}
