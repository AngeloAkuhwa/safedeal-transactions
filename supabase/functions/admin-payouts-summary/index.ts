import { requireAdmin, authErrorResponse , requirePermission} from "../_shared/auth.ts";
import { DEFAULT_STUCK_HOURS, WATCHDOG_STUCK_HOURS_KEY, isStuckPayout, parseStuckHours } from "../_shared/payout-watchdog.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function fetchPaystackBalance(): Promise<{ ok: boolean; available?: number; currency?: string; error?: string }> {
  const key = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!key) return { ok: false, error: "paystack_key_missing" };
  try {
    const res = await fetch("https://api.paystack.co/balance", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return { ok: false, error: `paystack_http_${res.status}` };
    const body = await res.json();
    const ngn = (body?.data ?? []).find((r: any) => r.currency === "NGN") ?? body?.data?.[0];
    if (!ngn) return { ok: false, error: "no_balance" };
    // Paystack returns kobo
    return { ok: true, available: Number(ngn.balance ?? 0) / 100, currency: ngn.currency ?? "NGN" };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let ctx;
  try {
    ctx = await requirePermission(req, "financial_controls.view");
  } catch (err) {
    const r = authErrorResponse(err, corsHeaders);
    if (r) return r;
    return json({ error: "auth_failed" }, 500);
  }

  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  const admin = ctx.adminClient;

  const { data: stuckSetting } = await admin
    .from("system_settings")
    .select("setting_value")
    .eq("setting_key", WATCHDOG_STUCK_HOURS_KEY)
    .eq("scope", "platform")
    .maybeSingle();
  const stuckThresholdHours = parseStuckHours((stuckSetting as any)?.setting_value ?? DEFAULT_STUCK_HOURS);

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const last24hMs = now.getTime() - 24 * 60 * 60 * 1000;

  // Fetch payout rows in relevant statuses with their tx money_status.
  const { data: rows, error } = await admin
    .from("payouts")
    .select("id, status, amount, release_blocked, retry_allowed, released_at, created_at, initiated_at, provider_reference, transaction_id, transactions:transaction_id (money_status, needs_release_review)")
    .in("status", ["awaiting_release", "pending", "processing", "completed", "failed", "reversed", "blocked", "cancelled"])
    .limit(5000);

  if (error) return json({ error: "summary_failed", detail: error.message }, 500);

  const pending: any[] = [];
  const processing: any[] = [];
  const failedRetry: any[] = [];
  const blocked: any[] = [];
  const reversed: any[] = [];
  const completed: any[] = [];
  const onHold: any[] = [];
  const stuck: any[] = [];
  let releasedToday = 0;
  let releasedWeek = 0;
  let pendingDelta24 = 0;
  let processingDelta24 = 0;
  let failedDelta24 = 0;
  const leadHours: number[] = [];

  for (const r of (rows ?? []) as any[]) {
    const ms = r.transactions?.money_status as string | undefined;
    const needsReview = !!r.transactions?.needs_release_review;
    if (r.status === "awaiting_release" && !r.release_blocked) {
      pending.push(r);
      if (r.created_at && new Date(r.created_at).getTime() >= last24hMs) pendingDelta24++;
    }
    if (r.status === "pending" || r.status === "processing") {
      processing.push(r);
      if (r.created_at && new Date(r.created_at).getTime() >= last24hMs) processingDelta24++;
    }
    if (r.status === "failed") {
      failedRetry.push(r);
      if (r.created_at && new Date(r.created_at).getTime() >= last24hMs) failedDelta24++;
    }
    if (r.release_blocked || r.status === "blocked") blocked.push(r);
    if (r.status === "reversed") reversed.push(r);
    if (r.status === "completed") completed.push(r);
    if (needsReview) onHold.push(r);
    if (isStuckPayout(r, stuckThresholdHours, now)) stuck.push(r);

    if (r.released_at && (r.status === "completed" || r.status === "processing")) {
      const releasedAt = new Date(r.released_at).getTime();
      const amount = Number(r.amount ?? 0);
      if (releasedAt >= new Date(startOfDay).getTime()) releasedToday += amount;
      if (releasedAt >= new Date(startOfWeek).getTime()) releasedWeek += amount;
    }
    const queuedAt = r.created_at;
    if (r.status === "completed" && r.released_at && queuedAt && new Date(r.released_at).getTime() >= new Date(last30).getTime()) {
      const diffMs = new Date(r.released_at).getTime() - new Date(queuedAt).getTime();
      if (diffMs > 0) leadHours.push(diffMs / 3_600_000);
    }
  }

  const sum = (arr: any[]) => arr.reduce((acc, x) => acc + Number(x.amount ?? 0), 0);
  const avg = (arr: number[]) => arr.length === 0 ? null : arr.reduce((a, b) => a + b, 0) / arr.length;

  const balance = await fetchPaystackBalance();

  return json({
    currency: "NGN",
    summary: {
      pending_release: { count: pending.length, amount: sum(pending), delta_24h: pendingDelta24 },
      processing: { count: processing.length, amount: sum(processing), delta_24h: processingDelta24 },
      failed: { count: failedRetry.length, amount: sum(failedRetry), delta_24h: failedDelta24 },
      released_today: { amount: releasedToday, count: completed.filter((r:any)=>r.released_at && new Date(r.released_at).getTime() >= new Date(startOfDay).getTime()).length },
      released_week: { amount: releasedWeek, count: completed.filter((r:any)=>r.released_at && new Date(r.released_at).getTime() >= new Date(startOfWeek).getTime()).length },
      avg_release_hours: avg(leadHours),
      stuck: { count: stuck.length, amount: sum(stuck), threshold_hours: stuckThresholdHours },
    },
    tab_counts: {
      pending_release: pending.length,
      processing: processing.length,
      failed: failedRetry.length,
      blocked: blocked.length,
      reversed: reversed.length,
      completed: completed.length,
      on_hold: onHold.length,
      stuck: stuck.length,
      all: (rows ?? []).length,
    },
    paystack_balance: balance,
  });
});