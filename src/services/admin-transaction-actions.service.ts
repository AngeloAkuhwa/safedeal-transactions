import { supabase } from "@/integrations/supabase/client";

export class AdminAccessRequiredError extends Error {
  constructor() {
    super("Admin access required");
    this.name = "AdminAccessRequiredError";
  }
}

async function invokeAction(action: string, transactionId: string, payload?: Record<string, unknown>) {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session;
  if (!session) {
    if (typeof window !== "undefined") window.location.replace("/auth");
    return new Promise(() => {});
  }
  const { data, error } = await supabase.functions.invoke("admin-transaction-actions", {
    body: { action, transactionId, payload },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) {
    const ctx = (error as unknown as { context?: Response }).context;
    if (ctx?.status === 403) throw new AdminAccessRequiredError();
    // Try to surface server message
    try {
      const body = ctx ? await ctx.clone().json() : null;
      throw new Error(body?.error ?? error.message);
    } catch (e) {
      if (e instanceof AdminAccessRequiredError) throw e;
      throw new Error((e as Error).message ?? "Action failed");
    }
  }
  return data;
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