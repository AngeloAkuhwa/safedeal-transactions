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
    // When invoke gets a non-2xx, the JSON body may be in error.context.body or we parse it
    let errorBody: string | undefined;
    try {
      // FunctionsHttpError stores the response; try to extract the JSON message
      const ctx = (error as any).context;
      if (ctx && typeof ctx.json === "function") {
        const parsed = await ctx.json();
        errorBody = parsed?.error;
      }
    } catch {
      // ignore parse failures
    }

    // Also check data in case the SDK populated it
    const msg = errorBody || data?.error;

    if (msg === "Invalid session") {
      await supabase.auth.signOut();
      window.location.href = "/auth";
      throw new Error("Session expired. Please sign in again.");
    }

    throw new Error(msg || error.message || "Failed to load dashboard");
  }

  if (!data || data.error) {
    if (data?.error === "Invalid session") {
      await supabase.auth.signOut();
      window.location.href = "/auth";
      throw new Error("Session expired. Please sign in again.");
    }
    throw new Error(data?.error || "Failed to load dashboard");
  }

  return data as BuyerDashboardResponse;
};
