/**
 * Admin Notification Center — write actions: retry and broadcast.
 * POST { action: "retry", delivery_id } | { action: "broadcast", title, message, priority, audience, channels[] }
 */
import { requireAdmin, authErrorResponse } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Audience = "all" | "buyers" | "sellers" | "verified";
type Channel = "in_app" | "email" | "sms";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  let ctx;
  try { ctx = await requireAdmin(req); }
  catch (err) {
    const r = authErrorResponse(err, corsHeaders);
    if (r) return r;
    return json(500, { error: "auth_failed" });
  }
  const admin = ctx.adminClient;
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "");

  if (action === "retry") {
    const deliveryId = String(body.delivery_id ?? "");
    if (!deliveryId) return json(400, { error: "delivery_id_required" });
    const { data: del } = await admin.from("notification_deliveries")
      .select("id, notification_id, attempt_count, channel").eq("id", deliveryId).maybeSingle();
    if (!del) return json(404, { error: "delivery_not_found" });
    if ((del.attempt_count ?? 0) >= 3) return json(409, { error: "max_attempts_reached" });

    // Mark as pending (retry). Actual send is handled by the delivery worker downstream.
    const nextAttempt = (del.attempt_count ?? 0) + 1;
    const { error: upErr } = await admin.from("notification_deliveries")
      .update({ delivery_status: "pending", attempt_count: nextAttempt, sent_at: null })
      .eq("id", deliveryId);
    if (upErr) return json(500, { error: "retry_update_failed", details: upErr.message });

    const { data: n } = await admin.from("notifications").select("user_id").eq("id", del.notification_id).maybeSingle();
    await admin.from("audit_logs").insert({
      action: "admin_action",
      actor_user_id: ctx.userId,
      target_user_id: n?.user_id ?? null,
      description: "notification_retried",
      metadata: { delivery_id: deliveryId, notification_id: del.notification_id, channel: del.channel, attempt: nextAttempt },
    });
    return json(200, { success: true, attempt: nextAttempt });
  }

  if (action === "broadcast") {
    const title = String(body.title ?? "").trim();
    const message = String(body.message ?? "").trim();
    const priority = String(body.priority ?? "normal");
    const audience = String(body.audience ?? "all") as Audience;
    const channels = Array.isArray(body.channels) ? body.channels as Channel[] : ["in_app"];
    if (!title || !message) return json(400, { error: "title_and_message_required" });
    if (!channels.length) return json(400, { error: "channels_required" });

    // Resolve audience
    let userIds: string[] = [];
    if (audience === "buyers" || audience === "sellers") {
      const { data } = await admin.from("user_roles").select("user_id").eq("role", audience === "buyers" ? "buyer" : "seller");
      userIds = Array.from(new Set((data ?? []).map((r: any) => r.user_id)));
    } else if (audience === "verified") {
      const { data } = await admin.from("profiles").select("id").eq("verification_status", "verified");
      userIds = (data ?? []).map((r: any) => r.id);
    } else {
      const { data } = await admin.from("profiles").select("id");
      userIds = (data ?? []).map((r: any) => r.id);
    }

    // Respect notification_preferences: skip users where system_alerts=false
    if (userIds.length) {
      const { data: prefs } = await admin.from("notification_preferences")
        .select("user_id, system_alerts").in("user_id", userIds);
      const optedOut = new Set((prefs ?? []).filter((p: any) => p.system_alerts === false).map((p: any) => p.user_id));
      userIds = userIds.filter((id) => !optedOut.has(id));
    }

    if (!userIds.length) return json(200, { success: true, recipients: 0, deliveries: 0 });

    const broadcastId = crypto.randomUUID();
    // Insert one notification per user PER channel (matches schema: channel is on notifications).
    const notifRows = userIds.flatMap((uid) => channels.map((ch) => ({
      user_id: uid,
      type: "system_message",
      channel: ch,
      title,
      message,
      status: ch === "in_app" ? "sent" : "pending",
      metadata: { broadcast_id: broadcastId, priority, audience, sent_by: ctx.userId },
    })));

    // Batch insert (chunk to avoid huge payloads)
    const chunkSize = 500;
    const insertedIds: string[] = [];
    for (let i = 0; i < notifRows.length; i += chunkSize) {
      const chunk = notifRows.slice(i, i + chunkSize);
      const { data, error } = await admin.from("notifications").insert(chunk).select("id, channel");
      if (error) return json(500, { error: "notification_insert_failed", details: error.message });
      for (const r of (data ?? [])) insertedIds.push(r.id);
    }

    // Delivery rows for non-in_app channels
    const { data: created } = await admin.from("notifications")
      .select("id, channel").in("id", insertedIds);
    const delRows = (created ?? [])
      .filter((n: any) => n.channel !== "in_app")
      .map((n: any) => ({
        notification_id: n.id,
        channel: n.channel,
        delivery_status: "pending",
        attempt_count: 0,
      }));
    if (delRows.length) {
      for (let i = 0; i < delRows.length; i += chunkSize) {
        await admin.from("notification_deliveries").insert(delRows.slice(i, i + chunkSize));
      }
    }

    await admin.from("admin_actions").insert({
      admin_user_id: ctx.userId,
      action_type: "note_added",
      action_notes: `Broadcast: ${title} (audience=${audience}, channels=${channels.join(",")}, recipients=${userIds.length})`,
    });

    return json(200, { success: true, broadcast_id: broadcastId, recipients: userIds.length, deliveries: notifRows.length });
  }

  return json(400, { error: "unknown_action" });
});