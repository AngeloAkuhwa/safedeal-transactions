import { supabase } from "@/integrations/supabase/client";
import {
  getAdminTransactionDetailFull,
  AdminAccessRequiredError,
  TransactionNotFoundError,
  type AdminTxDetailResponse,
} from "./admin-transaction-detail.service";

export { AdminAccessRequiredError };

export class DisputeNotFoundError extends Error {
  constructor() { super("Dispute not found"); this.name = "DisputeNotFoundError"; }
}

export interface AdminDisputeRow {
  id: string;
  transaction_id: string;
  status: string;
  reason: string | null;
  description: string | null;
  opened_at: string | null;
  seller_response_due_at: string | null;
  resolved_at: string | null;
}

export interface AdminDisputeFull {
  dispute: AdminDisputeRow;
  txDetail: AdminTxDetailResponse;
}

/**
 * Loads everything the central admin Dispute Detail page needs.
 * 1) Resolves the dispute row by id (to get transaction_id).
 * 2) Loads the full admin transaction detail payload (which already
 *    contains a rich `dispute` object, evidence, parties, timeline, etc.).
 */
export async function getAdminDisputeFull(disputeId: string): Promise<AdminDisputeFull> {
  if (!disputeId) throw new DisputeNotFoundError();

  const { data, error } = await supabase
    .from("disputes")
    .select(
      "id, transaction_id, status, reason, description, opened_at, seller_response_due_at, resolved_at",
    )
    .eq("id", disputeId)
    .maybeSingle();

  if (error) throw error;
  if (!data || !data.transaction_id) throw new DisputeNotFoundError();

  let txDetail: AdminTxDetailResponse;
  try {
    txDetail = await getAdminTransactionDetailFull(data.transaction_id);
  } catch (e) {
    if (e instanceof TransactionNotFoundError) throw new DisputeNotFoundError();
    throw e;
  }

  return { dispute: data as AdminDisputeRow, txDetail };
}