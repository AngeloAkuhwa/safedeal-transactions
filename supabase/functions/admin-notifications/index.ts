/**
 * Admin Notification Center — read aggregator.
 * GET: returns KPIs, delivery performance, failed list, recent activity.
 */
import { requireAdmin, authErrorResponse , requirePermission} from "../_shared/auth.ts";

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

  let ctx;
  try { ctx = await requirePermission(req, "platform_configuration.view"); }
  catch (err) {
    const r = authErrorResponse(err, corsHeaders);
    if (r) return r;
    return json(500, { error: "auth_failed" });
  }

  if (req.method !== "GET") return json(405, { error: "method_not_allowed" });
  const admin = ctx.adminClient;

  const now = Date.now();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const twoDaysAgo = new Date(now - 48 * 60 * 60 * 1000).toISOString();

  // Pull last-48h so we can compare current 24h to the prior 24h window.
  const [{ data: notifs48 }, { data: dels48 }] = await Promise.all([
    admin.from("notifications")
      .select("id, user_id, type, channel, title, message, status, is_read, created_at, related_transaction_id, related_dispute_id, occurrence_count, first_seen_at, last_seen_at, resolved_at")
      .or(`created_at.gte.${twoDaysAgo},last_seen_at.gte.${twoDaysAgo}`)
      .order("created_at", { ascending: false })
      .limit(2000),
    admin.from("notification_deliveries")
      .select("id, notification_id, channel, delivery_status, provider_response, attempt_count, sent_at, created_at")
      .gte("created_at", twoDaysAgo)
      .order("created_at", { ascending: false })
      .limit(4000),
  ]);

  const notifsAll = notifs48 ?? [];
  const delsAll = dels48 ?? [];
  // Deduplicated alerts keep their original created_at but refresh last_seen_at,
  // so activity windows are measured on the effective (most recent) timestamp.
  const seenAt = (n: { created_at: string; last_seen_at?: string | null }) =>
    n.last_seen_at && n.last_seen_at > n.created_at ? n.last_seen_at : n.created_at;
  const notifs = notifsAll.filter((n) => seenAt(n) >= dayAgo);
  const dels = delsAll.filter((d) => d.created_at >= dayAgo);
  const notifsPrev = notifsAll.filter((n) => seenAt(n) < dayAgo);
  const delsPrev = delsAll.filter((d) => d.created_at < dayAgo);

  // Latest delivery per notification.
  const latestByNotif = new Map<string, typeof dels[number]>();
  for (const d of dels) {
    const prev = latestByNotif.get(d.notification_id);
    if (!prev || new Date(d.created_at) > new Date(prev.created_at)) {
      latestByNotif.set(d.notification_id, d);
    }
  }
  const latestDels = Array.from(latestByNotif.values());

  // Same reduction for the previous 24h window.
  const latestByNotifPrev = new Map<string, typeof dels[number]>();
  for (const d of delsPrev) {
    const prev = latestByNotifPrev.get(d.notification_id);
    if (!prev || new Date(d.created_at) > new Date(prev.created_at)) {
      latestByNotifPrev.set(d.notification_id, d);
    }
  }
  const latestDelsPrev = Array.from(latestByNotifPrev.values());

  // KPIs
  const sentToday = notifs.filter((n) => n.status === "sent" || n.status === "read").length;
  const failedToday = latestDels.filter((d) => d.delivery_status === "failed").length;
  const smsFailures = latestDels.filter((d) => d.channel === "sms" && d.delivery_status === "failed").length;
  const emailFailures = latestDels.filter((d) => d.channel === "email" && d.delivery_status === "failed").length;
  const retryQueue = latestDels.filter((d) => d.delivery_status === "failed" && (d.attempt_count ?? 0) < 3).length;
  const inAppTotal = notifs.filter((n) => n.channel === "in_app").length;
  const inAppDelivered = notifs.filter((n) => n.channel === "in_app" && (n.status === "sent" || n.status === "read")).length;
  const inAppRate = inAppTotal ? Math.round((inAppDelivered / inAppTotal) * 1000) / 10 : 0;

  // Prior-window KPIs for deltas.
  const sentPrev = notifsPrev.filter((n) => n.status === "sent" || n.status === "read").length;
  const failedPrev = latestDelsPrev.filter((d) => d.delivery_status === "failed").length;
  const smsPrev = latestDelsPrev.filter((d) => d.channel === "sms" && d.delivery_status === "failed").length;
  const emailPrev = latestDelsPrev.filter((d) => d.channel === "email" && d.delivery_status === "failed").length;
  const retryPrev = latestDelsPrev.filter((d) => d.delivery_status === "failed" && (d.attempt_count ?? 0) < 3).length;
  const inAppTotalPrev = notifsPrev.filter((n) => n.channel === "in_app").length;
  const inAppDeliveredPrev = notifsPrev.filter((n) => n.channel === "in_app" && (n.status === "sent" || n.status === "read")).length;
  const inAppRatePrev = inAppTotalPrev ? Math.round((inAppDeliveredPrev / inAppTotalPrev) * 1000) / 10 : 0;

  const pctDelta = (curr: number, prev: number): number => {
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 1000) / 10;
  };
  const ppDelta = (curr: number, prev: number): number => Math.round((curr - prev) * 10) / 10;

  // Delivery performance per channel
  // In-app notifications are delivered on insert into `notifications` (no row in
  // notification_deliveries). Source in_app from notifications; email/sms from deliveries.
  const inAppScope = notifs.filter((n) => n.channel === "in_app");
  const inAppFailed = inAppScope.filter((n) => n.status === "failed").length;
  const inAppSent = inAppScope.length - inAppFailed; // pending/sent/read all count as delivered
  const inAppPerf = {
    channel: "in_app" as const,
    total: inAppScope.length,
    sent: inAppSent,
    failed: inAppFailed,
    rate: inAppScope.length ? Math.round((inAppSent / inAppScope.length) * 1000) / 10 : 0,
  };
  const perDeliveryChannel = (ch: "email" | "sms") => {
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
  const deliveryPerformance = [inAppPerf, perDeliveryChannel("email"), perDeliveryChannel("sms")];

  // Recompute in_app KPI rate consistent with the panel above.
  const inAppRateConsistent = inAppPerf.rate;
  const inAppScopePrev = notifsPrev.filter((n) => n.channel === "in_app");
  const inAppFailedPrev = inAppScopePrev.filter((n) => n.status === "failed").length;
  const inAppSentPrev = inAppScopePrev.length - inAppFailedPrev;
  const inAppRatePrevConsistent = inAppScopePrev.length
    ? Math.round((inAppSentPrev / inAppScopePrev.length) * 1000) / 10
    : 0;

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
      ? admin.from("profiles").select("id, public_user_id, full_name, email, avatar_url").in("id", userIds)
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
      user: p ? { id: p.id, public_user_id: (p as Record<string, unknown>).public_user_id ?? null, full_name: p.full_name, email: p.email, avatar_url: p.avatar_url } : null,
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
    const { data: more } = await admin.from("profiles").select("id, public_user_id, full_name, email, avatar_url").in("id", missingProfs);
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
      occurrence_count: Number(n.occurrence_count ?? 1),
      first_seen_at: n.first_seen_at ?? n.created_at,
      last_seen_at: seenAt(n),
      resolved_at: n.resolved_at ?? null,
      user: p ? { id: p.id, public_user_id: (p as Record<string, unknown>).public_user_id ?? null, full_name: p.full_name, email: p.email, avatar_url: p.avatar_url } : null,
    };
  });

  return json(200, {
    kpis: {
      sent_today: sentToday,
      failed_today: failedToday,
      sms_failures: smsFailures,
      email_failures: emailFailures,
      in_app_rate: inAppRateConsistent,
      retry_queue: retryQueue,
      sent_delta: pctDelta(sentToday, sentPrev),
      failed_delta: pctDelta(failedToday, failedPrev),
      sms_delta: pctDelta(smsFailures, smsPrev),
      email_delta: pctDelta(emailFailures, emailPrev),
      retry_delta: pctDelta(retryQueue, retryPrev),
      in_app_delta: ppDelta(inAppRateConsistent, inAppRatePrevConsistent),
      compared_to: "yesterday",
    },
    delivery_performance: deliveryPerformance,
    failed,
    recent,
    last_sync: new Date().toISOString(),
  });
});