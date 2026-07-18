import { supabase } from "@/integrations/supabase/client";

export interface AdminNotifKpis {
  sent_today: number;
  failed_today: number;
  sms_failures: number;
  email_failures: number;
  in_app_rate: number;
  retry_queue: number;
  sent_delta?: number;
  failed_delta?: number;
  sms_delta?: number;
  email_delta?: number;
  retry_delta?: number;
  in_app_delta?: number;
  compared_to?: string;
}

export interface AdminNotifPerformance {
  channel: "in_app" | "email" | "sms";
  total: number;
  sent: number;
  failed: number;
  rate: number;
}

export interface AdminNotifUser {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

export interface AdminNotifFailedRow {
  delivery_id: string;
  notification_id: string;
  channel: "in_app" | "email" | "sms" | "push";
  attempt_count: number;
  provider_response: string | null;
  failed_at: string;
  title: string;
  type: string | null;
  message: string;
  user: AdminNotifUser | null;
  transaction: { id: string; code: string | null } | null;
  dispute_id: string | null;
  retriable: boolean;
}

export interface AdminNotifRecentRow {
  notification_id: string;
  title: string;
  type: string;
  channel: "in_app" | "email" | "sms" | "push";
  status: string;
  created_at: string;
  user: AdminNotifUser | null;
}

export interface AdminNotificationsResponse {
  kpis: AdminNotifKpis;
  delivery_performance: AdminNotifPerformance[];
  failed: AdminNotifFailedRow[];
  recent: AdminNotifRecentRow[];
  last_sync: string;
}

export async function fetchAdminNotifications(): Promise<AdminNotificationsResponse> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  const { data, error } = await supabase.functions.invoke("admin-notifications", {
    method: "GET",
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) throw new Error(error.message || "Failed to load notifications");
  if (!data || (data as any).error) throw new Error((data as any)?.error || "Failed to load notifications");
  return data as AdminNotificationsResponse;
}

export async function retryNotificationDelivery(deliveryId: string): Promise<{ success: boolean; attempt: number }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  const { data, error } = await supabase.functions.invoke("admin-notifications-action", {
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: { action: "retry", delivery_id: deliveryId },
  });
  if (error) throw new Error(error.message || "Retry failed");
  if (!data || (data as any).error) throw new Error((data as any)?.error || "Retry failed");
  return data as any;
}

export interface BroadcastPayload {
  title: string;
  message: string;
  priority: "low" | "normal" | "high" | "urgent";
  audience: "all" | "buyers" | "sellers" | "verified";
  channels: ("in_app" | "email" | "sms")[];
}

export async function sendBroadcast(payload: BroadcastPayload): Promise<{ success: boolean; recipients: number; deliveries: number }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  const { data, error } = await supabase.functions.invoke("admin-notifications-action", {
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: { action: "broadcast", ...payload },
  });
  if (error) throw new Error(error.message || "Broadcast failed");
  if (!data || (data as any).error) throw new Error((data as any)?.error || "Broadcast failed");
  return data as any;
}