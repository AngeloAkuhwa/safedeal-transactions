import { supabase } from "@/integrations/supabase/client";

export interface SellerTrustSummary {
  verification_level: string;
  email_verified: boolean;
  phone_verified: boolean;
  identity_verified: boolean;
}

export interface MarketplaceSeller {
  full_name: string;
  store_slug: string | null;
  avatar_url: string | null;
  trust_summary: SellerTrustSummary;
}

export interface MarketplaceProduct {
  id: string;
  title: string;
  slug: string;
  short_description: string | null;
  unit_price: number;
  currency_code: string;
  stock_quantity: number;
  condition_label: string | null;
  category_id: string | null;
  primary_image_url: string | null;
  seller: MarketplaceSeller;
}

export interface MarketplaceCategory {
  id: string;
  name: string;
  slug: string;
  icon_name: string | null;
  product_count: number;
}

export interface MarketplaceFilters {
  search?: string;
  category?: string;
  sort?: string;
  page?: number;
}

export interface MarketplaceResponse {
  products: MarketplaceProduct[];
  categories: MarketplaceCategory[];
  total: number;
  page: number;
  page_size: number;
}

export async function getMarketplaceProducts(
  filters: MarketplaceFilters
): Promise<MarketplaceResponse> {
  const params: Record<string, string> = {};
  if (filters.search) params.search = filters.search;
  if (filters.category) params.category = filters.category;
  if (filters.sort) params.sort = filters.sort;
  if (filters.page) params.page = String(filters.page);

  const queryString = new URLSearchParams(params).toString();
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const url = `https://${projectId}.supabase.co/functions/v1/marketplace${queryString ? `?${queryString}` : ""}`;

  const { data: { session } } = await supabase.auth.getSession();

  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      ...(session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {}),
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to load marketplace");
  }

  return res.json();
}
