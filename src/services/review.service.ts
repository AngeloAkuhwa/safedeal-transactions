import { supabase } from "@/integrations/supabase/client";

export interface ReviewData {
  transaction: {
    id: string;
    transaction_code: string;
    status: string;
    money_status: string;
    created_at: string;
    agreement_locked_at: string | null;
    cancelled_at: string | null;
    cancellation_reason: string | null;
    cancelled_by_role: "buyer" | "seller" | "system" | null;
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
  /**
   * Emitted by `supabase/functions/resolve-share-token`. Every amount is
   * nullable on purpose: a missing snapshot column must reach the UI as null
   * so the payment screen can block, never as a fabricated zero. The shape is
   * pinned by `src/__tests__/review-payload-shape.contract.test.ts`.
   */
  pricing: {
    currency_code: string | null;
    item_amount: number | null;
    paystack_fee_amount: number | null;
    platform_fee_amount: number | null;
    service_fee_amount: number | null;
    /** Rate actually charged, observed from the snapshot. Null when unknown. */
    service_fee_rate: number | null;
    total_amount: number | null;
    seller_payout_amount?: number | null;
    /** Persisted cap flag from `transaction_pricing`: never re-derived client side. */
    is_total_service_fee_capped?: boolean;
    /** Server-stated floor flag; null when unknown. Never re-derived client side. */
    is_floored?: boolean | null;
    /** Version stamp encoding the ceiling that actually applied. */
    pricing_model_version?: string | null;
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
    sort_order: number;
    files: {
      file_url: string;
      secure_url: string | null;
      mime_type: string | null;
      original_file_name: string | null;
    } | null;
  }>;
  /**
   * Share links are pre-authentication surfaces, so the server deliberately
   * withholds the seller's email. Declaring it here would be a field the
   * payload never carries. Pinned by `review-payload-shape.contract.test.ts`.
   */
  seller: {
    full_name: string;
    avatar_url: string | null;
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
