import { supabase } from "@/integrations/supabase/client";

export interface BuyerProfile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  country_code: string;
  created_at: string;
}

export interface VerificationStatus {
  email_verified: boolean;
  phone_verified: boolean;
  identity_verified: boolean;
  payout_verified: boolean;
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

export const updateProfile = async (updates: {
  full_name?: string;
  phone?: string;
  country_code?: string;
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
