import { supabase } from "@/integrations/supabase/client";

export interface SellerAlert {
  type: string;
  count?: number;
  amount?: number;
  currency_code?: string;
  title: string;
  message: string;
  action_label: string;
  action_url: string;
}

export interface SellerMetrics {
  transactions_created_count: number;
  awaiting_buyer_payment_amount: number;
  awaiting_buyer_review_amount: number;
  funds_held_in_escrow_amount: number;
  funds_pending_release_amount: number;
  payouts_completed_amount: number;
  /** Sum of payouts.amount where status='completed' — money actually deposited to bank */
  net_paid_to_bank?: number;
  /** payouts_completed_amount − net_paid_to_bank — earned but still queued for transfer */
  net_pending_bank_transfer?: number;
}

export interface SellerActivity {
  transaction_id: string;
  transaction_code: string;
  buyer_name: string;
  buyer_email: string;
  item_title: string;
  amount: number;
  currency_code: string;
  transaction_status: string;
  money_status: string;
  created_at: string;
  has_active_rider_token?: boolean;
}

export interface SellerDashboardResponse {
  seller: {
    full_name: string;
    avatar_url: string | null;
    store_slug: string | null;
    created_at: string | null;
    verification_level: string;
    verification_label: string;
  };
  alerts: SellerAlert[];
  metrics: SellerMetrics;
  recent_activity: SellerActivity[];
  quick_actions: {
    draft_count: number;
  };
}

export const getSellerDashboard = async (): Promise<SellerDashboardResponse> => {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("Not authenticated");
  }

  const { data, error } = await supabase.functions.invoke("seller-dashboard", {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (error) {
    throw new Error(error.message || "Failed to load seller dashboard");
  }

  if (!data || data.error) {
    if (data?.error === "Invalid session") {
      await supabase.auth.signOut();
      window.location.href = "/auth";
      throw new Error("Session expired. Please sign in again.");
    }
    throw new Error(data?.error || "Failed to load seller dashboard");
  }

  return data as SellerDashboardResponse;
};
