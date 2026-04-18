import { supabase } from "@/integrations/supabase/client";

export interface BuyerOffer {
  id: string;
  offer_token: string;
  status: "pending_claim" | "linked" | "claimed" | "purchased" | "expired" | "cancelled";
  expires_at: string | null;
  linked_at: string | null;
  claimed_at: string | null;
  purchased_at: string | null;
  created_at: string;
  product: {
    id: string;
    title: string;
    unit_price: number;
    currency_code: string;
    available_quantity: number;
    primary_image_url: string | null;
  } | null;
  seller: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    store_slug: string | null;
  } | null;
  transaction: { id: string; status: string; money_status: string } | null;
}

export interface BuyerOffersResponse {
  active: BuyerOffer[];
  past: BuyerOffer[];
  total: number;
}

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  return { Authorization: `Bearer ${session.access_token}` };
}

export async function getBuyerOffers(): Promise<BuyerOffersResponse> {
  const headers = await authHeaders();
  const { data, error } = await supabase.functions.invoke("buyer-offers", { headers });
  if (error) throw new Error(error.message || "Failed to load offers");
  if (!data || data.error) throw new Error(data?.error || "Failed to load offers");
  return data as BuyerOffersResponse;
}

export interface OfferClaimResult {
  scenario:
    | "anon_view"
    | "ready_to_claim"
    | "claimed"
    | "wrong_account"
    | "expired"
    | "cancelled"
    | "already_purchased"
    | "resume_transaction"
    | "not_found";
  offer?: any;
  product?: any;
  seller?: any;
  transaction_id?: string | null;
  status?: string;
  intended_email_hint?: string;
  error?: string;
}

export async function viewOffer(offerToken: string): Promise<OfferClaimResult> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = {};
  if (session) headers.Authorization = `Bearer ${session.access_token}`;

  const { data, error } = await supabase.functions.invoke("claim-offer", {
    headers,
    body: { action: "view", offer_token: offerToken },
  });
  if (error) throw new Error(error.message || "Failed to load offer");
  return data as OfferClaimResult;
}

export async function claimOffer(offerToken: string): Promise<OfferClaimResult> {
  const headers = await authHeaders();
  const { data, error } = await supabase.functions.invoke("claim-offer", {
    headers,
    body: { action: "claim", offer_token: offerToken },
  });
  if (error) throw new Error(error.message || "Failed to claim offer");
  return data as OfferClaimResult;
}
