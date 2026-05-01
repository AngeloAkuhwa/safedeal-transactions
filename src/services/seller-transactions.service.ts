import { supabase } from "@/integrations/supabase/client";

export interface SellerTransaction {
  transaction_id: string;
  transaction_code: string;
  buyer_name: string;
  buyer_email: string;
  buyer_avatar: string | null;
  item_title: string;
  item_category: string;
  item_quantity: number;
  amount: number;
  seller_net: number;
  service_fee: number;
  currency_code: string;
  transaction_status: string;
  money_status: string;
  created_at: string;
  has_active_rider_token?: boolean;
  unread_message_count?: number;
  last_message_at?: string | null;
  last_message_preview?: string | null;
}

export interface SellerTransactionsPagination {
  page: number;
  page_size: number;
  total_count: number;
  total_pages: number;
}

export interface SellerTransactionsSummary {
  total: number;
  /** @deprecated use `awaiting_payment_count + in_fulfillment_count` */
  in_progress: number;
  awaiting_payment_count: number;
  in_fulfillment_count: number;
  completed: number;
  disputed_count?: number;
  cancelled_count?: number;
  timed_out_count?: number;
  refunded_count?: number;
  total_earned: number;
}

export interface SellerTransactionsResponse {
  transactions: SellerTransaction[];
  pagination: SellerTransactionsPagination;
  summary: SellerTransactionsSummary;
}

export interface SellerTransactionsFilters {
  search?: string;
  status_filter?: string;
  date_filter?: string;
  page?: number;
  page_size?: number;
}

export const getSellerTransactions = async (
  filters: SellerTransactionsFilters = {}
): Promise<SellerTransactionsResponse> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const { data, error } = await supabase.functions.invoke("seller-transactions", {
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: filters,
  });

  if (error) throw new Error(error.message || "Failed to load transactions");
  if (!data || data.error) throw new Error(data?.error || "Failed to load transactions");

  return data as SellerTransactionsResponse;
};
