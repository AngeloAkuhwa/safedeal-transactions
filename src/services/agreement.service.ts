import { supabase } from "@/integrations/supabase/client";

async function getAuthHeader() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  return { Authorization: `Bearer ${session.access_token}` };
}

export interface AgreementData {
  transaction: {
    id: string;
    transaction_code: string;
    status: string;
    money_status: string;
    created_at: string;
  };
  snapshot: {
    snapshot_json: Record<string, unknown>;
    locked_at: string;
    locked_by_user_id: string | null;
  } | null;
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
    paystack_fee_amount: number;
    platform_fee_amount: number;
    service_fee_amount: number;
    service_fee_rate: number;
    total_amount: number;
  } | null;
  delivery: {
    delivery_method: string;
    expected_delivery_date: string;
    verification_window_hours: number;
    delivery_address_line1: string | null;
    delivery_address_line2: string | null;
    delivery_city: string | null;
    delivery_state: string | null;
    delivery_postal_code: string | null;
    delivery_country_code: string | null;
  } | null;
  seller: {
    full_name: string;
    avatar_url: string | null;
  } | null;
  escrow: {
    state: string;
    held_amount: number;
    frozen_amount: number;
    released_amount: number;
    refunded_amount: number;
  } | null;
  productMedia?: Array<{
    product_id: string;
    file_url: string;
    secure_url: string | null;
    mime_type: string | null;
    media_type: string;
    sort_order: number;
    is_primary: boolean;
  }>;
  bundleItems?: Array<{
    product_id: string;
    product_title: string;
    short_description: string | null;
    condition_summary: string | null;
    quantity: number;
    unit_price_snapshot: number;
    currency_code: string;
    primary_media_url: string | null;
    position: number;
  }>;
}

export const getAgreementData = async (transactionId: string): Promise<AgreementData> => {
  const headers = await getAuthHeader();
  const { data, error } = await supabase.functions.invoke("transaction-agreement", {
    headers,
    body: { transactionId },
  });

  if (error) throw new Error(error.message || "Failed to load agreement data");
  if (data?.error) throw new Error(data.error);
  return data as AgreementData;
};
