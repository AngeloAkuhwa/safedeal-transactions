/**
 * Admin Notification Center — write actions: retry and broadcast.
 * POST { action: "retry", delivery_id } | { action: "broadcast", title, message, priority, audience, channels[] }
 */
import { requireAdmin, authErrorResponse , requirePermission} from "../_shared/auth.ts";
import { logAdminAction, extractRequestMeta } from "../_shared/audit.ts";

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

  let ctx;
  try { ctx = await requirePermission(req, "platform_configuration.configure"); }
  catch (err) {
    const r = authErrorResponse(err, corsHeaders);
    if (r) return r;
    return json(500, { error: "auth_failed" });
  }

  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const admin = ctx.adminClient;
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "");
  const meta = extractRequestMeta(req);

  if (action === "retry") {
    const deliveryId = String(body.delivery_id ?? "");
    if (!deliveryId) return json(400, { error: "delivery_id_required" });
    const { data: del } = await admin.from("notification_deliveries")
      .select("id, notification_id, attempt_count, channel").eq("id", deliveryId).maybeSingle();
    if (!del) return json(404, { error: "delivery_not_found" });

    // Admin manual retry: reset attempts so the worker (which filters attempt_count<3) picks it up.
    const previousAttempts = del.attempt_count ?? 0;
    const { error: upErr } = await admin.from("notification_deliveries")
      .update({ delivery_status: "pending", attempt_count: 0, sent_at: null, provider_response: null })
      .eq("id", deliveryId);
    if (upErr) return json(500, { error: "retry_update_failed", details: upErr.message });
    // Reset parent notification so UI reflects "pending" again.
    await admin.from("notifications").update({ status: "pending" })
      .eq("id", del.notification_id).in("status", ["failed", "sent"]);

    const { data: n } = await admin.from("notifications").select("user_id").eq("id", del.notification_id).maybeSingle();
    await logAdminAction(admin, {
      actorId: ctx.userId,
      action: "notification_retried",
      targetType: "notification",
      targetId: del.notification_id,
      before: { delivery_status: "failed", attempt_count: previousAttempts },
      after: { delivery_status: "pending", attempt_count: 0 },
      metadata: { delivery_id: deliveryId, channel: del.channel, manual_admin_retry: true, target_user_id: n?.user_id ?? null },
      mirrorToAuditLogs: true,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return json(200, { success: true, attempt: 0 });
  }

  if (action === "retry_all_failed") {
    const channel = body?.channel ? String(body.channel) : null;
    const notificationType = body?.notification_type ? String(body.notification_type) : null;
    let q = admin.from("notification_deliveries")
      .select("id, notification_id, channel, attempt_count")
      .eq("delivery_status", "failed");
    if (channel) q = q.eq("channel", channel);
    const { data: failed, error: fErr } = await q.limit(1000);
    if (fErr) return json(500, { error: "list_failed_failed", details: fErr.message });
    let rows = failed ?? [];
    if (notificationType && rows.length) {
      const { data: notifs } = await admin.from("notifications")
        .select("id").in("id", rows.map((r: any) => r.notification_id)).eq("type", notificationType);
      const keep = new Set((notifs ?? []).map((n: any) => n.id));
      rows = rows.filter((r: any) => keep.has(r.notification_id));
    }
    if (!rows.length) return json(200, { success: true, retried: 0 });

    const deliveryIds = rows.map((r: any) => r.id);
    const notificationIds = Array.from(new Set(rows.map((r: any) => r.notification_id)));
    const chunk = <T,>(arr: T[], n: number) => { const out: T[][] = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };

    for (const ids of chunk(deliveryIds, 200)) {
      const { error } = await admin.from("notification_deliveries")
        .update({ delivery_status: "pending", attempt_count: 0, sent_at: null, provider_response: null })
        .in("id", ids);
      if (error) return json(500, { error: "bulk_retry_update_failed", details: error.message });
    }
    for (const ids of chunk(notificationIds, 200)) {
      await admin.from("notifications").update({ status: "pending" })
        .in("id", ids).in("status", ["failed", "sent"]);
    }
    await logAdminAction(admin, {
      actorId: ctx.userId,
      action: "notifications_bulk_retried",
      targetType: "notification",
      metadata: { count: deliveryIds.length, channel, notification_type: notificationType, manual_admin_retry: true },
      mirrorToAuditLogs: true,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return json(200, { success: true, retried: deliveryIds.length });
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
      const { data } = await admin.from("identity_submissions").select("user_id").eq("status", "approved");
      userIds = Array.from(new Set((data ?? []).map((r: any) => r.user_id)));
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

    await logAdminAction(admin, {
      actorId: ctx.userId,
      action: "broadcast_notification",
      targetType: "notification",
      targetId: broadcastId,
      reason: title,
      metadata: { broadcast_id: broadcastId, audience, channels, priority, recipients: userIds.length, deliveries: notifRows.length, message },
      mirrorToAuditLogs: true,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return json(200, { success: true, broadcast_id: broadcastId, recipients: userIds.length, deliveries: notifRows.length });
  }

  return json(400, { error: "unknown_action" });
});