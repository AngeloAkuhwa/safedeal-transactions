import { supabase } from "@/integrations/supabase/client";

export interface NotificationSummary {
  unread_count: number;
  verification_deadlines_count: number;
  active_disputes_count: number;
  escrow_alerts_count: number;
  summary_partial?: boolean;
}

export interface NotificationTransaction {
  id: string;
  code: string;
  status: string;
  money_status: string;
}

export interface NotificationDispute {
  id: string;
}

export interface NotificationAction {
  label: string;
  route: string;
}

export interface NotificationItem {
  id: string;
  db_type: string;
  ui_type: string;
  title: string;
  message: string;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
  transaction: NotificationTransaction | null;
  dispute: NotificationDispute | null;
  primary_action: NotificationAction | null;
}

export interface NotificationPagination {
  page: number;
  page_size: number;
  total_count: number;
  total_pages: number;
}

export interface BuyerNotificationsResponse {
  summary: NotificationSummary;
  items: NotificationItem[];
  pagination: NotificationPagination;
}

export interface BuyerNotificationFilters {
  page?: number;
  page_size?: number;
  type?: string;
  is_read?: boolean;
  search?: string;
}

export interface MarkReadResponse {
  success: boolean;
  updated_count: number;
}

export const getBuyerNotifications = async (
  filters: BuyerNotificationFilters
): Promise<BuyerNotificationsResponse> => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("Not authenticated");
  }

  const { data, error } = await supabase.functions.invoke("buyer-notifications", {
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: filters,
  });

  if (error) {
    throw new Error(error.message || "Failed to load notifications");
  }

  if (!data || data.error) {
    throw new Error(data?.error || "Failed to load notifications");
  }

  return data as BuyerNotificationsResponse;
};

export const markNotificationRead = async (
  notificationId: string
): Promise<MarkReadResponse> => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("Not authenticated");
  }

  const { data, error } = await supabase.functions.invoke("buyer-notifications-read", {
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: { notification_id: notificationId },
  });

  if (error) {
    throw new Error(error.message || "Failed to mark notification as read");
  }

  if (!data || data.error) {
    throw new Error(data?.error || "Failed to mark notification as read");
  }

  return data as MarkReadResponse;
};

export const markAllNotificationsRead = async (): Promise<MarkReadResponse> => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("Not authenticated");
  }

  const { data, error } = await supabase.functions.invoke("buyer-notifications-read", {
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: { mark_all: true },
  });

  if (error) {
    throw new Error(error.message || "Failed to mark all notifications as read");
  }

  if (!data || data.error) {
    throw new Error(data?.error || "Failed to mark all notifications as read");
  }

  return data as MarkReadResponse;
};
