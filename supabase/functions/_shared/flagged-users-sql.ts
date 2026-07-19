/**
 * SQL-first flagged users pagination.
 * Delegates filtering / sorting / paging to the `admin_flagged_users_mv`
 * materialised cache via two RPCs; only hydrates admin flagger names for
 * the current page. Response shape matches the JS engine so
 * `admin-flagged-users/index.ts` and the client mapper are unchanged.
 */
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type Risk = "critical" | "high" | "medium" | "low";
type FStatus = "active" | "under_review" | "suspended" | "resolved";
type Reason =
  | "multiple_disputes" | "chargeback_pattern" | "identity_issues"
  | "suspicious_activity" | "fraud_detection" | "stuck_frozen_escrow" | "admin_flag";

const REASON_LABEL: Record<Reason, string> = {
  multiple_disputes: "Multiple Disputes",
  chargeback_pattern: "Chargeback Pattern",
  identity_issues: "Identity Issues",
  suspicious_activity: "Suspicious Activity",
  fraud_detection: "Fraud Detection",
  stuck_frozen_escrow: "Stuck/Frozen Escrow",
  admin_flag: "Admin Flag",
};

interface PageRow {
  user_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  role: string | null;
  is_suspended: boolean;
  score: number;
  risk_level: Risk;
  status: FStatus;
  reason_keys: Reason[] | null;
  admin_flag_count: number;
  escrow_at_risk: number | string | null;
  latest_tx_id: string | null;
  latest_tx_code: string | null;
  disputes_30d: number;
  latest_dispute_id: string | null;
  refunds_30d: number;
  identity_rejected: boolean;
  identity_reason: string | null;
  has_open_investigation: boolean;
  blocked_payouts: number;
  reversed_payouts: number;
  flagged_by_admin_id: string | null;
  auto_detected: boolean;
  last_signal_at: string | null;
  total_count: number | string;
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

function severityForReason(r: Reason, row: PageRow): Risk {
  switch (r) {
    case "admin_flag":
      return row.is_suspended ? "critical" : "high";
    case "stuck_frozen_escrow":
    case "identity_issues":
    case "fraud_detection":
    case "suspicious_activity":
      return "high";
    case "multiple_disputes":
      return row.disputes_30d >= 4 ? "critical" : "high";
    case "chargeback_pattern":
      return row.refunds_30d >= 4 ? "critical" : "high";
  }
}

function reasonDescription(r: Reason, row: PageRow): string {
  switch (r) {
    case "admin_flag":
      return row.is_suspended ? "User suspended by admin" : "Flagged by admin";
    case "stuck_frozen_escrow":
      return "Funds frozen pending review";
    case "suspicious_activity":
      return "Transaction or payout flagged for review";
    case "fraud_detection":
      return "Active investigation";
    case "multiple_disputes":
      return `${row.disputes_30d} disputes in 30 days`;
    case "chargeback_pattern":
      return `${row.refunds_30d} refunds/chargebacks in 30 days`;
    case "identity_issues":
      return row.identity_reason || "Identity submission rejected";
  }
}

export interface PageInput {
  q?: string;
  risk?: string;
  reason?: string;
  status?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}

export async function getFlaggedPage(admin: SupabaseClient, input: PageInput) {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, input.pageSize ?? 15));
  const offset = (page - 1) * pageSize;

  const { data, error } = await admin.rpc("admin_flagged_users_page", {
    p_search: input.q ?? null,
    p_risk: input.risk ?? "all",
    p_reason: input.reason ?? "all",
    p_status: input.status ?? "active",
    p_sort: input.sort ?? "risk",
    p_limit: pageSize,
    p_offset: offset,
  });
  if (error) throw error;

  const rowsRaw = (data ?? []) as PageRow[];
  const total = Number(rowsRaw[0]?.total_count ?? 0);

  // hydrate admin flagger names for this page only
  const adminIds = Array.from(new Set(
    rowsRaw.map((r) => r.flagged_by_admin_id).filter(Boolean) as string[],
  ));
  const adminMap = new Map<string, { name: string; avatar_url: string | null }>();
  if (adminIds.length) {
    const { data: ps } = await admin
      .from("profiles").select("id, full_name, avatar_url").in("id", adminIds);
    for (const p of ps ?? []) {
      adminMap.set(p.id as string, {
        name: (p.full_name as string) ?? "Admin",
        avatar_url: (p.avatar_url as string | null) ?? null,
      });
    }
  }

  const rows = rowsRaw.map((r) => {
    const reasonKeys = (r.reason_keys ?? []) as Reason[];
    const flag_reasons = reasonKeys.map((k) => ({
      key: k,
      label: REASON_LABEL[k],
      severity: severityForReason(k, r),
      description: reasonDescription(k, r),
    })).sort((a, b) => sevRank(b.severity) - sevRank(a.severity));

    const flaggedAt = r.last_signal_at ?? new Date().toISOString();
    const color: "red" | "orange" | "yellow" | "blue" =
      r.risk_level === "critical" ? "red" :
      r.risk_level === "high" ? "orange" :
      r.risk_level === "medium" ? "yellow" : "blue";
    const urgency_label = r.risk_level === "critical"
      ? "URGENT: Review within 6 hours" : undefined;

    const fb = r.flagged_by_admin_id ? adminMap.get(r.flagged_by_admin_id) : undefined;
    const flagged_by = fb
      ? { type: "admin" as const, admin_id: r.flagged_by_admin_id ?? undefined,
          admin_name: fb.name, admin_avatar_url: fb.avatar_url, label: fb.name }
      : { type: "system" as const, label: "Auto-Detection" };

    const escrow = Number(r.escrow_at_risk ?? 0);

    return {
      user_id: r.user_id,
      user: {
        id: r.user_id,
        display_id: `USR-${r.user_id.slice(0, 8).toUpperCase()}`,
        full_name: r.full_name || "Unknown user",
        email: r.email || "",
        phone: r.phone ?? null,
        avatar_url: r.avatar_url ?? null,
        role: (r.role as "buyer" | "seller" | "both" | null) ?? null,
        account_tier: null,
        is_suspended: r.is_suspended,
      },
      risk: { level: r.risk_level, score: r.score, color, urgency_label },
      status: r.status,
      flag_reasons,
      related_context: {
        latest_transaction_id: r.latest_tx_id ?? undefined,
        latest_transaction_code: r.latest_tx_code ?? undefined,
        latest_dispute_id: r.latest_dispute_id ?? undefined,
        latest_dispute_code: r.latest_dispute_id
          ? `DSP-${r.latest_dispute_id.slice(0, 8).toUpperCase()}` : undefined,
        amount_at_risk: escrow > 0 ? escrow : undefined,
        currency: "NGN" as const,
        disputes_30d: r.disputes_30d,
        refunds_30d: r.refunds_30d,
        chargebacks_30d: r.refunds_30d,
        frozen_or_held_amount: escrow > 0 ? escrow : undefined,
        identity_status: r.identity_rejected ? "rejected" : undefined,
        latest_signal_summary: flag_reasons[0]?.description,
      },
      flagged_by,
      flagged_at: flaggedAt,
      flagged_at_label: relativeLabel(flaggedAt),
      actions: {
        can_review: true,
        can_investigate: !r.has_open_investigation,
        can_suspend: !r.is_suspended,
        can_clear: (r.reason_keys?.length ?? 0) > 0 || r.admin_flag_count > 0,
        can_escalate: r.status !== "suspended" && r.status !== "under_review",
        can_add_note: true,
      },
      auto_detected: r.auto_detected,
      escrow_at_risk: escrow,
    };
  });

  return { rows, total, page, pageSize };
}

function sevRank(s: Risk): number {
  return s === "critical" ? 4 : s === "high" ? 3 : s === "medium" ? 2 : 1;
}

export async function getFlaggedSummary(admin: SupabaseClient) {
  const { data, error } = await admin.rpc("admin_flagged_users_summary");
  if (error) throw error;
  const s = (data ?? [])[0] ?? {};
  return {
    total_flagged: Number(s.total_flagged ?? 0),
    critical_risk: Number(s.critical_risk ?? 0),
    high_risk: Number(s.high_risk ?? 0),
    suspended: Number(s.suspended ?? 0),
    cleared_this_week: Number(s.cleared_this_week ?? 0),
    auto_detected: Number(s.auto_detected ?? 0),
    delta_today: {
      flagged: Number(s.today_flagged ?? 0),
      suspended: Number(s.today_suspended ?? 0),
      cleared: Number(s.today_cleared ?? 0),
    },
  };
}