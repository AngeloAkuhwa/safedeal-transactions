import { supabase } from "@/integrations/supabase/client";

export interface BuyerDisputeFilters {
  page?: number;
  page_size?: number;
  status?: string;
  search?: string;
}

export interface BuyerDisputeSeller {
  id: string;
  name: string;
  avatar_url: string | null;
}

export interface BuyerDisputeAction {
  label: string;
  route: string;
}

export interface BuyerDisputeItem {
  id: string;
  transaction_id: string;
  transaction_code: string | null;
  item_title: string | null;
  buyer_total_amount: number | null;
  reason: string;
  reason_label: string;
  status: string;
  seller_response_status: string;
  money_status: string | null;
  seller: BuyerDisputeSeller | null;
  opened_at: string;
  resolved_at: string | null;
  primary_action: BuyerDisputeAction;
  secondary_action: BuyerDisputeAction;
}

export interface BuyerDisputeSummary {
  open_count: number;
  under_review_count: number;
  resolved_count: number;
  funds_frozen_count: number;
}

export interface BuyerDisputePagination {
  page: number;
  page_size: number;
  total_count: number;
  total_pages: number;
}

export interface BuyerDisputesResponse {
  summary: BuyerDisputeSummary;
  items: BuyerDisputeItem[];
  pagination: BuyerDisputePagination;
}

export const getBuyerDisputes = async (
  filters: BuyerDisputeFilters
): Promise<BuyerDisputesResponse> => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("Not authenticated");
  }

  const { data, error } = await supabase.functions.invoke("buyer-disputes", {
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: filters,
  });

  if (error) {
    throw new Error(error.message || "Failed to load disputes");
  }

  if (!data || data.error) {
    throw new Error(data?.error || "Failed to load disputes");
  }

  return data as BuyerDisputesResponse;
};
