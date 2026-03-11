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
  currency_code: string;
  transaction_status: string;
  money_status: string;
  created_at: string;
}

export interface SellerTransactionsPagination {
  page: number;
  page_size: number;
  total_count: number;
  total_pages: number;
}

export interface SellerTransactionsSummary {
  total: number;
  in_progress: number;
  completed: number;
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
