import { supabase } from "@/integrations/supabase/client";

export class AdminAccessRequiredError extends Error {
  constructor() {
    super("Admin access required");
    this.name = "AdminAccessRequiredError";
  }
}

/**
 * Raised when a support/dispute agent tries to resolve a dispute that
 * exceeds their authority (cap, risk flag, or compliance flag). Carries
 * the reasons returned by the server for a helpful UI toast.
 */
export class DisputeEscalationRequiredError extends Error {
  reasons: string[];
  capNgn: number | null;
  constructor(reasons: string[], capNgn: number | null) {
    super("This action must be escalated to a senior approver.");
    this.name = "DisputeEscalationRequiredError";
    this.reasons = reasons;
    this.capNgn = capNgn;
  }
}

async function invokeAction(action: string, transactionId: string, payload?: Record<string, unknown>) {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session;
  if (!session) {
    if (typeof window !== "undefined") window.location.replace("/auth");
    return new Promise(() => {});
  }
  // Use direct fetch instead of supabase.functions.invoke to avoid the
  // SDK's built-in console.error on non-2xx responses (which the runtime
  // error tracker misreports as a blank-screen crash for expected 403s
  // like `escalation_required`).
  const projectId = (import.meta as any).env?.VITE_SUPABASE_PROJECT_ID;
  const url = `https://${projectId}.supabase.co/functions/v1/admin-transaction-actions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
    },
    body: JSON.stringify({ action, transactionId, payload }),
  });
  let body: any = null;
  try { body = await res.json(); } catch { /* ignore */ }
  const isEscalationRequired = body?.error === "escalation_required";
  if (isEscalationRequired) {
    throw new DisputeEscalationRequiredError(
      Array.isArray(body.reasons) ? body.reasons : [],
      typeof body.cap_ngn === "number" ? body.cap_ngn : null,
    );
  }
  if (!res.ok) {
    if (res.status === 403) throw new AdminAccessRequiredError();
    throw new Error(body?.error ?? `Action failed (${res.status})`);
  }
  return body;
}

export const addInternalNote = (transactionId: string, note: string) =>
  invokeAction("add_internal_note", transactionId, { note });
export const freezeTransaction = (transactionId: string, reason: string) =>
  invokeAction("freeze", transactionId, { reason });
export const unfreezeTransaction = (transactionId: string, reason: string) =>
  invokeAction("unfreeze", transactionId, { reason });
export const flagForReview = (transactionId: string, reason: string) =>
  invokeAction("flag_for_review", transactionId, { reason });
export const escalateDispute = (transactionId: string, reason: string) =>
  invokeAction("escalate_dispute", transactionId, { reason });
export const openInvestigation = (transactionId: string, reason?: string) =>
  invokeAction("open_investigation", transactionId, { reason });
export const addInternalNoteTyped = (
  transactionId: string,
  note: string,
  note_type?: "note" | "escalation" | "risk" | "payment" | "dispute" | "payout",
) => invokeAction("add_internal_note", transactionId, { note, note_type });

export type InvestigationStatus = "open" | "under_review" | "escalated" | "resolved" | "dismissed";
export type InvestigationPriority = "low" | "medium" | "high" | "critical";
export type NoteCategory = "general" | "payment" | "escrow" | "dispute" | "delivery" | "evidence" | "payout" | "risk";
export type FreezeSeverity = "low" | "medium" | "high" | "critical";

export const upsertInvestigation = (
  transactionId: string,
  payload: { status: InvestigationStatus; priority: InvestigationPriority; assigned_admin_id?: string | null; tags?: string[]; note?: string },
) => invokeAction("upsert_investigation", transactionId, payload);

export const freezeTransactionDetailed = (
  transactionId: string,
  payload: { reason: string; category: string; severity: FreezeSeverity; note?: string },
) => invokeAction("freeze", transactionId, payload);

export const unfreezeTransactionDetailed = (
  transactionId: string,
  payload: { reason: string; target_money_status: "funds_held_in_escrow" | "funds_pending_release"; note?: string; acknowledge_open_dispute?: boolean; notify_parties?: boolean },
) => invokeAction("unfreeze", transactionId, payload);

export const addInternalNoteDetailed = (
  transactionId: string,
  payload: { note: string; category: NoteCategory; follow_up_required?: boolean; follow_up_priority?: "low" | "medium" | "high" | "urgent" },
) => invokeAction("add_internal_note", transactionId, payload);

export type DisputeOutcomeType =
  | "refund_buyer"
  | "release_funds_to_seller"
  | "partial_refund_release"
  | "dismissed_seller_favor"
  | "dismissed_buyer_favor"
  | "close_case_without_resolution";

export interface ResolveDisputePayload {
  outcome_type: DisputeOutcomeType;
  decision_summary: string;
  refund_amount: number;
  release_amount: number;
  internal_note?: string;
  notify_parties?: boolean;
  also_close_investigation?: boolean;
  acknowledge_frozen_funds?: boolean;
}

export interface ResolveDisputeResult {
  ok: boolean;
  outcome_type?: string;
  dispute_outcome_id?: string | null;
  money_status?: string | null;
  refund_id?: string | null;
  release_queue_id?: string | null;
  ledger_entry_ids?: string[];
  admin_action_id?: string | null;
  timeline_event_id?: string | null;
  remaining_held_amount?: number;
  remaining_frozen_amount?: number;
  refund_amount?: number;
  release_amount?: number;
  investigation_closed?: boolean;
}

export const resolveDispute = (
  transactionId: string,
  payload: ResolveDisputePayload,
): Promise<ResolveDisputeResult> =>
  invokeAction("resolve_dispute", transactionId, payload as unknown as Record<string, unknown>) as Promise<ResolveDisputeResult>;

export interface DisputeRequestMoreInfoPayload {
  message: string;
  new_due_at: string;
  notify_seller?: boolean;
}

export const disputeRequestMoreInfo = (transactionId: string, payload: DisputeRequestMoreInfoPayload) =>
  invokeAction("dispute_request_more_info", transactionId, payload as unknown as Record<string, unknown>);

export interface RetryDisputeRefundResult {
  ok: boolean;
  refund_id?: string;
  idempotent?: boolean;
  provider_reference?: string | null;
  amount?: number;
  status?: string;
}

/**
 * Re-runs the payment-provider hand-off for a dispute refund that is still
 * stuck at 'pending'/'failed' while the transaction sits at
 * money_status='refund_pending'. Gated server-side on `refunds.issue`.
 */
export const retryDisputeRefund = (transactionId: string, notes?: string) =>
  invokeAction("retry_dispute_refund", transactionId, { notes }) as Promise<RetryDisputeRefundResult>;

// Dedicated dispute state transition. Calls the `admin-dispute-transition`
// edge function so the state machine, history row, and audit diff are handled
// server-side. Used by AdminDisputeDetail's Move-to-Under-Review action.
export async function transitionDisputeStatus(
  disputeId: string,
  targetStatus: "under_review" | "seller_response_pending" | "escalated" | "open",
  reason: string,
  notifyParties = false,
): Promise<{ ok: true; status: string }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session;
  if (!session) {
    if (typeof window !== "undefined") window.location.replace("/auth");
    return new Promise(() => {});
  }
  const { data, error } = await supabase.functions.invoke("admin-dispute-transition", {
    body: { dispute_id: disputeId, target_status: targetStatus, reason, notify_parties: notifyParties },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) {
    const ctx = (error as unknown as { context?: Response }).context;
    if (ctx?.status === 403) throw new AdminAccessRequiredError();
    try {
      const body = ctx && typeof (ctx as any).clone === "function"
        ? await (ctx as Response).clone().json()
        : null;
      throw new Error(body?.error ?? error.message ?? "Transition failed");
    } catch (e) {
      if (e instanceof AdminAccessRequiredError) throw e;
      throw e instanceof Error ? e : new Error("Transition failed");
    }
  }
  return data as { ok: true; status: string };
}

export interface ExportTransactionOptions {
  include_summary: boolean;
  include_agreement: boolean;
  include_payment_ledger: boolean;
  include_timeline: boolean;
  include_dispute_summary: boolean;
  include_evidence_metadata: boolean;
  include_admin_notes: boolean;
  reason: string;
}

export async function exportTransactionData(transactionId: string, options: ExportTransactionOptions) {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session;
  if (!session) {
    if (typeof window !== "undefined") window.location.replace("/auth");
    return new Promise(() => {});
  }
  const { data, error } = await supabase.functions.invoke<{ filename: string; generatedAt: string; payload: unknown }>(
    "admin-export-transaction-data",
    { body: { transaction_id: transactionId, ...options }, headers: { Authorization: `Bearer ${session.access_token}` } },
  );
  if (error) {
    const ctx = (error as unknown as { context?: Response }).context;
    if (ctx?.status === 403) throw new AdminAccessRequiredError();
    try {
      const body = ctx && typeof (ctx as any).clone === "function"
        ? await (ctx as Response).clone().json()
        : null;
      throw new Error(body?.error ?? error.message ?? "Export failed");
    } catch (e) {
      if (e instanceof AdminAccessRequiredError) throw e;
      throw new Error((e as Error)?.message ?? error.message ?? "Export failed");
    }
  }
  return data!;
}

export interface AdminTxDetail {
  summary?: any;
  timeline?: any[];
  ledger?: any[];
  messages?: any[];
  notes?: any[];
  risk?: any;
  dispute?: any;
  linked?: any;
  items?: any[];
  delivery?: any;
  agreement?: any;
  audit?: any[];
}

export async function getAdminTransactionDetail(
  transactionId: string,
  sections?: string[],
): Promise<AdminTxDetail> {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session;
  if (!session) {
    if (typeof window !== "undefined") window.location.replace("/auth");
    return new Promise(() => {});
  }
  const { data, error } = await supabase.functions.invoke<AdminTxDetail>(
    "admin-transaction-detail",
    {
      body: { transactionId, sections },
      headers: { Authorization: `Bearer ${session.access_token}` },
    },
  );
  if (error) {
    const ctx = (error as unknown as { context?: Response }).context;
    if (ctx?.status === 403) throw new AdminAccessRequiredError();
    throw error;
  }
  return data ?? {};
}