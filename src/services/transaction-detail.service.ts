import { supabase } from "@/integrations/supabase/client";

export interface TransactionDetailItem {
  title: string;
  description: string | null;
  quantity: number;
  condition: string | null;
  brand: string | null;
  model: string | null;
  category: string | null;
}

export interface TransactionDetailPricing {
  item_amount: number;
  platform_fee_amount: number;
  processing_fee_amount: number;
  buyer_total_amount: number;
  currency_code: string;
}

export interface TransactionDetailDeliveryTerms {
  delivery_method: string;
  expected_delivery_date: string;
  verification_window_hours: number;
  delivery_address_line1: string | null;
  delivery_address_line2: string | null;
  delivery_city: string | null;
  delivery_state: string | null;
  delivery_postal_code: string | null;
  delivery_country_code: string | null;
}

export interface TransactionDetailTracking {
  courier_name: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  expected_delivery_at: string | null;
}

export interface TransactionDetailProofFile {
  id: string;
  proof_type: string;
  created_at: string;
  file_url: string | null;
  file_name: string | null;
  mime_type: string | null;
}

export interface TransactionDetailSeller {
  full_name: string;
  avatar_url: string | null;
  member_since: string;
}

export interface TransactionDetailEscrow {
  state: string;
  held_amount: number;
  released_amount: number;
  frozen_amount: number;
  refunded_amount: number;
}

export interface TransactionDetailDispute {
  id: string;
  status: string;
  reason: string;
  opened_at: string;
  description: string;
}

export interface TransactionStatusEntry {
  old_status: string | null;
  new_status: string;
  reason: string | null;
  changed_at: string;
}

export interface TransactionNextAction {
  label: string;
  description: string;
  action: string | null;
}

export interface TransactionDetailResponse {
  transaction: {
    id: string;
    transaction_code: string;
    status: string;
    money_status: string;
    dispute_status: string | null;
    created_at: string;
    verification_deadline_at: string | null;
  };
  item: TransactionDetailItem;
  pricing: TransactionDetailPricing;
  delivery_terms: TransactionDetailDeliveryTerms | null;
  delivery_tracking: TransactionDetailTracking | null;
  delivery_proof_files: TransactionDetailProofFile[];
  seller: TransactionDetailSeller | null;
  escrow: TransactionDetailEscrow | null;
  status_history: TransactionStatusEntry[];
  money_history: TransactionStatusEntry[];
  dispute: TransactionDetailDispute | null;
  agreement: { locked_at: string } | null;
  next_action: TransactionNextAction;
}

export const getTransactionDetail = async (
  transactionId: string
): Promise<TransactionDetailResponse> => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("Not authenticated");
  }

  const { data, error } = await supabase.functions.invoke("transaction-detail", {
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: { transaction_id: transactionId },
  });

  if (error) {
    throw new Error(error.message || "Failed to load transaction details");
  }

  if (!data || data.error) {
    throw new Error(data?.error || "Failed to load transaction details");
  }

  return data as TransactionDetailResponse;
};
