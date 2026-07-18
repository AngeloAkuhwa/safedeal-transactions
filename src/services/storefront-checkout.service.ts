import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export interface StorefrontDeliverySelection {
  delivery_method: string;
  delivery_address?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country_code?: string;
  } | null;
  contact_phone?: string | null;
}

export async function createStorefrontTransaction(
  productId: string,
  quantity: number,
  delivery?: StorefrontDeliverySelection,
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
    body: JSON.stringify({
      product_id: productId,
      quantity,
      delivery_method: delivery?.delivery_method,
      delivery_address: delivery?.delivery_address ?? null,
      contact_phone: delivery?.contact_phone ?? null,
    }),
  });

  const json = await res.json();
  if (!res.ok) {
    const msg = json.reason || json.error || "Failed to create transaction";
    const err = new Error(msg);
    (err as any).code = json.error;
    throw err;
  }
  return json;
}
