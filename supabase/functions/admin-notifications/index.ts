/**
 * Admin Notification Center — read aggregator.
 * GET: returns KPIs, delivery performance, failed list, recent activity.
 */
import { requireAdmin, authErrorResponse } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET") return json(405, { error: "method_not_allowed" });

  let ctx;
  try { ctx = await requireAdmin(req); }
  catch (err) {
    const r = authErrorResponse(err, corsHeaders);
    if (r) return r;
    return json(500, { error: "auth_failed" });
  }
  const admin = ctx.adminClient;

  const now = Date.now();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();

  // Pull last-24h notifications + deliveries.
  const [{ data: notifs24 }, { data: dels24 }] = await Promise.all([
    admin.from("notifications")
      .select("id, user_id, type, channel, title, message, status, is_read, created_at, related_transaction_id, related_dispute_id")
      .gte("created_at", dayAgo)
      .order("created_at", { ascending: false })
      .limit(1000),
    admin.from("notification_deliveries")
      .select("id, notification_id, channel, delivery_status, provider_response, attempt_count, sent_at, created_at")
      .gte("created_at", dayAgo)
      .order("created_at", { ascending: false })
      .limit(2000),
  ]);

  const notifs = notifs24 ?? [];
  const dels = dels24 ?? [];

  // Latest delivery per notification.
  const latestByNotif = new Map<string, typeof dels[number]>();
  for (const d of dels) {
    const prev = latestByNotif.get(d.notification_id);
    if (!prev || new Date(d.created_at) > new Date(prev.created_at)) {
      latestByNotif.set(d.notification_id, d);
    }
  }
  const latestDels = Array.from(latestByNotif.values());

  // KPIs
  const sentToday = notifs.filter((n) => n.status === "sent" || n.status === "read").length;
  const failedToday = latestDels.filter((d) => d.delivery_status === "failed").length;
  const smsFailures = latestDels.filter((d) => d.channel === "sms" && d.delivery_status === "failed").length;
  const emailFailures = latestDels.filter((d) => d.channel === "email" && d.delivery_status === "failed").length;
  const retryQueue = latestDels.filter((d) => d.delivery_status === "failed" && (d.attempt_count ?? 0) < 3).length;
  const inAppTotal = notifs.filter((n) => n.channel === "in_app").length;
  const inAppDelivered = notifs.filter((n) => n.channel === "in_app" && (n.status === "sent" || n.status === "read")).length;
  const inAppRate = inAppTotal ? Math.round((inAppDelivered / inAppTotal) * 1000) / 10 : 0;

  // Delivery performance per channel
  const perChannel = (ch: "in_app" | "email" | "sms") => {
    const scope = latestDels.filter((d) => d.channel === ch);
    const ok = scope.filter((d) => d.delivery_status === "sent").length;
    const total = scope.length;
    return {
      channel: ch,
      total,
      sent: ok,
      failed: scope.filter((d) => d.delivery_status === "failed").length,
      rate: total ? Math.round((ok / total) * 1000) / 10 : 0,
    };
  };
  const deliveryPerformance = [perChannel("in_app"), perChannel("email"), perChannel("sms")];

  // Failed deliveries (join notification + profile)
  const failedDels = latestDels
    .filter((d) => d.delivery_status === "failed")
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 50);

  const notifById = new Map(notifs.map((n) => [n.id, n] as const));
  const failedNotifs = failedDels.map((d) => notifById.get(d.notification_id)).filter(Boolean) as typeof notifs;
  const userIds = Array.from(new Set(failedNotifs.map((n) => n!.user_id).filter(Boolean)));
  const txIds = Array.from(new Set(failedNotifs.map((n) => n!.related_transaction_id).filter(Boolean))) as string[];

  const [{ data: profs }, { data: txs }] = await Promise.all([
    userIds.length
      ? admin.from("profiles").select("id, full_name, email, avatar_url").in("id", userIds)
      : Promise.resolve({ data: [] as any[] }),
    txIds.length
      ? admin.from("transactions").select("id, transaction_code").in("id", txIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const profById = new Map((profs ?? []).map((p: any) => [p.id, p]));
  const txById = new Map((txs ?? []).map((t: any) => [t.id, t]));

  const failed = failedDels.map((d) => {
    const n = notifById.get(d.notification_id);
    const p = n ? profById.get(n.user_id) : null;
    const tx = n?.related_transaction_id ? txById.get(n.related_transaction_id) : null;
    return {
      delivery_id: d.id,
      notification_id: d.notification_id,
      channel: d.channel,
      attempt_count: d.attempt_count ?? 0,
      provider_response: d.provider_response ?? null,
      failed_at: d.created_at,
      title: n?.title ?? "—",
      type: n?.type ?? null,
      message: n?.message ?? "",
      user: p ? { id: p.id, full_name: p.full_name, email: p.email, avatar_url: p.avatar_url } : null,
      transaction: tx ? { id: tx.id, code: tx.transaction_code } : null,
      dispute_id: n?.related_dispute_id ?? null,
      retriable: (d.attempt_count ?? 0) < 3,
    };
  });

  // Recent activity — last 20 notifications regardless of status
  const recentSlice = notifs.slice(0, 20);
  const recentUserIds = Array.from(new Set(recentSlice.map((n) => n.user_id)));
  const missingProfs = recentUserIds.filter((id) => !profById.has(id));
  if (missingProfs.length) {
    const { data: more } = await admin.from("profiles").select("id, full_name, email, avatar_url").in("id", missingProfs);
    for (const p of (more ?? [])) profById.set(p.id, p);
  }
  const recent = recentSlice.map((n) => {
    const d = latestByNotif.get(n.id);
    const p = profById.get(n.user_id);
    return {
      notification_id: n.id,
      title: n.title,
      type: n.type,
      channel: n.channel,
      status: d?.delivery_status ?? n.status,
      created_at: n.created_at,
      user: p ? { id: p.id, full_name: p.full_name, email: p.email, avatar_url: p.avatar_url } : null,
    };
  });

  return json(200, {
    kpis: {
      sent_today: sentToday,
      failed_today: failedToday,
      sms_failures: smsFailures,
      email_failures: emailFailures,
      in_app_rate: inAppRate,
      retry_queue: retryQueue,
    },
    delivery_performance: deliveryPerformance,
    failed,
    recent,
    last_sync: new Date().toISOString(),
  });
});