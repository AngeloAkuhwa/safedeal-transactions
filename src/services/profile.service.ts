import { supabase } from "@/integrations/supabase/client";

export type VerificationLevel = 'unverified' | 'basic_verified' | 'trusted_buyer' | 'high_trust_buyer';

export interface BuyerProfile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  country_code: string;
  state_name: string | null;
  city_name: string | null;
  is_region_eligible?: boolean;
  created_at: string;
}

export interface VerificationStatus {
  email_verified: boolean;
  phone_verified: boolean;
  identity_verified: boolean;
  payout_verified: boolean;
  verification_level: VerificationLevel;
}

export interface BuyerPermissions {
  canStartProtectedPayment: boolean;
  canOpenDispute: boolean;
  canHoldActiveTransaction: boolean;
  requiresPhoneVerification: boolean;
  requiresLocation: boolean;
  transactionLimitNaira: number;
  maxConcurrentActiveTransactions: number;
  verificationLevel: VerificationLevel;
  canCreateAnotherActiveTransaction: boolean;
  canAccessHighValueTransaction: boolean;
  canReceiveHighTierRefund: boolean;
  requiresIdentityVerification: boolean;
  activeTransactionCount: number;
  isRegionEligible: boolean;
}

export interface NotificationPreferences {
  payment_updates: boolean;
  delivery_updates: boolean;
  dispute_updates: boolean;
  verification_reminders: boolean;
  system_alerts: boolean;
  marketing_messages: boolean;
}

export interface BuyerProfileResponse {
  profile: BuyerProfile;
  verification: VerificationStatus;
  preferences: NotificationPreferences;
  permissions: BuyerPermissions;
}

export interface ServiceableRegion {
  id: string;
  country_code: string;
  state_name: string;
  city_name: string | null;
  is_active: boolean;
}

// ── Helpers ──

const PROFILE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/buyer-profile`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("No active session. Please sign in again.");
  return token;
}

async function profileFetch(method: string, body?: unknown) {
  const token = await getAccessToken();
  const options: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: ANON_KEY,
    },
  };
  if (body) options.body = JSON.stringify(body);
  const res = await fetch(PROFILE_URL, options);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Request failed: ${res.status}`);
  return json;
}

// ── Public API ──

export const getBuyerProfile = async (): Promise<BuyerProfileResponse> => {
  return profileFetch("GET") as Promise<BuyerProfileResponse>;
};

export const getServiceableRegions = async (): Promise<ServiceableRegion[]> => {
  const { data, error } = await supabase
    .from("serviceable_regions")
    .select("id, country_code, state_name, city_name, is_active")
    .eq("country_code", "NG")
    .order("state_name");
  if (error) throw new Error(error.message);
  return (data ?? []) as ServiceableRegion[];
};

export const updateProfile = async (updates: {
  full_name?: string;
  phone?: string;
  country_code?: string;
  state_name?: string | null;
  city_name?: string | null;
}) => {
  return profileFetch("PATCH", { action: "update_profile", ...updates });
};

export const updateNotificationPreferences = async (
  prefs: Partial<NotificationPreferences>
) => {
  return profileFetch("PATCH", { action: "update_preferences", ...prefs });
};

export const updateAvatar = async (avatarUrl: string | null) => {
  return profileFetch("PATCH", { action: "update_avatar", avatar_url: avatarUrl });
};

export const changePassword = async (newPassword: string) => {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message || "Failed to change password");
};

// ── Phone OTP ──

export const sendPhoneOtp = async (phone: string) => {
  const { data, error } = await supabase.functions.invoke("verify-phone", {
    body: { action: "send_otp", phone },
  });
  if (error || data?.error) {
    const msg = data?.error || (error as any)?.message || "Failed to send OTP";
    throw new Error(msg);
  }
  return data as { success: boolean; expires_in: number; message: string; dev_otp?: string };
};

export const verifyPhoneOtp = async (code: string) => {
  const { data, error } = await supabase.functions.invoke("verify-phone", {
    body: { action: "verify_otp", code },
  });
  if (error || data?.error) {
    const msg = data?.error || (error as any)?.message || "Failed to verify OTP";
    throw new Error(msg);
  }
  return data as { success: boolean; phone_verified: boolean; verification_level: VerificationLevel };
};
