import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export async function createStorefrontTransaction(
  productId: string,
  quantity: number
): Promise<{ transaction_id: string; share_token: string; transaction_code: string }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error("Not authenticated");

  const res = await fetch(`${SUPABASE_URL}/functions/v1/storefront-checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ product_id: productId, quantity }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to create transaction");
  return json;
}
