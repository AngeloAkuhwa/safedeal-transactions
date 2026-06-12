import { requireAdmin, authErrorResponse } from "../_shared/auth.ts";

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
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);

  let ctx;
  try {
    ctx = await requireAdmin(req);
  } catch (err) {
    const r = authErrorResponse(err, corsHeaders);
    if (r) return r;
    return json({ error: "auth_failed" }, 500);
  }
  const admin = ctx.adminClient;

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Fetch payout rows in relevant statuses with their tx money_status.
  const { data: rows, error } = await admin
    .from("payouts")
    .select("id, status, amount, release_blocked, retry_allowed, released_at, created_at, transaction_id, transactions:transaction_id (money_status, needs_release_review)")
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
  let releasedToday = 0;
  let releasedWeek = 0;
  const leadHours: number[] = [];

  for (const r of (rows ?? []) as any[]) {
    const ms = r.transactions?.money_status as string | undefined;
    const needsReview = !!r.transactions?.needs_release_review;
    if (r.status === "awaiting_release" && !r.release_blocked && ms === "funds_pending_release") {
      pending.push(r);
    }
    if ((r.status === "pending" || r.status === "processing") && ms === "funds_releasing") {
      processing.push(r);
    }
    if (r.status === "failed") {
      if (r.retry_allowed) failedRetry.push(r);
    }
    if (r.release_blocked || r.status === "blocked") blocked.push(r);
    if (r.status === "reversed") reversed.push(r);
    if (r.status === "completed") completed.push(r);
    if (needsReview) onHold.push(r);

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
      pending_release: { count: pending.length, amount: sum(pending) },
      processing: { count: processing.length, amount: sum(processing) },
      failed: { count: failedRetry.length, amount: sum(failedRetry) },
      released_today: { amount: releasedToday },
      released_week: { amount: releasedWeek },
      avg_release_hours: avg(leadHours),
    },
    tab_counts: {
      pending_release: pending.length,
      processing: processing.length,
      failed: failedRetry.length,
      blocked: blocked.length,
      reversed: reversed.length,
      completed: completed.length,
      on_hold: onHold.length,
      all: (rows ?? []).length,
    },
    paystack_balance: balance,
  });
});