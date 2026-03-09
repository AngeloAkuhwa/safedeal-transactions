import { supabase } from "@/integrations/supabase/client";

export interface ReviewData {
  transaction: {
    id: string;
    transaction_code: string;
    status: string;
    money_status: string;
    created_at: string;
    agreement_locked_at: string | null;
  };
  item: {
    title: string;
    description: string;
    quantity: number;
    condition_label: string;
    brand: string | null;
    model: string | null;
    warranty_terms: string | null;
  } | null;
  pricing: {
    currency_code: string;
    item_amount: number;
    platform_fee_amount: number;
    processing_fee_amount: number;
    seller_net_amount: number;
    buyer_total_amount: number;
    service_fee_amount: number;
    service_fee_rate: number;
  } | null;
  delivery: {
    delivery_method: string;
    expected_delivery_date: string;
    verification_window_hours: number;
  } | null;
  escrow: {
    state: string;
    held_amount: number;
    frozen_amount: number;
    released_amount: number;
    refunded_amount: number;
  } | null;
  media: Array<{
    id: string;
    file_id: string;
    media_type: string;
    display_order: number;
    files: {
      file_url: string;
      secure_url: string | null;
      mime_type: string | null;
      original_file_name: string | null;
    } | null;
  }>;
  seller: {
    full_name: string;
    avatar_url: string | null;
    email: string;
    member_since: string;
  } | null;
  sellerVerification: {
    email_verified: boolean;
    phone_verified: boolean;
    identity_verified: boolean;
    payout_verified: boolean;
  } | null;
}

export const getTransactionReview = async (shareToken: string): Promise<ReviewData> => {
  const { data, error } = await supabase.functions.invoke("resolve-share-token", {
    body: { shareToken },
  });

  if (error) throw new Error(error.message || "Failed to load transaction review");
  if (data?.error) throw new Error(data.error);
  return data as ReviewData;
};
