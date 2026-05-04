/**
 * Admin Transactions Monitor service.
 * Data source: `admin-transactions-monitor` edge function (database-driven).
 */
import { supabase } from "@/integrations/supabase/client";

export type AdminTxRiskLevel = "clean" | "escalated" | "high_risk" | "fraud_watch";

export interface AdminTxStatusLabel {
  key: string;
  label: string;
}

export interface AdminTxRow {
  transactionId: string;
  transactionCode: string;
  createdAt: string;
  itemTitle: string;
  itemCategory: string | null;
  buyerName: string;
  buyerEmailMasked: string | null;
  sellerName: string;
  sellerEmailMasked: string | null;
  amount: number;
  protectionFee: number;
  sellerNetAmount: number | null;
  currency: string;
  transactionStatus: AdminTxStatusLabel;
  moneyStatus: AdminTxStatusLabel;
  disputeStatus: AdminTxStatusLabel;
  escrowStatus: AdminTxStatusLabel;
  riskLevel: AdminTxRiskLevel;
  flags: string[];
  lastActivityAt: string | null;
  lastActivityLabel: string;
  lastActivityTone: "muted" | "warn" | "danger";
  isOverdue: boolean;
  isFrozen: boolean;
  needsReleaseReview: boolean;
  hasUnreadMessages: boolean | null;
  actionAvailability: {
    canView: boolean;
    canViewNotes: boolean;
    canTrace: boolean;
    canFreeze: boolean;
    canMore: boolean;
  };
}

export interface AdminTxSummary {
  totalTransactions: number;
  totalAmount: number;
  inEscrowAmount: number;
  inDisputeCount: number;
  awaitingActionCount: number;
  flaggedCount: number;
  currency: "NGN";
}

export interface AdminTxPagination {
  page: number;
  pageSize: number;
  totalCount: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface AdminTxMonitorResponse {
  summary: AdminTxSummary;
  rows: AdminTxRow[];
  pagination: AdminTxPagination;
}

export type AdminTxQuickFilter =
  | "all"
  | "awaiting_payment"
  | "funds_held"
  | "in_dispute"
  | "overdue"
  | "refunded"
  | "failed"
  | "flagged"
  | "frozen";

export interface AdminTxMonitorParams {
  search?: string;
  transactionStatus?: string;
  moneyStatus?: string;
  disputeStatus?: string;
  riskLevel?: string;
  amountMin?: number;
  amountMax?: number;
  dateFrom?: string;
  dateTo?: string;
  quickFilter?: AdminTxQuickFilter;
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

export class AdminAccessRequiredError extends Error {
  constructor() {
    super("Admin access required");
    this.name = "AdminAccessRequiredError";
  }
}

export async function getAdminTransactionsMonitor(
  params: AdminTxMonitorParams = {},
): Promise<AdminTxMonitorResponse> {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session;
  if (!session) {
    if (typeof window !== "undefined") window.location.replace("/auth");
    return new Promise<AdminTxMonitorResponse>(() => {});
  }

  const { data, error } = await supabase.functions.invoke<AdminTxMonitorResponse>(
    "admin-transactions-monitor",
    {
      body: params,
      headers: { Authorization: `Bearer ${session.access_token}` },
    },
  );

  if (error) {
    const ctx = (error as unknown as { context?: Response }).context;
    const status = ctx?.status;
    if (status === 401) {
      if (typeof window !== "undefined") window.location.replace("/auth");
      return new Promise<AdminTxMonitorResponse>(() => {});
    }
    if (status === 403) throw new AdminAccessRequiredError();
    throw error;
  }

  if (!data) throw new Error("Empty admin transactions monitor response");
  return data;
}