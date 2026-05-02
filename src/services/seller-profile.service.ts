import { supabase } from "@/integrations/supabase/client";

export interface SellerProfile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  country_code: string;
  state_name: string | null;
  city_name: string | null;
  created_at: string;
}

export interface SellerVerification {
  email_verified: boolean;
  phone_verified: boolean;
  identity_verified: boolean;
  payout_verified: boolean;
  payout_ready: boolean;
  payout_blocker_reason: "missing" | "unverified" | "no_recipient_code" | null;
  is_region_eligible: boolean;
  verification_level?: string;
}

export interface SellerPermissions {
  verificationLevel: string;
  transactionLimitNaira: number;
  maxConcurrentActiveTransactions: number;
  activeTransactionCount: number;
  canPublishTransaction: boolean;
  canCreateAnotherActiveTransaction: boolean;
  requiresIdentityVerification: boolean;
}

export interface PayoutAccountSummary {
  bank_name: string | null;
  account_name: string | null;
  masked_account_number: string | null;
  verification_status: string;
  last_verified_at: string | null;
  updated_at: string | null;
  payout_ready?: boolean;
  payout_blocker_reason?: "missing" | "unverified" | "no_recipient_code" | null;
}

export interface AccountMeta {
  member_since: string;
  account_status: string;
  role: string;
}

export interface NotificationPreferences {
  payment_updates: boolean;
  delivery_updates: boolean;
  dispute_updates: boolean;
  verification_reminders: boolean;
  system_alerts: boolean;
  marketing_messages: boolean;
}

export interface SellerProfileResponse {
  profile: SellerProfile;
  verification: SellerVerification;
  preferences: NotificationPreferences;
  payout_account: PayoutAccountSummary | null;
  account_meta: AccountMeta;
  permissions: SellerPermissions;
}

function extractError(data: unknown, error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error) {
    return (error as { message: string }).message || fallback;
  }
  if (data && typeof data === "object" && "error" in data) {
    return (data as { error: string }).error || fallback;
  }
  return fallback;
}

export const getSellerProfile = async (): Promise<SellerProfileResponse> => {
  const { data, error } = await supabase.functions.invoke("seller-profile", {
    method: "GET",
  });
  if (error || data?.error) {
    throw new Error(extractError(data, error, "Failed to load profile"));
  }
  return data as SellerProfileResponse;
};

export const updateSellerProfile = async (updates: {
  full_name?: string;
  phone?: string;
  country_code?: string;
  state_name?: string | null;
  city_name?: string | null;
}) => {
  const { data, error } = await supabase.functions.invoke("seller-profile", {
    method: "PATCH",
    body: { action: "update_profile", ...updates },
  });
  if (error || data?.error) {
    throw new Error(extractError(data, error, "Failed to update profile"));
  }
  return data;
};

export const updateSellerPreferences = async (
  prefs: Partial<NotificationPreferences>
) => {
  const { data, error } = await supabase.functions.invoke("seller-profile", {
    method: "PATCH",
    body: { action: "update_preferences", ...prefs },
  });
  if (error || data?.error) {
    throw new Error(extractError(data, error, "Failed to update preferences"));
  }
  return data;
};

export const updateSellerAvatar = async (avatarUrl: string | null) => {
  const { data, error } = await supabase.functions.invoke("seller-profile", {
    method: "PATCH",
    body: { action: "update_avatar", avatar_url: avatarUrl },
  });
  if (error || data?.error) {
    throw new Error(extractError(data, error, "Failed to update avatar"));
  }
  return data;
};
