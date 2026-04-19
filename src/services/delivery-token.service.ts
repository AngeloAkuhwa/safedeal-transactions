// Public client for the rider-facing delivery confirmation flow.
// These endpoints are public (no JWT) so we use the anon key + raw fetch.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export interface DeliveryTokenInfo {
  success: true;
  transaction_code: string;
  item_title: string;
  seller_name: string;
  buyer_name_first: string;
  masked_buyer_phone: string | null;
  has_phone: boolean;
  token_status: string;
}

export interface DeliveryOtpSendResult {
  success: true;
  masked_buyer_phone: string | null;
  expires_in: number;
  dev_otp?: string;
}

export interface DeliveryOtpConfirmResult {
  success: true;
  already_delivered: boolean;
  message: string;
}

async function callPublic<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok || json?.error) {
    throw new Error(json?.error || `Request failed (${res.status})`);
  }
  return json as T;
}

export function lookupDeliveryToken(token: string): Promise<DeliveryTokenInfo> {
  return callPublic<DeliveryTokenInfo>("delivery-token-lookup", { token, action: "lookup" });
}

export function sendDeliveryOtp(token: string): Promise<DeliveryOtpSendResult> {
  return callPublic<DeliveryOtpSendResult>("delivery-token-lookup", { token, action: "send_otp" });
}

export function confirmDeliveryOtp(token: string, otpCode: string): Promise<DeliveryOtpConfirmResult> {
  return callPublic<DeliveryOtpConfirmResult>("delivery-token-confirm", { token, otp_code: otpCode });
}
