import { supabase } from "@/integrations/supabase/client";

async function getAuthHeader() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  return { Authorization: `Bearer ${session.access_token}` };
}

export interface VerificationData {
  transaction: {
    id: string;
    transaction_code: string;
    status: string;
    money_status: string;
    dispute_status: string;
    delivered_at: string | null;
    verification_deadline_at: string | null;
    created_at: string;
    seller_id: string;
  };
  item: {
    title: string;
    description: string;
    quantity: number;
    condition_label: string;
    brand: string | null;
    model: string | null;
  } | null;
  pricing: {
    currency_code: string;
    item_amount: number;
    platform_fee_amount: number;
    processing_fee_amount: number;
    seller_net_amount: number;
    buyer_total_amount: number;
  } | null;
  agreement: {
    snapshot_json: Record<string, unknown>;
    locked_at: string;
  } | null;
  tracking: {
    courier_name: string | null;
    tracking_number: string | null;
    tracking_url: string | null;
    shipped_at: string | null;
    delivered_at: string | null;
    expected_delivery_at: string | null;
  } | null;
  escrow: {
    state: string;
    held_amount: number;
    frozen_amount: number;
    released_amount: number;
    refunded_amount: number;
  } | null;
  seller: {
    full_name: string;
    avatar_url: string | null;
  } | null;
  timeline: Array<{
    old_status: string | null;
    new_status: string;
    changed_at: string;
    reason: string | null;
  }>;
}

export const getVerificationData = async (transactionId: string): Promise<VerificationData> => {
  const headers = await getAuthHeader();
  const { data, error } = await supabase.functions.invoke("transaction-verify", {
    headers,
    body: { action: "get_verification_data", transactionId },
  });

  if (error) throw new Error(error.message || "Failed to load verification data");
  if (data?.error) throw new Error(data.error);
  return data as VerificationData;
};

export const confirmReceipt = async (transactionId: string) => {
  const headers = await getAuthHeader();
  const { data, error } = await supabase.functions.invoke("transaction-verify", {
    headers,
    body: { action: "confirm_receipt", transactionId },
  });

  if (error) throw new Error(error.message || "Failed to confirm receipt");
  if (data?.error) throw new Error(data.error);
  return data as { success: boolean; already_confirmed?: boolean; redirect?: string };
};

export const raiseDispute = async (
  transactionId: string,
  reason: string,
  description: string,
) => {
  const headers = await getAuthHeader();
  const { data, error } = await supabase.functions.invoke("transaction-verify", {
    headers,
    body: { action: "raise_dispute", transactionId, reason, description },
  });

  if (error) throw new Error(error.message || "Failed to raise dispute");
  if (data?.error) throw new Error(data.error);
  return data as { success: boolean; dispute_id: string; redirect: string };
};
