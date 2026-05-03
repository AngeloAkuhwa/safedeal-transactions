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
    window.location.replace("/auth?mode=login");
    return new Promise<BuyerDashboardResponse>(() => {});
  }

  // Pre-flight role check: avoid hitting the buyer-dashboard edge function
  // (which 403s and pollutes runtime errors) when the user isn't a buyer.
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", session.user.id);
  const roleNames = (roles ?? []).map((r) => r.role as string);
  if (!roleNames.includes("buyer")) {
    const dest = roleNames.includes("admin")
      ? "/admin/dashboard"
      : roleNames.includes("seller")
      ? "/seller"
      : "/role-selection";
    window.location.replace(dest);
    return new Promise<BuyerDashboardResponse>(() => {});
  }

  const { data, error } = await supabase.functions.invoke("buyer-dashboard", {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (error) {
    let errorBody: { error?: string } | null = null;

    try {
      const context = (error as { context?: Response }).context;
      if (context) {
        errorBody = await context.clone().json();
      }
    } catch {
      errorBody = null;
    }

    const errorMessage = errorBody?.error ?? data?.error ?? error.message;

    if (errorMessage === "Invalid session") {
      await supabase.auth.signOut();
      window.location.replace(`/auth?mode=login&redirect=${encodeURIComponent("/dashboard")}`);
      return new Promise<BuyerDashboardResponse>(() => {});
    }

    if (errorMessage === "Buyer role required") {
      await redirectToRoleHome(session.user.id);
      return new Promise<BuyerDashboardResponse>(() => {});
    }

    throw new Error(errorMessage || "Failed to load dashboard");
  }

  if (!data || data.error) {
    if (data?.error === "Invalid session") {
      await supabase.auth.signOut();
      window.location.replace(`/auth?mode=login&redirect=${encodeURIComponent("/dashboard")}`);
      return new Promise<BuyerDashboardResponse>(() => {});
    }

    if (data?.error === "Buyer role required") {
      await redirectToRoleHome(session.user.id);
      return new Promise<BuyerDashboardResponse>(() => {});
    }

    throw new Error(data?.error || "Failed to load dashboard");
  }

  return data as BuyerDashboardResponse;
};

async function redirectToRoleHome(userId: string) {
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const names = (roles ?? []).map((r) => r.role as string);
  const dest = names.includes("admin")
    ? "/admin/dashboard"
    : names.includes("seller")
    ? "/seller"
    : "/role-selection";
  window.location.replace(dest);
}
