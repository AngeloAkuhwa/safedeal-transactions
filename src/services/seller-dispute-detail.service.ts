import { supabase } from "@/integrations/supabase/client";

// ── Types ──

export interface SellerDisputeEvidence {
  id: string;
  type: string;
  file_url: string | null;
  mime_type: string | null;
  file_name: string | null;
  notes: string | null;
  created_at: string;
}

export interface SellerDisputeProofFile {
  id: string;
  file_url: string | null;
  mime_type: string | null;
  file_name: string | null;
  proof_type: string;
  created_at: string;
}

export interface SellerDisputeTimelineEntry {
  type: "status_change" | "event";
  label: string;
  detail: string | null;
  occurred_at: string;
  status?: string;
}

export interface SellerDisputePayoutImpact {
  is_blocked: boolean;
  blocked_amount: number;
  block_reason: string | null;
  currency_code: string;
  partial_release_possible: boolean;
  payout_exists: boolean;
  payout: {
    id: string;
    amount: number;
    currency_code: string;
    status: string;
    failure_reason: string | null;
  } | null;
  escrow: {
    state: string;
    held_amount: number;
    frozen_amount: number;
    released_amount: number;
    refunded_amount: number;
  } | null;
}

export interface SellerDisputeDetailResponse {
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
  buyer: {
    id: string;
    name: string | null;
    avatar_url: string | null;
  } | null;
  buyer_claim: {
    description: string;
    evidence: SellerDisputeEvidence[];
  };
  seller_response: {
    has_response: boolean;
    response_state: "pending" | "responded" | "not_responded";
    response_text: string | null;
    submitted_at: string | null;
    evidence: SellerDisputeEvidence[];
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
    files: SellerDisputeProofFile[];
  };
  timeline: SellerDisputeTimelineEntry[];
  outcome: {
    outcome_type: string;
    decision_summary: string;
    refund_amount: number;
    release_amount: number;
    resolved_at: string;
    resolved_by_name: string | null;
  } | null;
  payout_impact: SellerDisputePayoutImpact;
}

// ── Fetch Detail ──

export const getSellerDisputeDetail = async (
  disputeId: string
): Promise<SellerDisputeDetailResponse> => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("Not authenticated");
  }

  const { data, error } = await supabase.functions.invoke("seller-dispute-detail", {
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: { dispute_id: disputeId },
  });

  if (error) {
    throw new Error(error.message || "Failed to load dispute details");
  }

  if (!data || data.error) {
    throw new Error(data?.error || "Failed to load dispute details");
  }

  return data as SellerDisputeDetailResponse;
};

// ── Submit Response ──

export const submitSellerResponse = async (
  disputeId: string,
  responseText: string,
  evidenceFileIds: string[] = []
): Promise<void> => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("Not authenticated");
  }

  const { data, error } = await supabase.functions.invoke("submit-seller-response", {
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: {
      dispute_id: disputeId,
      response_text: responseText,
      evidence_file_ids: evidenceFileIds,
    },
  });

  if (error) {
    throw new Error(error.message || "Failed to submit response");
  }

  if (!data || data.error) {
    throw new Error(data?.error || "Failed to submit response");
  }
};
