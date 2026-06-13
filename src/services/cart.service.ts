import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

async function getToken() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("Not authenticated");
  return token;
}

async function cartRequest(method: string, body?: any) {
  const token = await getToken();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/buyer-cart`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Cart request failed");
  return json;
}

export interface CartProduct {
  id: string;
  title: string;
  slug: string;
  unit_price: number;
  currency_code: string;
  stock_quantity: number;
  reserved_quantity: number;
  available_quantity: number;
  status: string;
  is_active: boolean;
  visibility_type: string;
  short_description: string | null;
  primary_image: string | null;
  seller_id: string;
  seller_name: string;
  seller_slug: string | null;
  /** JSON-encoded array of enabled delivery methods, or a single method string. */
  delivery_method?: string | null;
}

export interface CartItem {
  id: string;
  product_id: string;
  quantity: number;
  created_at: string;
  updated_at: string;
  product: CartProduct | null;
}

export async function getCartItems(): Promise<{ items: CartItem[]; count: number }> {
  return cartRequest("GET");
}

export async function addToCart(productId: string, quantity = 1) {
  return cartRequest("POST", { action: "add", product_id: productId, quantity });
}

export async function removeFromCart(productId: string) {
  return cartRequest("POST", { action: "remove", product_id: productId });
}

export async function updateCartQuantity(productId: string, quantity: number) {
  return cartRequest("POST", { action: "update_quantity", product_id: productId, quantity });
}

export async function checkInCart(productId: string): Promise<{ in_cart: boolean; quantity: number }> {
  return cartRequest("POST", { action: "check", product_id: productId });
}

export interface CartDeliveryAddress {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country_code?: string;
}

export interface CartDeliverySelection {
  cart_item_id: string;
  delivery_method: string;
  delivery_address?: CartDeliveryAddress | null;
  contact_phone?: string | null;
}

export async function checkoutSelected(
  cartItemIds: string[],
  deliverySelections: CartDeliverySelection[] = [],
) {
  const token = await getToken();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/cart-checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      cart_item_ids: cartItemIds,
      delivery_selections: deliverySelections,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Checkout failed");
  return json;
}
