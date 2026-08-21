import { supabase } from "@/integrations/supabase/client";

export interface SellerTransactionDetailBuyer {
  name: string;
  email: string;
  phone: string;
  avatar_url: string | null;
  is_verified: boolean;
  /** account_verifications.identity_verified. The only basis for a verification badge. */
  identity_verified: boolean;
  email_verified: boolean;
  phone_verified: boolean;
  verification_level: string;
}

export interface SellerTransactionDetailItem {
  title: string;
  description: string;
  category: string;
  quantity: number;
  condition: string;
  brand: string | null;
  model: string | null;
  images: string[] | null;
}

export interface SellerTransactionDetailPricing {
  item_amount: number;
  service_fee_amount: number;
  service_fee_rate?: number;
  platform_fee_amount: number;
  payment_processing_fee_amount: number;
  paystack_fee_amount?: number;
  processing_fee_amount?: number;
  seller_net_amount: number;
  buyer_total_amount: number;
  currency_code: string;
}

export interface TimelineStep {
  key: string;
  label: string;
  description: string;
  status: "completed" | "current" | "pending";
  timestamp: string | null;
}

export interface SellerCompletionEvent {
  completed_at: string;
  previous_status: string | null;
  reason: string | null;
  variant: "buyer_confirmed" | "dispute_resolved" | "unknown";
  /** Phase A: timestamp money_status reached funds_released. Banner only renders when set. */
  funds_released_at: string | null;
}

export interface SellerTransactionDetailResponse {
  transaction: {
    id: string;
    transaction_code: string;
    status: string;
    money_status: string;
    dispute_status?: string;
    buyer_confirmed_at?: string | null;
    seller_confirmed_at?: string | null;
    needs_release_review?: boolean;
    release_review_reason?: string | null;
    share_token: string | null;
    share_url: string | null;
    created_at: string;
    agreement_locked_at: string | null;
    delivery_method: string;
    expected_delivery_date: string | null;
    verification_window_hours: number;
  };
  buyer: SellerTransactionDetailBuyer;
  item: SellerTransactionDetailItem | null;
  pricing: SellerTransactionDetailPricing | null;
  escrow: {
    state: string;
    held_amount: number;
    released_amount: number;
    refunded_amount: number;
    frozen_amount: number;
  } | null;
  agreement: {
    locked_at: string;
    snapshot: unknown;
  } | null;
  delivery_tracking: {
    courier_name: string | null;
    tracking_number: string | null;
    tracking_url: string | null;
    shipped_at: string | null;
    delivered_at: string | null;
    expected_delivery_at: string | null;
  } | null;
  delivery_terms: {
    delivery_method: string;
    expected_delivery_date: string | null;
    verification_window_hours: number | null;
    address: string | null;
  } | null;
  timeline: TimelineStep[];
  next_action: {
    title: string;
    description: string;
    checklist: string[];
  };
  completion_event?: SellerCompletionEvent | null;
  rider_link?: {
    token: string;
    path: string;
    url: string | null;
    expires_at: string | null;
  } | null;
}

export const getSellerTransactionDetail = async (
  transactionId: string
): Promise<SellerTransactionDetailResponse> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const { data, error } = await supabase.functions.invoke("seller-transaction-detail", {
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: { transaction_id: transactionId },
  });

  if (error) throw new Error(error.message || "Failed to load transaction");
  if (!data || data.error) throw new Error(data?.error || "Failed to load transaction");

  return data as SellerTransactionDetailResponse;
};

export interface SellerConfirmCompletionResult {
  success: boolean;
  payout_id?: string;
  blocked?: boolean;
  reason?: "pricing_missing" | "payout_account_missing";
  already_confirmed?: boolean;
  money_status?: string;
  warning?: string;
}

export const sellerConfirmCompletion = async (
  transactionId: string,
  notes?: string,
): Promise<SellerConfirmCompletionResult> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const { data, error } = await supabase.functions.invoke("seller-confirm-completion", {
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: { transaction_id: transactionId, notes },
  });

  if (error) throw new Error(error.message || "Failed to confirm completion");
  if (!data || data.error) throw new Error(data?.error || "Failed to confirm completion");

  return data as SellerConfirmCompletionResult;
};
