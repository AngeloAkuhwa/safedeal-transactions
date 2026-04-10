import { supabase } from "@/integrations/supabase/client";

export interface PayoutSummary {
  total_released: number;
  total_released_last_30: number;
  pending_release: number;
  held_in_escrow: number;
  on_hold_failed: number;
  currency_code: string;
}

export interface PayoutHistoryItem {
  payout_id: string;
  payout_id_full: string;
  transaction_code: string;
  transaction_id: string;
  buyer_name: string;
  item_title: string;
  gross_amount: number;
  fees: number;
  net_payout: number;
  currency_code: string;
  release_date: string;
  status: string;
  failure_reason: string | null;
}

export interface UpcomingRelease {
  transaction_id: string;
  transaction_code: string;
  item_title: string;
  buyer_name: string;
  amount: number;
  currency_code: string;
  release_trigger: string;
  verification_deadline_at: string | null;
  status: string;
}

export interface BlockedFund {
  transaction_id: string;
  transaction_code: string;
  item_title: string;
  buyer_name: string;
  amount: number;
  currency_code: string;
  blocker_reason: string;
  status: string;
}

export interface PayoutAccount {
  verified: boolean;
  last_payout_date: string | null;
  bank_name: string | null;
  account_name: string;
  masked_account_number: string | null;
  verification_status: string;
  typical_processing_time: string;
}

export interface SellerPayoutsResponse {
  seller: { full_name: string; avatar_url: string | null };
  summary: PayoutSummary;
  payout_history: PayoutHistoryItem[];
  pagination: { page: number; limit: number; total_count: number; total_pages: number };
  upcoming_releases: UpcomingRelease[];
  blocked_funds: BlockedFund[];
  payout_account: PayoutAccount;
}

export const getSellerPayouts = async (
  page = 1,
  limit = 10,
  statusFilter = "",
  search = ""
): Promise<SellerPayoutsResponse> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const params: Record<string, string> = { page: String(page), limit: String(limit) };
  if (statusFilter) params.status = statusFilter;
  if (search) params.search = search;

  const queryString = new URLSearchParams(params).toString();
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const url = `https://${projectId}.supabase.co/functions/v1/seller-payouts?${queryString}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (body?.error === "Invalid session") {
      await supabase.auth.signOut();
      window.location.href = "/auth";
      throw new Error("Session expired. Please sign in again.");
    }
    throw new Error(body?.error || "Failed to load payouts");
  }

  return res.json();
};

export const updatePayoutAccount = async (data: {
  bank_code: string;
  bank_name: string;
  account_number: string;
  account_name: string;
}): Promise<void> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const url = `https://${projectId}.supabase.co/functions/v1/update-payout-account`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || "Failed to update payout account");
  }
};
