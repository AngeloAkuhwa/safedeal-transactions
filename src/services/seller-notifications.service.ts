import { supabase } from "@/integrations/supabase/client";
import type {
  BuyerNotificationFilters,
  BuyerNotificationsResponse,
  MarkReadResponse,
} from "./notifications.service";

// Re-export shared types: the seller endpoint returns the same shape.
export type SellerNotificationFilters = BuyerNotificationFilters;
export type SellerNotificationsResponse = BuyerNotificationsResponse;

export const getSellerNotifications = async (
  filters: SellerNotificationFilters
): Promise<SellerNotificationsResponse> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const { data, error } = await supabase.functions.invoke("seller-notifications", {
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: filters,
  });

  if (error) throw new Error(error.message || "Failed to load notifications");
  if (!data || data.error) throw new Error(data?.error || "Failed to load notifications");

  return data as SellerNotificationsResponse;
};

export const markSellerNotificationRead = async (
  notificationId: string
): Promise<MarkReadResponse> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const { data, error } = await supabase.functions.invoke("seller-notifications-read", {
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: { notification_id: notificationId },
  });

  if (error) throw new Error(error.message || "Failed to mark notification as read");
  if (!data || data.error) throw new Error(data?.error || "Failed to mark notification as read");
  return data as MarkReadResponse;
};

export const markAllSellerNotificationsRead = async (): Promise<MarkReadResponse> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const { data, error } = await supabase.functions.invoke("seller-notifications-read", {
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: { mark_all: true },
  });

  if (error) throw new Error(error.message || "Failed to mark all notifications as read");
  if (!data || data.error) throw new Error(data?.error || "Failed to mark all notifications as read");
  return data as MarkReadResponse;
};
