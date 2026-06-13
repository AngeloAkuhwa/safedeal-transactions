import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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
    let q = client
      .from("user_sessions")
      .select("user_id")
      .gte("last_seen_at", sinceIso)
      .limit(10000);
    if (untilIso) q = q.lt("last_seen_at", untilIso);
    const { data, error } = await q;
    if (error || !data) return 0;
    const set = new Set<string>();
    for (const r of data as any[]) if (r?.user_id) set.add(r.user_id);
    return set.size;
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
    const { data: flagRows } = await client
      .from("admin_actions")
      .select("target_user_id")
      .gte("created_at", since7dIso)
      .in("action_type", ["flag_user", "freeze_transaction", "escalate_case"])
      .not("target_user_id", "is", null)
      .limit(5000);
    flaggedUsersBadge = new Set(
      ((flagRows ?? []) as any[]).map((r) => r.target_user_id).filter(Boolean),
    ).size;
  } catch {
    flaggedUsersBadge = 0;
  }

  // Identity review health (avg time + 9-day sparkline)
  let avgReviewHours: number | null = null;
  let identitySpark: number[] = [];
  try {
    const { data: reviewed } = await client
      .from("identity_submissions")
      .select("submitted_at, reviewed_at")
      .gte("reviewed_at", since30d)
      .not("reviewed_at", "is", null)
      .limit(2000);
    if (reviewed && reviewed.length) {
      const hrs = (reviewed as any[])
        .map((r) =>
          (new Date(r.reviewed_at).getTime() - new Date(r.submitted_at).getTime()) /
          (1000 * 60 * 60),
        )
        .filter((n) => Number.isFinite(n) && n >= 0);
      if (hrs.length) {
        avgReviewHours = Number(
          (hrs.reduce((a, b) => a + b, 0) / hrs.length).toFixed(1),
        );
      }
    }
    const { data: subs9d } = await client
      .from("identity_submissions")
      .select("submitted_at")
      .gte("submitted_at", since9d)
      .limit(5000);
    const buckets: number[] = Array(9).fill(0);
    const today0 = new Date(startOfToday).getTime();
    for (const r of (subs9d ?? []) as any[]) {
      const t = new Date(r.submitted_at).getTime();
      const dayIdx = 8 - Math.floor((today0 - new Date(
        new Date(r.submitted_at).getFullYear(),
        new Date(r.submitted_at).getMonth(),
        new Date(r.submitted_at).getDate(),
      ).getTime()) / (24 * 60 * 60 * 1000));
      if (dayIdx >= 0 && dayIdx < 9) buckets[dayIdx]++;
    }
    identitySpark = buckets;
  } catch (e) {
    await logEdgeError(client, `identity_health_failed: ${(e as Error).message}`, userId);
  }

  // ---------- Payout Health: avg payout time + 9d sparkline ----------
  let avgPayoutHours: number | null = null;
  let payoutSpark: number[] = [];
  try {
    const { data: completedPayouts } = await client
      .from("payouts")
      .select("released_at, last_release_attempt_at, updated_at, completed_at")
      .eq("status", "completed")
      .gte("completed_at", since30d)
      .not("completed_at", "is", null)
      .limit(2000);
    if (completedPayouts?.length) {
      const hrs = (completedPayouts as any[])
        .map((r) => {
          const end = new Date(r.completed_at).getTime();
          const startTs = r.released_at
            ? new Date(r.released_at).getTime()
            : r.last_release_attempt_at
            ? new Date(r.last_release_attempt_at).getTime()
            : r.updated_at
            ? new Date(r.updated_at).getTime()
            : NaN;
          return (end - startTs) / (1000 * 60 * 60);
        })
        .filter((n) => Number.isFinite(n) && n >= 0);
      if (hrs.length) {
        avgPayoutHours = Number((hrs.reduce((a, b) => a + b, 0) / hrs.length).toFixed(1));
      }
    }
    const { data: payouts9d } = await client
      .from("payouts")
      .select("completed_at")
      .eq("status", "completed")
      .gte("completed_at", since9d)
      .limit(5000);
    const buckets: number[] = Array(9).fill(0);
    const today0 = new Date(startOfToday).getTime();
    for (const r of (payouts9d ?? []) as any[]) {
      const d = new Date(r.completed_at);
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const dayIdx = 8 - Math.floor((today0 - dayStart) / (24 * 60 * 60 * 1000));
      if (dayIdx >= 0 && dayIdx < 9) buckets[dayIdx]++;
    }
    payoutSpark = buckets;
  } catch (e) {
    await logEdgeError(client, `payout_health_failed: ${(e as Error).message}`, userId);
  }

  // ---------- Reconciliation Mismatches ----------
  // Successful payments in the last 30d that lack a matching escrow_ledger_entries
  // payment_credit/escrow_hold deposit for the same transaction.
  // TODO: extend reconciliation rules — duplicate webhook ledger entries,
  // held_amount vs payment_amount drift on escrow_states.
  let reconMismatchCount = 0;
  try {
    const { data: succ } = await client
      .from("payments")
      .select("transaction_id")
      .eq("status", "succeeded")
      .gte("created_at", since30d)
      .not("transaction_id", "is", null)
      .limit(2000);
    const txIds = Array.from(
      new Set(((succ ?? []) as any[]).map((r) => r.transaction_id).filter(Boolean)),
    );
    if (txIds.length) {
      const { data: ledger } = await client
        .from("escrow_ledger_entries")
        .select("transaction_id, entry_type")
        .in("transaction_id", txIds)
        .in("entry_type", ["payment_credit", "escrow_hold"]);
      const haveDeposit = new Set(
        ((ledger ?? []) as any[]).map((r) => r.transaction_id),
      );
      reconMismatchCount = txIds.filter((id) => !haveDeposit.has(id)).length;
    }
  } catch (e) {
    await logEdgeError(client, `recon_failed: ${(e as Error).message}`, userId);
  }

  // ---------- Escrow / Releases / Refunds 30-day trend ----------
  const escrowTrendPoints: Array<{ label: string; primary: number; secondary: number; tertiary: number }> = [];
  try {
    const { data: ledger30 } = await client
      .from("escrow_ledger_entries")
      .select("created_at, entry_type, amount")
      .gte("created_at", since30d)
      .limit(20000);
    const map = new Map<string, { primary: number; secondary: number; tertiary: number }>();
    const today0 = new Date(startOfToday).getTime();
    // seed 30 days
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today0 - i * 24 * 60 * 60 * 1000);
      const key = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      map.set(key, { primary: 0, secondary: 0, tertiary: 0 });
    }
    for (const r of (ledger30 ?? []) as any[]) {
      const d = new Date(r.created_at);
      const key = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const bucket = map.get(key);
      if (!bucket) continue;
      const amt = Math.abs(Number(r.amount ?? 0));
      if (r.entry_type === "escrow_hold" || r.entry_type === "payment_credit") {
        bucket.primary += amt;
      } else if (r.entry_type === "payout_debit") {
        bucket.secondary += amt;
      } else if (r.entry_type === "refund_debit") {
        bucket.tertiary += amt;
      }
    }
    for (const [label, v] of map.entries()) {
      escrowTrendPoints.push({
        label,
        primary: Number(v.primary.toFixed(2)),
        secondary: Number(v.secondary.toFixed(2)),
        tertiary: Number(v.tertiary.toFixed(2)),
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

    // Escrow low balance — only if threshold is set in settings
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

    // SLA-overdue disputes — any overdue case is alert-worthy
    if (slaOverdue > 0) {
      criticalAlerts.push({
        id: "alert-disputes-overdue",
        title: `${slaOverdue} dispute${slaOverdue === 1 ? "" : "s"} overdue`,
        description: `Response SLA breached. Triage in the dispute queue.`,
        severity: "red", at_iso: nowIso,
        action_label: "Open Disputes", action_href: "/admin/disputes",
      });
    }

    // Stuck transactions flagged for admin review — surface immediately
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

  // Pre-seed 7-day Transactions vs Disputes trend so the chart's first paint
  // matches the 7D view served by `admin-dashboard-trend`.
  const txDisputeTrendPoints: Array<{ label: string; date: string; primary: number; secondary: number }> = [];
  try {
    const today0 = new Date(startOfToday).getTime();
    const since7dStartIso = new Date(today0 - 6 * 24 * 60 * 60 * 1000).toISOString();
    const [{ data: tx7 }, { data: dp7 }] = await Promise.all([
      client.from("transactions").select("created_at").gte("created_at", since7dStartIso).limit(50000),
      client.from("disputes").select("created_at").gte("created_at", since7dStartIso).limit(50000),
    ]);
    const map = new Map<string, { primary: number; secondary: number }>();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today0 - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      map.set(key, { primary: 0, secondary: 0 });
    }
    for (const r of (tx7 ?? []) as any[]) {
      const d = new Date(r.created_at);
      const key = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0, 10);
      const b = map.get(key);
      if (b) b.primary++;
    }
    for (const r of (dp7 ?? []) as any[]) {
      const d = new Date(r.created_at);
      const key = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0, 10);
      const b = map.get(key);
      if (b) b.secondary++;
    }
    for (const [date, v] of map.entries()) {
      txDisputeTrendPoints.push({ label: date.slice(5), date, primary: v.primary, secondary: v.secondary });
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
      { key: "awaiting_release", label: "Awaiting Release", count: awaitingRelease, severity: "blue", action_label: "Open Release Queue", action_href: "/admin/release-queue" },
      { key: "failed_payouts", label: "Failed Payouts", count: failedPayouts, severity: "red", action_label: "Investigate", action_href: "/admin/payouts" },
      { key: "disputes_needing_decision", label: "Disputes Needing Decision", count: disputesOpen, severity: "orange", action_label: "Decide", action_href: "/admin/disputes" },
      { key: "stuck_transactions", label: "Stuck Transactions", count: stuckTx > 0 ? stuckTx : flaggedNeedsReview, severity: "purple", action_label: "Review Queue", action_href: "/admin/transactions/stuck" },
      { key: "identity_reviews_pending", label: "Identity Reviews Pending", count: identityPending, severity: "cyan", action_label: "Open Reviews", action_href: "/admin/identity-reviews" },
      { key: "webhook_recon_issues", label: "Webhook & Reconciliation", count: webhookFailures, severity: "yellow", action_label: "Investigate", action_href: "/admin/webhooks" },
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
      compliance_status: highSev24h > 10 ? "amber" : "green",
      compliance_last_check_iso: now.toISOString(),
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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return adminErrorResponse("Not authenticated", 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = authHeader.replace("Bearer ", "");

    // Auth-only client to verify the JWT — no service-role used for authn
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: userData, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !userData?.user) {
      return adminErrorResponse("Invalid session", 401);
    }
    const userId = userData.user.id;

    // Confirm admin role BEFORE any service-role data access
    const { data: hasRole, error: roleError } = await adminClient.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (roleError || !hasRole) {
      return adminErrorResponse("Admin role required", 403);
    }

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
