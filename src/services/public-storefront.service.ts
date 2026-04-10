const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export async function getPublicStorefront(sellerSlug: string, filters?: {
  search?: string;
  category?: string;
  page?: number;
}) {
  const params = new URLSearchParams({ seller_slug: sellerSlug });
  if (filters?.search) params.set("search", filters.search);
  if (filters?.category && filters.category !== "all") params.set("category", filters.category);
  if (filters?.page) params.set("page", String(filters.page));

  const res = await fetch(`${SUPABASE_URL}/functions/v1/public-storefront?${params}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to load storefront");
  return json;
}

export async function getPublicProductDetail(sellerSlug: string, productSlug: string) {
  const params = new URLSearchParams({
    seller_slug: sellerSlug,
    product_slug: productSlug,
  });

  const res = await fetch(`${SUPABASE_URL}/functions/v1/public-product-detail?${params}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to load product");
  return json;
}
