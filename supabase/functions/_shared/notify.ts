import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type NotificationType =
  | "transaction_update"
  | "payment_update"
  | "delivery_update"
  | "dispute_update"
  | "verification_update"
  | "security_alert"
  | "system_message"
  | "direct_message";

export interface NotifyPayload {
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  related_transaction_id?: string | null;
  related_dispute_id?: string | null;
  metadata?: Record<string, unknown>;
  channel?: "in_app" | "email" | "sms" | "push";
}

export async function notifyUser(admin: SupabaseClient, payload: NotifyPayload): Promise<void> {
  try {
    await admin.from("notifications").insert({
      user_id: payload.user_id,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      related_transaction_id: payload.related_transaction_id ?? null,
      related_dispute_id: payload.related_dispute_id ?? null,
      metadata: payload.metadata ?? null,
      channel: payload.channel ?? "in_app",
      status: "pending",
    });
  } catch (e) {
    console.error("[notifyUser] failed:", e);
  }
}

/** Fan out a notification to every admin user. Best-effort. */
export async function notifyOpsTeam(admin: SupabaseClient, payload: Omit<NotifyPayload, "user_id">): Promise<void> {
  try {
    const { data: admins } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    if (!admins?.length) return;
    const rows = admins.map((a: { user_id: string }) => ({
      user_id: a.user_id,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      related_transaction_id: payload.related_transaction_id ?? null,
      related_dispute_id: payload.related_dispute_id ?? null,
      metadata: payload.metadata ?? null,
      channel: payload.channel ?? "in_app",
      status: "pending",
    }));
    await admin.from("notifications").insert(rows);
  } catch (e) {
    console.error("[notifyOpsTeam] failed:", e);
  }
}