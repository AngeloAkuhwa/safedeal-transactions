import { supabase } from "@/integrations/supabase/client";

export interface SellerOfferItem {
  id: string;
  offer_id: string;
  position: number;
  product_title: string;
  short_description: string | null;
  quantity: number;
  unit_price_snapshot: number;
  currency_code: string;
  primary_media_url: string | null;
}

export interface SellerOfferTransaction {
  id: string;
  status: string;
  money_status: string;
  source_offer_id: string;
}

export interface SellerOffer {
  id: string;
  offer_token: string;
  status: "pending_claim" | "linked" | "claimed" | "purchased" | "expired" | "cancelled";
  expires_at: string | null;
  linked_at: string | null;
  claimed_at: string | null;
  purchased_at: string | null;
  expired_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  buyer_id: string | null;
  buyer_email: string | null;
  product: {
    id: string;
    title: string;
    unit_price: number;
    currency_code: string;
    stock_quantity: number;
    reserved_quantity: number;
    status: string;
    primary_image_url: string | null;
  } | null;
  buyer: {
    id: string;
    full_name: string;
    email: string;
    avatar_url: string | null;
  } | null;
  items: SellerOfferItem[];
  items_count: number;
  transaction: SellerOfferTransaction | null;
}

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  return { Authorization: `Bearer ${session.access_token}` };
}

export async function listSellerOffers(): Promise<{ offers: SellerOffer[]; total: number }> {
  const headers = await authHeaders();
  const { data, error } = await supabase.functions.invoke("seller-offers", { headers, method: "GET" });
  if (error) throw new Error(error.message || "Failed to load offers");
  if (!data || data.error) throw new Error(data?.error || "Failed to load offers");
  return data;
}

export async function getSellerOfferDetail(offerId: string): Promise<SellerOffer> {
  const { offers } = await listSellerOffers();
  const found = offers.find((o) => o.id === offerId);
  if (!found) throw new Error("Offer not found");
  return found;
}

export async function cancelSellerOffer(offerId: string): Promise<void> {
  const headers = await authHeaders();
  const { data, error } = await supabase.functions.invoke("seller-offers", {
    headers,
    body: { action: "cancel", offer_id: offerId },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
}

export async function reactivateSellerOffer(offerId: string, expiresInDays = 7): Promise<{ offer_token: string; offer_url: string; expires_at: string }> {
  const headers = await authHeaders();
  const { data, error } = await supabase.functions.invoke("seller-offers", {
    headers,
    body: { action: "reactivate", offer_id: offerId, expires_in_days: expiresInDays },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

/** Edit-matrix helper: can the seller still cancel/regenerate this offer? */
export function canModifyOffer(offer: SellerOffer): { canCancel: boolean; canRegenerate: boolean; reason?: string } {
  if (offer.status === "purchased") {
    return { canCancel: false, canRegenerate: false, reason: "Offer has been purchased and is now a live transaction." };
  }
  if (offer.status === "claimed" && offer.transaction && !["cancelled", "timed_out"].includes(offer.transaction.status)) {
    return { canCancel: false, canRegenerate: false, reason: "A buyer has entered this offer flow. Cancel the linked transaction first." };
  }
  if (offer.status === "cancelled") {
    return { canCancel: false, canRegenerate: true };
  }
  if (offer.status === "expired") {
    return { canCancel: false, canRegenerate: true };
  }
  return { canCancel: true, canRegenerate: false };
}
