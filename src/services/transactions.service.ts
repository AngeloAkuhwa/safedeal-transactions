import { supabase } from "@/integrations/supabase/client";

export interface BuyerTransactionFilters {
  search?: string;
  transaction_status?: string;
  money_status?: string;
  page?: number;
  page_size?: number;
  sort_by?: string;
  sort_order?: string;
}

export interface BuyerTransactionRow {
  transaction_id: string;
  transaction_code: string;
  item_title: string;
  item_category: string | null;
  item_quantity: number;
  seller_name: string;
  amount: number;
  currency_code: string;
  transaction_status: string;
  money_status: string;
  dispute_status: string;
  created_at: string;
  updated_at: string;
  primary_action: string;
}

export interface StatusCounts {
  all: number;
  processing: number;
  in_transit: number;
  delivered: number;
  completed: number;
  disputed: number;
  cancelled: number;
}

export interface BuyerTransactionsResponse {
  transactions: BuyerTransactionRow[];
  status_counts: StatusCounts;
  pagination: {
    page: number;
    page_size: number;
    total_count: number;
    total_pages: number;
  };
}

export const getBuyerTransactions = async (
  filters: BuyerTransactionFilters
): Promise<BuyerTransactionsResponse> => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("Not authenticated");
  }

  const { data, error } = await supabase.functions.invoke(
    "buyer-transactions",
    {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      body: filters,
    }
  );

  if (error) {
    throw new Error(error.message || "Failed to load transactions");
  }

  if (!data || data.error) {
    throw new Error(data?.error || "Failed to load transactions");
  }

  return data as BuyerTransactionsResponse;
};
