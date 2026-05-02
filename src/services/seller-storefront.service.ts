import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface CreateProductPayload {
  title: string;
  category_id?: string | null;
  short_description?: string;
  description: string;
  condition_label?: string;
  sku?: string;
  brand?: string;
  model?: string;
  currency_code?: string;
  original_price?: number;
  unit_price: number;
  stock_quantity: number;
  visibility_type?: string;
  seller_notes?: string;
  agreement_terms?: string;
  delivery_methods?: string[];
  verification_window_hours?: number;
  file_ids?: Array<{ file_id: string; media_type: string }>;
  status?: string;
  feature_highlights?: Array<{ title: string; description: string }>;
  delivery_scope?: string;
  estimated_delivery_days?: string;
}

interface UpdateProductPayload extends Partial<CreateProductPayload> {
  status?: string;
}

export async function getSellerProducts(filters?: {
  status?: string;
  visibility?: string;
  category?: string;
  search?: string;
  page?: number;
}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const params = new URLSearchParams();
  if (filters?.status && filters.status !== "all") params.set("status", filters.status);
  if (filters?.visibility && filters.visibility !== "all") params.set("visibility", filters.visibility);
  if (filters?.category && filters.category !== "all") params.set("category", filters.category);
  if (filters?.search) params.set("search", filters.search);
  if (filters?.page) params.set("page", String(filters.page));

  const res = await fetch(`${SUPABASE_URL}/functions/v1/seller-products?${params}`, {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to load products");
  return json;
}

export async function createProduct(payload: CreateProductPayload) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const res = await fetch(`${SUPABASE_URL}/functions/v1/seller-products`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to create product");
  return json;
}

export async function getSellerProductDetail(productId: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const res = await fetch(
    `${SUPABASE_URL}/functions/v1/seller-product-detail?product_id=${productId}`,
    {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
    }
  );

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to load product");
  return json;
}

export async function updateProduct(productId: string, payload: UpdateProductPayload) {
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
      body: JSON.stringify(payload),
    }
  );

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to update product");
  return json;
}

export async function archiveProduct(productId: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const res = await fetch(
    `${SUPABASE_URL}/functions/v1/seller-product-detail?product_id=${productId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
    }
  );

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to archive product");
  return json;
}

export async function getProductCategories() {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/product-categories`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to load categories");
  return json.categories;
}

export async function duplicateProduct(productId: string): Promise<{ id: string; slug: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const res = await fetch(`${SUPABASE_URL}/functions/v1/seller-products`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "duplicate", product_id: productId }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to duplicate product");
  return json;
}
