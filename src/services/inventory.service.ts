import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export interface InventoryLogEntry {
  id: string;
  change_type: "restock" | "reserve" | "release" | "sold" | "manual_adjustment";
  quantity_delta: number;
  balance_after: number;
  reference_type: string | null;
  reference_id: string | null;
  notes: string | null;
  created_at: string;
  changed_by_user_id: string | null;
}

/**
 * Add stock to a product. Logs as a `restock` inventory movement.
 */
export async function restockProduct(productId: string, delta: number, notes?: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const res = await fetch(
    `${SUPABASE_URL}/functions/v1/seller-product-detail?product_id=${productId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "restock", delta, notes }),
    }
  );

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to restock");
  return json as {
    success: boolean;
    stock_quantity: number;
    reserved_quantity: number;
    available_quantity: number;
  };
}

/**
 * Set the stock quantity to an absolute value. Logs as `manual_adjustment`
 * with the signed delta (positive = added, negative = removed). Use this
 * for in-place edits from the stock-update modal so every change appears
 * in the inventory history.
 */
export async function setStockQuantity(productId: string, newStockQuantity: number, notes?: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const res = await fetch(
    `${SUPABASE_URL}/functions/v1/seller-product-detail?product_id=${productId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "manual_adjustment", new_stock_quantity: newStockQuantity, notes }),
    },
  );

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to update stock");
  return json as {
    success: boolean;
    stock_quantity: number;
    reserved_quantity: number;
    available_quantity: number;
  };
}

/**
 * Fetch the last 20 inventory log entries for a product.
 */
export async function getInventoryLogs(productId: string): Promise<InventoryLogEntry[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const res = await fetch(
    `${SUPABASE_URL}/functions/v1/seller-product-detail?product_id=${productId}&logs=1`,
    {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
    }
  );

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to load inventory logs");
  return (json.logs || []) as InventoryLogEntry[];
}
