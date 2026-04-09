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
  funds_held_in_escrow_amount: number;
  funds_pending_release_amount: number;
  payouts_completed_amount: number;
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
}

export interface SellerDashboardResponse {
  seller: {
    full_name: string;
    avatar_url: string | null;
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
