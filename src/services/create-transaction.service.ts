import { supabase } from "@/integrations/supabase/client";

export interface DraftTransaction {
  transaction_id: string;
  transaction_code: string;
  buyer_name: string;
  buyer_contact: string;
  item_title: string;
  item_description: string;
  item_quantity: number;
  item_condition: string;
  price: number;
  currency_code: string;
  delivery_method: string;
  expected_delivery_date: string;
  verification_window_hours: number;
  seller_notes: string;
  created_at: string;
}

export interface CreateTransactionData {
  transaction_id?: string;
  buyer_name: string;
  buyer_contact: string;
  item_title: string;
  item_description: string;
  item_quantity: number;
  item_condition: string;
  price: number;
  currency_code: string;
  delivery_method: string;
  expected_delivery_date: string;
  verification_window_hours: number;
  seller_notes: string;
}

async function getAuthHeader() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  return { Authorization: `Bearer ${session.access_token}` };
}

export async function getSellerDrafts(): Promise<DraftTransaction[]> {
  const headers = await getAuthHeader();
  const { data, error } = await supabase.functions.invoke("seller-drafts", { headers });
  if (error) throw new Error(error.message || "Failed to load drafts");
  if (!data || data.error) throw new Error(data?.error || "Failed to load drafts");
  return data.drafts as DraftTransaction[];
}

export async function saveDraft(formData: CreateTransactionData): Promise<{ transaction_id: string }> {
  const headers = await getAuthHeader();
  const { data, error } = await supabase.functions.invoke("create-transaction", {
    headers,
    body: { action: "save_draft", ...formData },
  });
  if (error) throw new Error(error.message || "Failed to save draft");
  if (!data || data.error) throw new Error(data?.error || "Failed to save draft");
  return data;
}

export async function publishTransaction(transactionId: string): Promise<{ share_url: string }> {
  const headers = await getAuthHeader();
  const { data, error } = await supabase.functions.invoke("create-transaction", {
    headers,
    body: { action: "publish", transaction_id: transactionId },
  });
  if (error) throw new Error(error.message || "Failed to publish transaction");
  if (!data || data.error) throw new Error(data?.error || "Failed to publish transaction");
  return data;
}
