import { supabase } from "@/integrations/supabase/client";

export type AnalyticsPeriod = "30d" | "90d" | "all";
export type AnalyticsBucket = "daily" | "weekly" | "monthly";

export interface AnalyticsSummary {
  currency: string;
  seller_net_released: number;
  funds_awaiting_release: number;
  funds_held_in_escrow: number;
  gross_sales: number;
  fees_deducted: number;
  disputed_amount: number;
  completed_transactions_count: number;
  active_transactions_count: number;
  open_disputes_count: number;
  failed_payouts_count: number;
}

export interface RevenueTrendBucket {
  label: string;
  start_date: string;
  end_date: string;
  seller_net_released: number;
  gross_sales: number;
  fees_deducted: number;
  completed_transactions: number;
}

export interface RevenueTrend {
  period: AnalyticsPeriod;
  bucket: AnalyticsBucket;
  currency: string;
  total_released_net: number;
  data: RevenueTrendBucket[];
}

export interface TopProduct {
  product_id: string;
  name: string;
  image_url: string | null;
  completed_transactions: number;
  gross_sales: number;
  seller_net_released: number;
  current_stock: number;
  rating: number | null;
}

export interface CompletionRate {
  value: number | null;
  completed_count: number;
  paid_transaction_count: number;
}

export interface DisputeRate {
  value: number | null;
  open_disputes: number;
  resolved_disputes: number;
  total_disputes: number;
  outcome_split: {
    resolved_for_buyer: number;
    resolved_for_seller: number;
    partial_refund: number;
    dismissed: number;
  };
}

export interface AverageReleaseTime {
  hours: number | null;
  sample_size: number;
  label: string;
}

export interface TrustMetrics {
  seller_rating: number | null;
  completed_deals: number;
  on_time_dispatch_rate: number | null;
  dispute_free_rate: number;
  response_time_hours: number | null;
  identity_verified: boolean;
  payout_verified: boolean;
}

export interface SellerAnalyticsData {
  summary: AnalyticsSummary;
  revenue_trend: RevenueTrend;
  top_products: TopProduct[];
  completion_rate: CompletionRate;
  dispute_rate: DisputeRate;
  average_release_time: AverageReleaseTime;
  trust_metrics: TrustMetrics;
  generated_at: string;
}

export async function fetchSellerAnalytics(input: {
  period?: AnalyticsPeriod;
  bucket?: AnalyticsBucket;
  product_id?: string | null;
  currency?: string;
}): Promise<SellerAnalyticsData> {
  const { data, error } = await supabase.functions.invoke("seller-analytics", {
    body: {
      period: input.period ?? "90d",
      bucket: input.bucket ?? "weekly",
      product_id: input.product_id ?? null,
      currency: input.currency ?? "NGN",
    },
  });
  if (error) throw error;
  if (!data || (data as any).error) {
    throw new Error((data as any)?.error ?? "Failed to load analytics");
  }
  return data as SellerAnalyticsData;
}
