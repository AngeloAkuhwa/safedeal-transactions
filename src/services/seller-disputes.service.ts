import { supabase } from "@/integrations/supabase/client";

export interface SellerDisputeFilters {
  page?: number;
  page_size?: number;
  status?: string;
  reason?: string;
  search?: string;
  action_needed?: boolean;
}

export interface SellerDisputeBuyer {
  id: string;
  name: string;
  avatar_url: string | null;
}

export interface SellerDisputeAction {
  label: string;
  route: string;
}

export interface SellerDisputeItem {
  id: string;
  transaction_id: string;
  transaction_code: string | null;
  item_title: string | null;
  seller_net_amount: number | null;
  reason: string;
  reason_label: string;
  status: string;
  seller_response_status: string;
  money_status: string | null;
  money_impact: string;
  seller_response_due_at: string | null;
  buyer: SellerDisputeBuyer | null;
  opened_at: string;
  resolved_at: string | null;
  primary_action: SellerDisputeAction;
  secondary_action: SellerDisputeAction;
}

export interface SellerDisputeSummary {
  open_count: number;
  awaiting_response_count: number;
  under_review_count: number;
  resolved_count: number;
  blocked_payout_amount: number;
}

export interface SellerDisputeActionNeeded {
  dispute_id: string;
  transaction_id: string;
  transaction_code: string | null;
  buyer_name: string | null;
  reason: string;
  reason_label: string;
  action_required: string;
  deadline: string | null;
  opened_at: string;
}

export interface SellerDisputeBlockedPayout {
  transaction_id: string;
  transaction_code: string | null;
  item_title: string | null;
  buyer_name: string | null;
  amount: number;
  currency_code: string;
  dispute_id: string | null;
  dispute_status: string | null;
}

export interface SellerDisputePagination {
  page: number;
  page_size: number;
  total_count: number;
  total_pages: number;
}

export interface SellerDisputesResponse {
  summary: SellerDisputeSummary;
  items: SellerDisputeItem[];
  action_needed: SellerDisputeActionNeeded[];
  blocked_payouts: SellerDisputeBlockedPayout[];
  pagination: SellerDisputePagination;
}

export const getSellerDisputes = async (
  filters: SellerDisputeFilters
): Promise<SellerDisputesResponse> => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("Not authenticated");
  }

  const { data, error } = await supabase.functions.invoke("seller-disputes", {
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: filters,
  });

  if (error) {
    throw new Error(error.message || "Failed to load disputes");
  }

  if (!data || data.error) {
    throw new Error(data?.error || "Failed to load disputes");
  }

  return data as SellerDisputesResponse;
};
