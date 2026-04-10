import { supabase } from "@/integrations/supabase/client";

export type VerificationLevel = 'unverified' | 'basic_verified' | 'trusted_buyer' | 'high_trust_buyer';

/**
 * Buyer profile data from the profiles table.
 * NOTE: `phone` stores the submitted phone number — it is NOT proof of verification.
 * The actual trust signal is `account_verifications.phone_verified`.
 */
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
  // Batch 2 additions
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

/** Extract a usable error message from edge function responses */
function extractError(data: unknown, error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error) {
    return (error as { message: string }).message || fallback;
  }
  if (data && typeof data === "object" && "error" in data) {
    return (data as { error: string }).error || fallback;
  }
  return fallback;
}

export const getBuyerProfile = async (): Promise<BuyerProfileResponse> => {
  const { data, error } = await supabase.functions.invoke("buyer-profile", {
    method: "GET",
  });
  if (error || data?.error) {
    throw new Error(extractError(data, error, "Failed to load profile"));
  }
  return data as BuyerProfileResponse;
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
  const { data, error } = await supabase.functions.invoke("buyer-profile", {
    method: "PATCH",
    body: { action: "update_profile", ...updates },
  });
  if (error || data?.error) {
    throw new Error(extractError(data, error, "Failed to update profile"));
  }
  return data;
};

export const updateNotificationPreferences = async (
  prefs: Partial<NotificationPreferences>
) => {
  const { data, error } = await supabase.functions.invoke("buyer-profile", {
    method: "PATCH",
    body: { action: "update_preferences", ...prefs },
  });
  if (error || data?.error) {
    throw new Error(extractError(data, error, "Failed to update preferences"));
  }
  return data;
};

export const updateAvatar = async (avatarUrl: string | null) => {
  const { data, error } = await supabase.functions.invoke("buyer-profile", {
    method: "PATCH",
    body: { action: "update_avatar", avatar_url: avatarUrl },
  });
  if (error || data?.error) {
    throw new Error(extractError(data, error, "Failed to update avatar"));
  }
  return data;
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
    throw new Error(extractError(data, error, "Failed to send OTP"));
  }
  return data as { success: boolean; expires_in: number; message: string; dev_otp?: string };
};

export const verifyPhoneOtp = async (code: string) => {
  const { data, error } = await supabase.functions.invoke("verify-phone", {
    body: { action: "verify_otp", code },
  });
  if (error || data?.error) {
    throw new Error(extractError(data, error, "Failed to verify OTP"));
  }
  return data as { success: boolean; phone_verified: boolean; verification_level: VerificationLevel };
};
