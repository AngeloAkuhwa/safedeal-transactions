import { supabase } from "@/integrations/supabase/client";
import type { DisputeDetailResponse } from "@/services/disputes.service";

export interface SellerDisputePayoutImpact {
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

export interface SellerDisputeDetailResponse extends Omit<DisputeDetailResponse, "seller"> {
  buyer: {
    id: string;
    name: string | null;
    avatar_url: string | null;
  } | null;
  payout_impact: SellerDisputePayoutImpact;
}

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

export const submitSellerResponse = async (
  disputeId: string,
  responseText: string
): Promise<void> => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("Not authenticated");
  }

  const { data, error } = await supabase.functions.invoke("submit-seller-response", {
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: { dispute_id: disputeId, response_text: responseText },
  });

  if (error) {
    throw new Error(error.message || "Failed to submit response");
  }

  if (!data || data.error) {
    throw new Error(data?.error || "Failed to submit response");
  }
};
