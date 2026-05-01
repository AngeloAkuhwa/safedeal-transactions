import { supabase } from "@/integrations/supabase/client";

export type AlertSeverity = "critical" | "action_required" | "informational";

export interface SellerAlert {
  type: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  action_label: string;
  action_href: string;
  secondary_action?: { label: string; href: string };
  count?: number;
  blocking: boolean;
  dismissible: boolean;
  metadata?: Record<string, unknown>;
  priority: number;
}

export interface SellerAlertsSummary {
  total: number;
  by_severity: { critical: number; action_required: number; informational: number };
  visible_count: number;
}

export interface SellerOnboardingStep {
  key: "identity" | "payout" | "product" | "transaction";
  title: string;
  description: string;
  action_label: string;
  action_href: string;
  completed: boolean;
  blocking: boolean;
}

export interface SellerOnboarding {
  show: boolean;
  completed_steps: number;
  total_steps: number;
  steps: SellerOnboardingStep[];
}

export interface SellerMetrics {
  transactions_created_count: number;
  active_transactions_count: number;
  completed_transactions_count: number;
  awaiting_buyer_payment_count: number;
  awaiting_buyer_confirmation_count: number;
  awaiting_seller_confirmation_count: number;
  awaiting_release_count: number;
  open_disputes_count: number;
  payout_failed_count: number;
  products_low_stock_count: number;
  products_out_of_stock_count: number;
  unread_notifications_count: number;
  unread_messages_count: number;
  awaiting_buyer_payment_amount: number;
  awaiting_buyer_review_amount: number;
  funds_held_in_escrow_amount: number;
  funds_pending_release_amount: number;
  payouts_completed_amount: number;
  net_paid_to_bank: number;
  net_pending_bank_transfer: number;
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
  seller: SellerSummary;
  alerts: SellerAlert[];
  alerts_summary: SellerAlertsSummary;
  onboarding: SellerOnboarding;
  metrics: SellerMetrics;
  recent_activity: SellerActivity[];
  quick_actions: {
    draft_count: number;
  };
}

export interface SellerSummary {
    full_name: string;
    avatar_url: string | null;
    store_slug: string | null;
    created_at: string | null;
    verification_level: string;
    verification_label: string;
    identity_verified: boolean;
    payout_account_present: boolean;
    payout_account_verified: boolean;
    has_published_products: boolean;
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
