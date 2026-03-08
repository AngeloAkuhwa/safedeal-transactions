import { supabase } from "@/integrations/supabase/client";

// ── List Disputes ──

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

// ── Dispute Detail ──

export interface DisputeDetailEvidence {
  id: string;
  type: string;
  file_url: string | null;
  mime_type: string | null;
  file_name: string | null;
  notes: string | null;
  created_at: string;
}

export interface DisputeDetailProofFile {
  id: string;
  file_url: string | null;
  mime_type: string | null;
  file_name: string | null;
  proof_type: string;
  created_at: string;
}

export interface DisputeDetailTimelineEntry {
  old_status: string | null;
  new_status: string;
  reason: string | null;
  changed_at: string;
}

export interface DisputeDetailResponse {
  dispute: {
    id: string;
    reason: string;
    reason_label: string;
    description: string;
    status: string;
    opened_at: string;
    resolved_at: string | null;
    seller_response_due_at: string | null;
  };
  transaction: {
    id: string;
    code: string | null;
    status: string;
    money_status: string | null;
    created_at: string;
  };
  item: {
    title: string | null;
    description: string | null;
    quantity: number;
    condition_label: string | null;
  } | null;
  pricing: {
    buyer_total_amount: number;
    currency_code: string;
  } | null;
  seller: {
    id: string;
    name: string | null;
    avatar_url: string | null;
  } | null;
  buyer_claim: {
    description: string;
    evidence: DisputeDetailEvidence[];
  };
  seller_response: {
    has_response: boolean;
    response_state: "pending" | "responded" | "not_responded";
    response_text: string | null;
    submitted_at: string | null;
    evidence: DisputeDetailEvidence[];
  };
  agreement_snapshot: {
    locked_at: string;
    snapshot_json: Record<string, unknown>;
  } | null;
  delivery_proof: {
    tracking: {
      courier_name: string | null;
      tracking_number: string | null;
      tracking_url: string | null;
      shipped_at: string | null;
      delivered_at: string | null;
    } | null;
    files: DisputeDetailProofFile[];
  };
  timeline: DisputeDetailTimelineEntry[];
  outcome: {
    outcome_type: string;
    decision_summary: string;
    refund_amount: number;
    release_amount: number;
    resolved_at: string;
    resolved_by_name: string | null;
  } | null;
}

export const getDisputeById = async (
  disputeId: string
): Promise<DisputeDetailResponse> => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("Not authenticated");
  }

  const { data, error } = await supabase.functions.invoke("dispute-detail", {
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: { dispute_id: disputeId },
  });

  if (error) {
    throw new Error(error.message || "Failed to load dispute details");
  }

  if (!data || data.error) {
    throw new Error(data?.error || "Failed to load dispute details");
  }

  return data as DisputeDetailResponse;
};
