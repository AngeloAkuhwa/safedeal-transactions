import { supabase } from "@/integrations/supabase/client";

export interface BuyerDashboardMetrics {
  active_purchases: number;
  awaiting_delivery: number;
  awaiting_verification: number;
  open_disputes: number;
}

export interface DashboardNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  transaction_id: string | null;
  created_at: string;
}

export interface DashboardPurchase {
  transaction_id: string;
  transaction_code: string;
  item_title: string;
  seller_name: string;
  amount: number;
  currency_code: string;
  transaction_status: string;
  money_status: string;
  created_at: string;
}

export interface BuyerDashboardResponse {
  buyer: {
    full_name: string;
    avatar_url: string | null;
  };
  metrics: BuyerDashboardMetrics;
  recent_notifications: DashboardNotification[];
  recent_purchases: DashboardPurchase[];
}

export const getBuyerDashboard = async (): Promise<BuyerDashboardResponse> => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("Not authenticated");
  }

  const { data, error } = await supabase.functions.invoke("buyer-dashboard", {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (error) {
    throw new Error(error.message || "Failed to load dashboard");
  }

  if (!data || data.error) {
    throw new Error(data?.error || "Failed to load dashboard");
  }

  return data as BuyerDashboardResponse;
};
