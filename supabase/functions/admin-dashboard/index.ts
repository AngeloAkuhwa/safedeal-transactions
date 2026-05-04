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
    q.in("status", ["pending", "processing"]),
  );

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

  // Recent activity: last 3 status history entries we can show
  let recentActivity: any[] = [];
  try {
    const { data } = await client
      .from("transaction_status_history")
      .select("id, transaction_id, new_status, changed_at")
      .order("changed_at", { ascending: false })
      .limit(3);
    recentActivity = (data ?? []).map((r: any) => ({
      id: r.id,
      kind:
        r.new_status === "completed"
          ? "transaction_completed"
          : r.new_status === "funds_released"
          ? "escrow_released"
          : "transaction_completed",
      title: `Transaction ${r.new_status}`,
      subtitle: `TX ${String(r.transaction_id).slice(0, 8)}`,
      at_iso: r.changed_at,
    }));
  } catch (e) {
    await logEdgeError(client, `recent_activity_failed: ${(e as Error).message}`, userId);
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

  // Trends — empty arrays for now (frontend builds windows separately)
  const emptyTrend = { primary_label: "Transactions", secondary_label: "Disputes", points: [] as any[] };
  const emptyEscrowTrend = {
    primary_label: "Escrow Held",
    secondary_label: "Released",
    tertiary_label: "Refunded",
    points: [] as any[],
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
      transactions_vs_disputes: emptyTrend,
      escrow_releases_refunds: emptyEscrowTrend,
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
      { key: "recon_mismatches", label: "Reconciliation Mismatches", count: reconMismatches, severity: "yellow" },
    ],
    identity_health: {
      pending_reviews: identityPending,
      avg_review_hours: avgReviewHours,
      spark: identitySpark,
    },
    payout_health: {
      pending_payouts_amount: Number(pendingPayoutsAmount.toFixed(2)),
      avg_payout_hours: null as number | null,
      spark: [] as number[],
    },
    audit_signal: {
      last_audit_entry: lastAuditEntry,
      high_severity_actions_24h: highSev24h,
      impersonation_sessions_24h: 0,
      failed_admin_logins_24h: 0,
      compliance_status: highSev24h > 10 ? "amber" : "green",
      compliance_last_check_iso: now.toISOString(),
    },
    critical_alerts: [] as any[],
    recent_activity: recentActivity,
    performance: [] as any[],
    sidebar_badges: {
      disputes: badgeDisputes,
      identity: badgeIdentity,
      payouts: badgePayouts,
      flagged_users: 0,
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
