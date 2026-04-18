import { supabase } from "@/integrations/supabase/client";

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  return { Authorization: `Bearer ${session.access_token}` };
}

export interface AdminOfferListItem {
  id: string;
  offer_token: string;
  status: string;
  expires_at: string | null;
  created_at: string;
  buyer_email: string | null;
  seller: { id: string; full_name: string; email: string } | null;
  buyer: { id: string; full_name: string; email: string } | null;
  product: { id: string; title: string; unit_price: number; currency_code: string; status: string } | null;
}

export async function adminListOffers(status: string = "all", page: number = 1) {
  const headers = await authHeaders();
  const params = new URLSearchParams();
  if (status && status !== "all") params.set("status", status);
  params.set("page", String(page));

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const url = `https://${projectId}.supabase.co/functions/v1/admin-offers?${params.toString()}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || "Failed to load offers");
  }
  return res.json() as Promise<{
    offers: AdminOfferListItem[];
    total: number;
    page: number;
    page_size: number;
  }>;
}

export async function adminGetOfferDetail(offerId: string) {
  const headers = await authHeaders();
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const url = `https://${projectId}.supabase.co/functions/v1/admin-offers?offer_id=${encodeURIComponent(offerId)}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || "Failed to load offer");
  }
  return res.json();
}
