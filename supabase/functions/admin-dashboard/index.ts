import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { requirePermission, authErrorResponse } from "../_shared/auth.ts";
import { fetchReconciliationSummary, outstandingCount, EMPTY_SUMMARY } from "../_shared/reconciliation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ---------- helpers ----------
function adminJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function adminErrorResponse(message: string, status = 500) {
  return adminJsonResponse({ error: message }, status);
}

async function safeCount(
  client: SupabaseClient,
  table: string,
  builder?: (q: any) => any,
): Promise<number> {
  try {
    let q = client.from(table).select("*", { count: "exact", head: true });
    if (builder) q = builder(q);
    const { count, error } = await q;
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

async function safeSum(
  client: SupabaseClient,
  table: string,
  column: string,
  builder?: (q: any) => any,
): Promise<number> {
  try {
    let q = client.from(table).select(column);
    if (builder) q = builder(q);
    const { data, error } = await q;
    if (error || !data) return 0;
    return (data as any[]).reduce((s, r) => s + Number(r?.[column] ?? 0), 0);
  } catch {
    return 0;
  }
}

function calculateDeltaPct(current: number, previous: number): number | null {
  if (!previous || previous === 0) return null;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

async function distinctActiveUsers(
  client: SupabaseClient,
  sinceIso: string,
  untilIso?: string,
): Promise<number> {
  try {
    // P1: replaced 10k-row `Set<string>` scan with SQL-side count(distinct).
    // Removes silent data loss when active users exceed the previous cap.
    const { data, error } = await client.rpc("admin_distinct_active_users", {
      _since: sinceIso,
      _until: untilIso ?? null,
    });
    if (error) return 0;
    return Number(data ?? 0);
  } catch {
    return 0;
  }
}

function formatDateBucket(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getDateRange(window: "7D" | "30D" | "90D") {
  const days = window === "7D" ? 7 : window === "30D" ? 30 : 90;
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return { start, end, days };
}

async function logEdgeError(
  client: SupabaseClient,
  message: string,
  user_id: string | null,
  context: Record<string, unknown> = {},
) {
  try {
    await client.from("edge_function_errors").insert({
      function_name: "admin-dashboard",
      user_id,
      message,
      request_context: context,
    });
  } catch {
    /* noop */
  }
}

// ---------- micro-cache (per-isolate) ----------
const CACHE_TTL_MS = 20_000;
let cached: { at: number; payload: unknown } | null = null;

// ---------- aggregation ----------
async function buildDashboardPayload(client: SupabaseClient, userId: string) {
  const now = new Date();
  const ms24h = 24 * 60 * 60 * 1000;
  const ms30d = 30 * 24 * 60 * 60 * 1000;
  const since24h = new Date(now.getTime() - ms24h).toISOString();
  const since30d = new Date(now.getTime() - ms30d).toISOString();
  const prev30dStart = new Date(now.getTime() - 2 * ms30d).toISOString();
  const in24hIso = new Date(now.getTime() + ms24h).toISOString();
  const startOfToday = new Date(
    now.getFullYear(), now.getMonth(), now.getDate(),
  ).toISOString();
  const since9d = new Date(now.getTime() - 9 * 24 * 60 * 60 * 1000).toISOString();

  const [
    txTotal,
    txCurrent30d,
    txPrev30d,
    flaggedNeedsReview,
    flaggedNeedsReviewPrev,
    awaitingRelease,
    failedPayouts,
    disputesOpen,
    stuckTx,
    identityPending,
    webhookFailures,
    overdueResponses,
    frozenTx,
    flaggedToday,
    staleTx,
    slaDueSoon,
    slaOverdue,
    slaUnderReview,
    paySuccess,
    payFailed,
    reconMismatches,
    badgeDisputes,
    badgeIdentity,
    badgePayouts,
  ] = await Promise.all([
    safeCount(client, "transactions"),
    safeCount(client, "transactions", (q) => q.gte("created_at", since30d)),
    safeCount(client, "transactions", (q) =>
      q.gte("created_at", prev30dStart).lt("created_at", since30d),
    ),
    safeCount(client, "transactions", (q) => q.eq("needs_release_review", true)),
    safeCount(client, "transactions", (q) =>
      q.eq("needs_release_review", true).gte("created_at", prev30dStart).lt("created_at", since30d),
    ),
    safeCount(client, "release_review_queue", (q) => q.eq("status", "pending")),
    safeCount(client, "payouts", (q) => q.eq("status", "failed").eq("retry_allowed", true)),
    safeCount(client, "disputes", (q) => q.in("status", ["open", "under_review", "seller_response_pending"])),
    safeCount(client, "release_review_queue", (q) => q.eq("queue_type", "stuck").eq("status", "pending")),
    safeCount(client, "identity_submissions", (q) => q.eq("status", "pending_review")),
    safeCount(client, "payment_webhook_logs", (q) => q.eq("processed_successfully", false)),
    safeCount(client, "disputes", (q) =>
      q
        .lt("seller_response_due_at", now.toISOString())
        .in("status", ["open", "under_review", "seller_response_pending"]),
    ),
    safeCount(client, "transactions", (q) => q.eq("money_status", "funds_frozen")),
    safeCount(client, "transactions", (q) =>
      q.eq("needs_release_review", true).gte("updated_at", startOfToday),
    ),
    safeCount(client, "transactions", (q) =>
      q.eq("status", "awaiting_payment").lt("created_at", since24h),
    ),
    safeCount(client, "disputes", (q) =>
      q
        .gte("seller_response_due_at", now.toISOString())
        .lte("seller_response_due_at", in24hIso)
        .in("status", ["open", "under_review", "seller_response_pending"]),
    ),
    safeCount(client, "disputes", (q) =>
      q
        .lt("seller_response_due_at", now.toISOString())
        .in("status", ["open", "under_review", "seller_response_pending"]),
    ),
    safeCount(client, "disputes", (q) => q.eq("status", "under_review")),
    safeCount(client, "payments", (q) => q.eq("status", "succeeded")),
    safeCount(client, "payments", (q) => q.eq("status", "failed")),
    safeCount(client, "payment_webhook_logs", (q) =>
      q.eq("processed_successfully", false).not("error_message", "is", null),
    ),
    safeCount(client, "disputes", (q) => q.in("status", ["open", "under_review", "seller_response_pending"])),
    safeCount(client, "identity_submissions", (q) => q.eq("status", "pending_review")),
    safeCount(client, "payouts", (q) => q.in("status", ["pending", "processing", "failed"])),
  ]);

  const [
    escrowSumHeld,
    escrowSumFrozen,
    activeUsers30d,
    activeUsersPrev30d,
    disputesOpenAll,
    disputesOpenPrev,
  ] = await Promise.all([
    safeSum(client, "escrow_states", "held_amount"),
    safeSum(client, "escrow_states", "frozen_amount"),
    distinctActiveUsers(client, since30d),
    distinctActiveUsers(client, prev30dStart, since30d),
    safeCount(client, "disputes", (q) =>
      q.in("status", ["open", "under_review", "seller_response_pending"]),
    ),
    safeCount(client, "disputes", (q) =>
      q
        .in("status", ["open", "under_review", "seller_response_pending"])
        .gte("opened_at", prev30dStart)
        .lt("opened_at", since30d),
    ),
  ]);
  const escrowBalance = escrowSumHeld + escrowSumFrozen;

  // Active users fallback → registered profiles
  let activeUsersValue = activeUsers30d;
  let activeUsersIsFallback = false;
  if (activeUsers30d === 0) {
    const profilesCount = await safeCount(client, "profiles");
    if (profilesCount > 0) {
      activeUsersValue = profilesCount;
      activeUsersIsFallback = true;
    }
  }

  // Flagged activity = needs_release_review tx + open disputes
  const flaggedActivity = flaggedNeedsReview + disputesOpenAll;
  const flaggedActivityPrev = flaggedNeedsReviewPrev + disputesOpenPrev;

  const pendingPayoutsAmount = await safeSum(client, "payouts", "amount", (q) =>
    q.in("status", ["awaiting_release", "pending", "processing"]),
  );

  // ---------- Sidebar badges (real) ----------
  const since7dIso = new Date(now.getTime() - 7 * ms24h).toISOString();
  const [
    badgeDisputesReal,
    badgeIdentityReal,
    badgePayoutsFailed,
    badgePayoutsAwaiting,
  ] = await Promise.all([
    safeCount(client, "disputes", (q) =>
      q.in("status", ["open", "under_review", "seller_response_pending"]),
    ),
    safeCount(client, "identity_submissions", (q) => q.eq("status", "pending_review")),
    safeCount(client, "payouts", (q) => q.eq("status", "failed").eq("retry_allowed", true)),
    safeCount(client, "payouts", (q) => q.eq("status", "awaiting_release")),
  ]);
  let flaggedUsersBadge = 0;
  try {
    // P1 #5: SQL-side distinct count (replaces 5000-row JS scan).
    const { data: cnt } = await client.rpc("admin_flagged_users_count", {
      _since: since7dIso,
    });
    flaggedUsersBadge = Number(cnt ?? 0) || 0;
  } catch {
    flaggedUsersBadge = 0;
  }

  // Identity review health (avg time + 9-day sparkline)
  // P1 #5: single SQL RPC replaces two multi-thousand-row scans + JS bucketing.
  let avgReviewHours: number | null = null;
  let identitySpark: number[] = [];
  try {
    const { data: rows } = await client.rpc("admin_identity_review_health", {
      _since_avg: since30d,
      _since_spark: since9d,
    });
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (row) {
      avgReviewHours = row.avg_hours != null ? Number(row.avg_hours) : null;
      identitySpark = Array.isArray(row.spark) ? row.spark.map((n: any) => Number(n) || 0) : [];
    }
  } catch (e) {
    await logEdgeError(client, `identity_health_failed: ${(e as Error).message}`, userId);
  }

  // ---------- Payout Health: avg payout time + 9d sparkline ----------
  // P1 #5: single SQL RPC replaces two multi-thousand-row scans + JS bucketing.
  let avgPayoutHours: number | null = null;
  let payoutSpark: number[] = [];
  try {
    const { data: rows } = await client.rpc("admin_payout_health", {
      _since_avg: since30d,
      _since_spark: since9d,
    });
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (row) {
      avgPayoutHours = row.avg_hours != null ? Number(row.avg_hours) : null;
      payoutSpark = Array.isArray(row.spark) ? row.spark.map((n: any) => Number(n) || 0) : [];
    }
  } catch (e) {
    await logEdgeError(client, `payout_health_failed: ${(e as Error).message}`, userId);
  }

  // ---------- Reconciliation Mismatches ----------
  // Single source of truth: the same `admin_financial_reconciliation` routine
  // the Escrow page and the Reconciliation hub call, over the same (all-time)
  // scope, so the counts are identical by construction.
  let reconSummary = { ...EMPTY_SUMMARY };
  let reconMismatchCount = 0;
  try {
    reconSummary = await fetchReconciliationSummary(client, null);
    reconMismatchCount = outstandingCount(reconSummary);
  } catch (e) {
    await logEdgeError(client, `recon_failed: ${(e as Error).message}`, userId);
  }

  // ---------- Escrow / Releases / Refunds 30-day trend ----------
  const escrowTrendPoints: Array<{ label: string; primary: number; secondary: number; tertiary: number }> = [];
  try {
    // P1: replaced 20k-row scan + JS bucketing with a SQL-side daily aggregate.
    // Deterministic bucket count (30) regardless of ledger volume.
    const { data: rows } = await client.rpc("admin_escrow_ledger_daily_trend", {
      _days: 30,
    });
    for (const r of ((rows ?? []) as Array<{ bucket_date: string; primary_amount: number; secondary_amount: number; tertiary_amount: number }>)) {
      const d = new Date(r.bucket_date);
      const label = `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      escrowTrendPoints.push({
        label,
        primary: Number(Number(r.primary_amount ?? 0).toFixed(2)),
        secondary: Number(Number(r.secondary_amount ?? 0).toFixed(2)),
        tertiary: Number(Number(r.tertiary_amount ?? 0).toFixed(2)),
      });
    }
  } catch (e) {
    await logEdgeError(client, `escrow_trend_failed: ${(e as Error).message}`, userId);
  }

  // ---------- Recent Activity (real, multi-source) ----------
  let recentActivity: any[] = [];
  try {
    const items: any[] = [];
    const [
      txDone, fundsReleased, newProfiles,
      disputesOpened, disputesResolved, payoutsFailedRows, refundsDone,
    ] = await Promise.all([
      client.from("transactions")
        .select("id, transaction_code, updated_at")
        .eq("status", "completed").order("updated_at", { ascending: false }).limit(10),
      client.from("money_status_history")
        .select("id, transaction_id, changed_at")
        .eq("new_status", "funds_released").order("changed_at", { ascending: false }).limit(10),
      client.from("profiles")
        .select("id, full_name, email, created_at").order("created_at", { ascending: false }).limit(10),
      client.from("disputes")
        .select("id, transaction_id, opened_at").order("opened_at", { ascending: false }).limit(10),
      client.from("disputes")
        .select("id, transaction_id, resolved_at")
        .not("resolved_at", "is", null).order("resolved_at", { ascending: false }).limit(10),
      client.from("payouts")
        .select("id, transaction_id, amount, currency_code, failed_at, failure_reason")
        .eq("status", "failed").not("failed_at", "is", null)
        .order("failed_at", { ascending: false }).limit(10),
      client.from("refunds")
        .select("id, transaction_id, refund_amount, currency_code, completed_at")
        .eq("status", "completed").not("completed_at", "is", null)
        .order("completed_at", { ascending: false }).limit(10),
    ]);
    for (const r of (txDone.data ?? []) as any[]) items.push({
      id: `tx-${r.id}`, kind: "transaction_completed",
      title: "Transaction completed",
      subtitle: r.transaction_code ?? `TX ${String(r.id).slice(0, 8)}`,
      at_iso: r.updated_at, action_href: `/admin/transactions/${r.id}`,
    });
    for (const r of (fundsReleased.data ?? []) as any[]) items.push({
      id: `rel-${r.id}`, kind: "escrow_released",
      title: "Escrow released",
      subtitle: `TX ${String(r.transaction_id).slice(0, 8)}`,
      at_iso: r.changed_at, action_href: `/admin/transactions/${r.transaction_id}`,
    });
    for (const r of (newProfiles.data ?? []) as any[]) items.push({
      id: `usr-${r.id}`, kind: "user_registered",
      title: "New user registered",
      subtitle: r.full_name || r.email || String(r.id).slice(0, 8),
      at_iso: r.created_at,
    });
    for (const r of (disputesOpened.data ?? []) as any[]) items.push({
      id: `dop-${r.id}`, kind: "dispute_opened",
      title: "Dispute opened",
      subtitle: `TX ${String(r.transaction_id).slice(0, 8)}`,
      at_iso: r.opened_at, action_href: `/admin/disputes/${r.id}`,
    });
    for (const r of (disputesResolved.data ?? []) as any[]) items.push({
      id: `drs-${r.id}`, kind: "dispute_resolved",
      title: "Dispute resolved",
      subtitle: `TX ${String(r.transaction_id).slice(0, 8)}`,
      at_iso: r.resolved_at, action_href: `/admin/disputes/${r.id}`,
    });
    for (const r of (payoutsFailedRows.data ?? []) as any[]) items.push({
      id: `pof-${r.id}`, kind: "payout_failed",
      title: "Payout failed",
      subtitle: r.failure_reason || `TX ${String(r.transaction_id).slice(0, 8)}`,
      amount: Number(r.amount ?? 0), currency: r.currency_code || "NGN",
      at_iso: r.failed_at, action_href: `/admin/payouts`,
    });
    for (const r of (refundsDone.data ?? []) as any[]) items.push({
      id: `ref-${r.id}`, kind: "refund_issued",
      title: "Refund issued",
      subtitle: `TX ${String(r.transaction_id).slice(0, 8)}`,
      amount: Number(r.refund_amount ?? 0), currency: r.currency_code || "NGN",
      at_iso: r.completed_at, action_href: `/admin/transactions/${r.transaction_id}`,
    });
    recentActivity = items
      .filter((i) => i.at_iso)
      .sort((a, b) => new Date(b.at_iso).getTime() - new Date(a.at_iso).getTime())
      .slice(0, 10);
  } catch (e) {
    await logEdgeError(client, `recent_activity_failed: ${(e as Error).message}`, userId);
  }

  // ---------- Critical Alerts (dynamic) ----------
  const criticalAlerts: any[] = [];
  try {
    const { data: settingsRows } = await client
      .from("system_settings")
      .select("setting_key, setting_value")
      .in("setting_key", [
        "escrow_balance_min_threshold",
        "dispute_queue_overflow_threshold",
        "webhook_failure_spike_threshold",
        "failed_payout_spike_threshold",
        "stale_transaction_spike_threshold",
      ]);
    const settings = new Map<string, string>();
    for (const s of (settingsRows ?? []) as any[]) settings.set(s.setting_key, String(s.setting_value));
    const numSetting = (k: string, fallback?: number): number | null => {
      const v = settings.get(k);
      if (v == null) return fallback ?? null;
      const n = Number(v);
      return Number.isFinite(n) ? n : (fallback ?? null);
    };
    const nowIso = now.toISOString();

    // Escrow low balance: only if threshold is set in settings
    const escrowThreshold = numSetting("escrow_balance_min_threshold");
    if (escrowThreshold != null && escrowBalance < escrowThreshold) {
      criticalAlerts.push({
        id: "alert-escrow-low",
        title: "Escrow balance below threshold",
        description: `Escrow balance NGN ${escrowBalance.toFixed(2)} is below threshold NGN ${escrowThreshold.toFixed(2)}.`,
        severity: "red", at_iso: nowIso,
      });
    }

    const disputeThreshold = numSetting("dispute_queue_overflow_threshold", 30)!;
    if (disputesOpenAll > disputeThreshold) {
      criticalAlerts.push({
        id: "alert-dispute-overflow",
        title: "Dispute queue overflow",
        description: `${disputesOpenAll} active disputes exceed the threshold of ${disputeThreshold}.`,
        severity: "yellow", at_iso: nowIso,
      });
    }

    const webhookFailThreshold = numSetting("webhook_failure_spike_threshold", 5)!;
    const webhookFails24h = await safeCount(client, "payment_webhook_logs", (q) =>
      q.eq("processed_successfully", false).gte("created_at", since24h),
    );
    if (webhookFails24h > webhookFailThreshold) {
      criticalAlerts.push({
        id: "alert-webhook-spike",
        title: "Webhook failure spike",
        description: `${webhookFails24h} webhook failures in last 24h (threshold ${webhookFailThreshold}).`,
        severity: "red", at_iso: nowIso,
      });
    }

    // SLA-overdue disputes: any overdue case is alert-worthy
    if (slaOverdue > 0) {
      criticalAlerts.push({
        id: "alert-disputes-overdue",
        title: `${slaOverdue} dispute${slaOverdue === 1 ? "" : "s"} overdue`,
        description: `Response SLA breached. Triage in the dispute queue.`,
        severity: "red", at_iso: nowIso,
        action_label: "Open Disputes", action_href: "/admin/disputes",
      });
    }

    // Stuck transactions flagged for admin review. Surface immediately
    if (flaggedNeedsReview > 0) {
      criticalAlerts.push({
        id: "alert-stuck-tx",
        title: `${flaggedNeedsReview} transaction${flaggedNeedsReview === 1 ? "" : "s"} need admin review`,
        description: `Marked needs_release_review. Investigate before releasing funds.`,
        severity: "yellow", at_iso: nowIso,
        action_label: "Review Queue", action_href: "/admin/transactions",
      });
    }

    const failedPayoutThreshold = numSetting("failed_payout_spike_threshold", 0)!;
    if (failedPayouts > failedPayoutThreshold) {
      criticalAlerts.push({
        id: "alert-failed-payouts",
        title: `${failedPayouts} failed payout${failedPayouts === 1 ? "" : "s"}`,
        description: `Pending retry. Check bank verification and recipient codes.`,
        severity: "red", at_iso: nowIso,
        action_label: "Open Payouts", action_href: "/admin/payouts?tab=failed",
      });
    }

    const staleThreshold = numSetting("stale_transaction_spike_threshold", 10)!;
    if (staleTx > staleThreshold) {
      criticalAlerts.push({
        id: "alert-stale-tx",
        title: "Stale transactions",
        description: `${staleTx} transactions awaiting payment > 24h (threshold ${staleThreshold}).`,
        severity: "yellow", at_iso: nowIso,
      });
    }
  } catch (e) {
    await logEdgeError(client, `critical_alerts_failed: ${(e as Error).message}`, userId);
  }

  // Last audit entry
  let lastAuditEntry: any = null;
  try {
    const { data } = await client
      .from("admin_actions")
      .select("admin_user_id, action_type, action_notes, created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      lastAuditEntry = {
        actor: String(data.admin_user_id).slice(0, 8),
        summary: data.action_notes ?? data.action_type,
        at_iso: data.created_at,
      };
    }
  } catch (e) {
    await logEdgeError(client, `audit_entry_failed: ${(e as Error).message}`, userId);
  }

  const highSev24h = await safeCount(client, "admin_actions", (q) =>
    q.gte("created_at", since24h).in("action_type", [
      "freeze_transaction",
      "refund_buyer",
      "release_funds",
      "escalate_case",
      "flag_user",
    ]),
  );

  // Pre-seed 7-day trend via SQL RPC (P1 fix. Was scanning up to 100k rows into JS).
  const txDisputeTrendPoints: Array<{ label: string; date: string; primary: number; secondary: number }> = [];
  try {
    const { data: rows, error: trendErr } = await client.rpc("admin_daily_activity_counts", { _days: 7 });
    if (trendErr) throw trendErr;
    for (const r of (rows ?? []) as Array<{ bucket_date: string; tx_count: number; dispute_count: number }>) {
      const date = String(r.bucket_date);
      txDisputeTrendPoints.push({
        label: date.slice(5),
        date,
        primary: Number(r.tx_count ?? 0),
        secondary: Number(r.dispute_count ?? 0),
      });
    }
  } catch (e) {
    await logEdgeError(client, `tx_dispute_trend_failed: ${(e as Error).message}`, userId);
  }
  const txDisputeTrend = {
    primary_label: "Transactions",
    secondary_label: "Disputes",
    points: txDisputeTrendPoints,
  };
  const escrowTrend = {
    primary_label: "Escrow Held",
    secondary_label: "Released",
    tertiary_label: "Refunded",
    points: escrowTrendPoints,
  };

  const payload = {
    kpis: {
      total_transactions: txTotal,
      total_transactions_delta_pct: calculateDeltaPct(txCurrent30d, txPrev30d),
      escrow_balance_amount: Number(escrowBalance.toFixed(2)),
      escrow_balance_delta_pct: null,
      active_users: activeUsersValue,
      active_users_delta_pct: calculateDeltaPct(activeUsers30d, activeUsersPrev30d),
      active_users_is_fallback: activeUsersIsFallback,
      flagged_activity: flaggedActivity,
      flagged_activity_delta_pct: calculateDeltaPct(flaggedActivity, flaggedActivityPrev),
    },
    action_required: [
      { key: "awaiting_release", label: "Funds Awaiting Release", count: awaitingRelease, severity: "blue", action_label: "Open Release Queue", action_href: "/admin/escrow?state=pending_release" },
      { key: "failed_payouts", label: "Failed Payouts", count: failedPayouts, severity: "red", action_label: "Investigate", action_href: "/admin/payouts?tab=failed" },
      { key: "disputes_needing_decision", label: "Disputes Needing Decision", count: disputesOpen, severity: "orange", action_label: "Decide", action_href: "/admin/disputes" },
      { key: "stuck_transactions", label: "Stuck Transactions", count: stuckTx > 0 ? stuckTx : flaggedNeedsReview, severity: "purple", action_label: "Review Queue", action_href: "/admin/transactions?quick=overdue" },
      { key: "identity_reviews_pending", label: "Identity Reviews Pending", count: identityPending, severity: "cyan", action_label: "Review users", action_href: "/admin/users?status=pending&verification=id" },
      { key: "webhook_recon_issues", label: "Webhook & Reconciliation", count: webhookFailures, severity: "yellow", action_label: "Investigate", action_href: "/admin/reconciliation" },
    ],
    trends: {
      transactions_vs_disputes: txDisputeTrend,
      escrow_releases_refunds: escrowTrend,
    },
    hotspots: [
      { key: "overdue_responses", count: overdueResponses, label: "Overdue Responses", severity: "orange", action_label: "Review Now", action_href: null },
      { key: "frozen_escrow", count: frozenTx, label: "Frozen Escrow", severity: "red", action_label: "Investigate", action_href: null },
      { key: "flagged_today", count: flaggedToday, label: "Flagged Today", severity: "yellow", action_label: "View Users", action_href: null },
      { key: "stale_transactions", count: staleTx, label: "Stale Transactions", severity: "purple", action_label: "Take Action", action_href: null },
    ],
    dispute_sla: {
      due_soon: slaDueSoon,
      overdue: slaOverdue,
      escalated: 0,
      under_review: slaUnderReview,
    },
    payment_health: [
      { key: "successful", label: "Successful Payments", count: paySuccess, severity: "emerald" },
      { key: "failed", label: "Failed Payments", count: payFailed, severity: "red" },
      { key: "webhook_failures", label: "Webhook Failures", count: webhookFailures, severity: "orange" },
      { key: "recon_mismatches", label: "Reconciliation Mismatches", count: reconMismatchCount, severity: "yellow" },
    ],
    identity_health: {
      pending_reviews: identityPending,
      avg_review_hours: avgReviewHours,
      spark: identitySpark,
    },
    payout_health: {
      pending_payouts_amount: Number(pendingPayoutsAmount.toFixed(2)),
      avg_payout_hours: avgPayoutHours,
      spark: payoutSpark,
    },
    audit_signal: {
      last_audit_entry: lastAuditEntry,
      high_severity_actions_24h: highSev24h,
      impersonation_sessions_24h: 0,
      failed_admin_logins_24h: 0,
      // Compliance can only be "green" when reconciliation is clean: the
      // same figure the Escrow page reports.
      compliance_status:
        reconSummary.mismatch > 0
          ? "red"
          : (reconSummary.requires_review > 0 || highSev24h > 10)
            ? "amber"
            : "green",
      compliance_last_check_iso: now.toISOString(),
      reconciliation: reconSummary,
    },
    critical_alerts: criticalAlerts,
    recent_activity: recentActivity,
    performance: [] as any[],
    sidebar_badges: {
      disputes: badgeDisputesReal,
      identity: badgeIdentityReal,
      payouts: badgePayoutsFailed + badgePayoutsAwaiting,
      flagged_users: flaggedUsersBadge,
      exports: 0,
    },
  };

  return payload;
}

// ---------- handler ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let ctx;
    try { ctx = await requirePermission(req, "dashboard.view"); }
    catch (err) {
      const resp = authErrorResponse(err, corsHeaders);
      if (resp) return resp;
      throw err;
    }
    const adminClient = ctx.adminClient;
    const userId = ctx.userId;

    // Micro-cache check
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return adminJsonResponse(cached.payload);
    }

    const payload = await buildDashboardPayload(adminClient, userId);
    cached = { at: Date.now(), payload };
    return adminJsonResponse(payload);
  } catch (e) {
    return adminErrorResponse(`Unexpected error: ${(e as Error).message}`, 500);
  }
});
