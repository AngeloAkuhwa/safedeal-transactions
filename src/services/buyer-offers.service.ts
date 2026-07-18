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

  return invokeClaimOffer({ action: "view", offer_token: offerToken }, headers);
}

export async function claimOffer(offerToken: string): Promise<OfferClaimResult> {
  const headers = await authHeaders();
  return invokeClaimOffer({ action: "claim", offer_token: offerToken }, headers);
}

/**
 * Raw-fetch wrapper so 403 commerce-gate responses surface the server `reason`
 * (checkout_disabled / add_to_cart_disabled / vendor_disabled) instead of a
 * generic "Non-2xx response" from supabase.functions.invoke.
 */
async function invokeClaimOffer(
  body: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<OfferClaimResult> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/claim-offer`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* ignore */ }
  if (!res.ok) {
    const reason = typeof json?.reason === "string" ? json.reason : null;
    const errCode = typeof json?.error === "string" ? json.error : null;
    throw new Error(reason || errCode || `Request failed (${res.status})`);
  }
  return json as OfferClaimResult;
}
