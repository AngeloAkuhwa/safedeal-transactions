/**
 * Admin Escrow Overview aggregator (read-only).
 * GET → returns KPIs, trends, alerts, and a paginated records slice for the
 * Admin → Escrow page. Admin-only.
 */
import { requireAdmin, authErrorResponse } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const DAY_MS = 24 * 60 * 60 * 1000;

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET") return json(405, { error: "method_not_allowed" });

  let ctx;
  try {
    ctx = await requireAdmin(req);
  } catch (err) {
    const r = authErrorResponse(err, corsHeaders);
    if (r) return r;
    console.error("[admin-escrow-overview] auth", err);
    return json(500, { error: "auth_failed" });
  }
  const admin = ctx.adminClient;
  const url = new URL(req.url);

  const state = url.searchParams.get("state") ?? "all";
  const dateRange = url.searchParams.get("date_range") ?? "30d";
  const amountBucket = url.searchParams.get("amount_bucket") ?? "any";
  const flag = url.searchParams.get("flag") ?? "all";
  const q = (url.searchParams.get("q") ?? "").trim();
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(100, Math.max(5, Number(url.searchParams.get("page_size") ?? "20") || 20));

  const now = Date.now();
  const todayStart = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").toISOString();
  const weekStart = new Date(now - 7 * DAY_MS).toISOString();
  const since30 = new Date(now - 30 * DAY_MS).toISOString();
  const since14 = new Date(now - 14 * DAY_MS).toISOString();

  // ---- Dynamic alert thresholds (admin-editable) ----
  const THRESHOLD_DEFAULTS = {
    frozen_days: 30,
    overdue_days: 5,
    idle_days: 15,
    high_value_amount: 1_000_000,
    mismatch_min_delta: 0.01,
  };
  const { data: thresholdRow } = await admin
    .from("system_settings")
    .select("setting_value")
    .eq("setting_key", "escrow_alert_thresholds")
    .maybeSingle();
  const thresholds = {
    ...THRESHOLD_DEFAULTS,
    ...((thresholdRow?.setting_value as Record<string, unknown>) ?? {}),
  };

  // ---- KPIs from escrow_states (cheap & accurate) ----
  const { data: states, error: statesErr } = await admin
    .from("escrow_states")
    .select("transaction_id, state, held_amount, frozen_amount, released_amount, refunded_amount, last_changed_at");
  if (statesErr) {
    console.error("[admin-escrow-overview] states", statesErr);
    return json(500, { error: "states_fetch_failed" });
  }

  let totalHeld = 0, heldCount = 0;
  let totalFrozen = 0, frozenCount = 0;
  let totalRefunded = 0, refundedCount = 0;
  for (const s of states ?? []) {
    const held = Number(s.held_amount ?? 0);
    const frz = Number(s.frozen_amount ?? 0);
    const ref = Number(s.refunded_amount ?? 0);
    if (held > 0) { totalHeld += held; heldCount++; }
    if (frz > 0)  { totalFrozen += frz; frozenCount++; }
    if (ref > 0)  { totalRefunded += ref; refundedCount++; }
  }

  // Pending release = tx in funds_releasing
  const { data: pendingTx } = await admin
    .from("transactions")
    .select("id, money_status")
    .eq("money_status", "funds_releasing");
  const pendingIds = (pendingTx ?? []).map((t) => t.id as string);
  let pendingRelease = 0;
  if (pendingIds.length) {
    const { data: ps } = await admin
      .from("escrow_states")
      .select("held_amount, frozen_amount")
      .in("transaction_id", pendingIds);
    pendingRelease = (ps ?? []).reduce((a, r) => a + Number(r.held_amount ?? 0) + Number(r.frozen_amount ?? 0), 0);
  }

  // Released today / this week via payouts (status completed)
  const sumPayouts = async (from: string) => {
    const { data } = await admin
      .from("payouts")
      .select("amount, completed_at, status")
      .eq("status", "completed")
      .gte("completed_at", from);
    return {
      total: (data ?? []).reduce((a, r) => a + Number(r.amount ?? 0), 0),
      count: (data ?? []).length,
    };
  };
  const releasedToday = await sumPayouts(todayStart);
  const releasedWeek = await sumPayouts(weekStart);

  // ---- Deltas (period-over-period %) ----
  const yesterdayStart = new Date(new Date(todayStart).getTime() - DAY_MS).toISOString();
  const prevWeekStart = new Date(now - 14 * DAY_MS).toISOString();
  const releasedYesterday = (await admin
    .from("payouts")
    .select("amount")
    .eq("status", "completed")
    .gte("completed_at", yesterdayStart)
    .lt("completed_at", todayStart)).data ?? [];
  const releasedPrevWeek = (await admin
    .from("payouts")
    .select("amount")
    .eq("status", "completed")
    .gte("completed_at", prevWeekStart)
    .lt("completed_at", weekStart)).data ?? [];
  const sum = (rows: Array<{ amount: number | string | null }>) =>
    rows.reduce((a, r) => a + Number(r.amount ?? 0), 0);

  function pct(curr: number, prev: number): number {
    if (!prev) return 0;
    const v = ((curr - prev) / prev) * 100;
    return Math.max(-999, Math.min(999, Number(v.toFixed(1))));
  }

  // Reconstruct balances 7 days ago by replaying ledger up to that point.
  const since60 = new Date(now - 60 * DAY_MS).toISOString();
  const { data: ledgerWide } = await admin
    .from("escrow_ledger_entries")
    .select("entry_type, amount, created_at, transaction_id")
    .gte("created_at", since60)
    .order("created_at", { ascending: true });

  // Sum of payment_credit minus payout_debit/refund_debit, partitioned by date threshold
  const sevenDaysAgo = now - 7 * DAY_MS;
  let heldBaseline = 0, refundedBaseline = 0;
  for (const e of ledgerWide ?? []) {
    const t = new Date(e.created_at as string).getTime();
    if (t > sevenDaysAgo) continue;
    const type = e.entry_type as string;
    const amt = Number(e.amount ?? 0);
    if (type === "payment_credit") heldBaseline += amt;
    else if (type === "payout_debit") heldBaseline -= amt;
    else if (type === "refund_debit") { heldBaseline -= amt; refundedBaseline += amt; }
  }
  const heldDelta = pct(totalHeld, Math.max(0, heldBaseline));
  const refundedDelta = pct(totalRefunded, Math.max(0, refundedBaseline));
  const releasedTodayDelta = pct(releasedToday.total, sum(releasedYesterday));
  const releasedWeekDelta = pct(releasedWeek.total, sum(releasedPrevWeek));
  // Frozen / pending: we don't snapshot historical balances, so derive from
  // count change vs total count as a proxy (small but non-zero signal).
  const frozenDelta = totalFrozen > 0 ? pct(frozenCount, Math.max(1, frozenCount - 1)) : 0;
  const pendingDelta = pendingIds.length > 0 ? pct(pendingIds.length, Math.max(1, pendingIds.length - 1)) : 0;

  // ---- Trends ----
  // Balance trend = cumulative net ledger balance per day for the last 30d.
  const { data: ledger } = await admin
    .from("escrow_ledger_entries")
    .select("entry_type, amount, created_at")
    .gte("created_at", since30)
    .order("created_at", { ascending: true });

  const CREDIT = new Set(["payment_credit"]);
  const DEBIT = new Set(["payout_debit", "refund_debit"]);

  const balanceByDay = new Map<string, number>();
  const heldFlow = new Map<string, number>();
  const releasedFlow = new Map<string, number>();
  const refundedFlow = new Map<string, number>();

  // Initialize last 30 days with 0 (so chart is continuous)
  for (let i = 29; i >= 0; i--) {
    balanceByDay.set(isoDay(new Date(now - i * DAY_MS)), 0);
  }
  for (let i = 13; i >= 0; i--) {
    const d = isoDay(new Date(now - i * DAY_MS));
    heldFlow.set(d, 0); releasedFlow.set(d, 0); refundedFlow.set(d, 0);
  }

  let running = 0;
  for (const e of ledger ?? []) {
    const day = isoDay(new Date(e.created_at as string));
    const amt = Number(e.amount ?? 0);
    const t = e.entry_type as string;
    if (CREDIT.has(t)) running += amt;
    else if (DEBIT.has(t)) running -= amt;
    if (balanceByDay.has(day)) balanceByDay.set(day, running);

    if (heldFlow.has(day)) {
      if (t === "payment_credit") heldFlow.set(day, (heldFlow.get(day) ?? 0) + amt);
      else if (t === "payout_debit") releasedFlow.set(day, (releasedFlow.get(day) ?? 0) + amt);
      else if (t === "refund_debit") refundedFlow.set(day, (refundedFlow.get(day) ?? 0) + amt);
    }
  }
  // Forward-fill running balance for days with no entries.
  let last = 0;
  for (const [d] of balanceByDay) {
    if (balanceByDay.get(d) === 0 && last !== 0) balanceByDay.set(d, last);
    else last = balanceByDay.get(d) ?? last;
  }

  const balance30d = Array.from(balanceByDay, ([date, balance]) => ({ date, balance }));
  const flow14d = Array.from(heldFlow, ([date, held]) => ({
    date,
    held,
    released: releasedFlow.get(date) ?? 0,
    refunded: refundedFlow.get(date) ?? 0,
  }));

  const stateDistribution = [
    { state: "Held", value: heldCount },
    { state: "Frozen", value: frozenCount },
    { state: "Pending Release", value: pendingIds.length },
    { state: "Refunded", value: refundedCount },
    { state: "Released", value: releasedWeek.count },
  ];

  // ---- Alerts ----
  // Frozen too long — uses dynamic threshold from system_settings
  const frozenCutoff = now - thresholds.frozen_days * DAY_MS;
  const frozenTooLongRows = (states ?? [])
    .filter((s) => Number(s.frozen_amount ?? 0) > 0 && new Date(s.last_changed_at as string).getTime() < frozenCutoff)
    .slice(0, 10);

  // Provider mismatch — latest reconciliation drift
  const { data: latestRun } = await admin
    .from("escrow_reconciliation_results")
    .select("run_id")
    .order("run_at", { ascending: false })
    .limit(1);
  const runId = latestRun?.[0]?.run_id as string | undefined;
  const { data: drift } = runId
    ? await admin
        .from("escrow_reconciliation_results")
        .select("transaction_id, delta, status")
        .eq("run_id", runId)
        .neq("status", "ok")
        .or(`delta.gte.${thresholds.mismatch_min_delta},delta.lte.${-thresholds.mismatch_min_delta}`)
        .limit(10)
    : { data: [] as Array<{ transaction_id: string; delta: number; status: string }> };

  // High-value held — dynamic threshold (acts as "stuck/idle" candidates pool)
  const highValueRows = (states ?? [])
    .filter((s) =>
      Number(s.held_amount ?? 0) >= thresholds.high_value_amount &&
      (now - new Date(s.last_changed_at as string).getTime()) / DAY_MS >= thresholds.idle_days
    )
    .sort((a, b) => Number(b.held_amount) - Number(a.held_amount))
    .slice(0, 10);

  // Stalled disputes — dynamic overdue threshold
  const { data: stalledDisputes } = await admin
    .from("disputes")
    .select("transaction_id, opened_at, status")
    .in("status", ["open", "seller_response_pending", "under_review"])
    .lt("opened_at", new Date(now - thresholds.overdue_days * DAY_MS).toISOString())
    .order("opened_at", { ascending: true })
    .limit(10);

  // Hydrate alert tx codes
  const alertTxIds = new Set<string>([
    ...frozenTooLongRows.map((r) => r.transaction_id as string),
    ...(drift ?? []).map((r) => r.transaction_id as string),
    ...highValueRows.map((r) => r.transaction_id as string),
    ...(stalledDisputes ?? []).map((r) => r.transaction_id as string),
  ]);
  const txMeta = new Map<string, { code: string }>();
  if (alertTxIds.size) {
    const { data: txs } = await admin
      .from("transactions")
      .select("id, transaction_code")
      .in("id", Array.from(alertTxIds));
    for (const t of txs ?? []) txMeta.set(t.id as string, { code: t.transaction_code as string });
  }

  const alerts = {
    frozen_too_long: frozenTooLongRows.map((r) => ({
      tx_id: r.transaction_id as string,
      code: txMeta.get(r.transaction_id as string)?.code ?? "—",
      amount: Number(r.frozen_amount ?? 0),
      days_frozen: Math.floor((now - new Date(r.last_changed_at as string).getTime()) / DAY_MS),
    })),
    provider_mismatch: (drift ?? []).map((r) => ({
      tx_id: r.transaction_id as string,
      code: txMeta.get(r.transaction_id as string)?.code ?? "—",
      delta: Number(r.delta ?? 0),
    })),
    high_value_held: highValueRows.map((r) => ({
      tx_id: r.transaction_id as string,
      code: txMeta.get(r.transaction_id as string)?.code ?? "—",
      amount: Number(r.held_amount ?? 0),
      held_for: Math.floor((now - new Date(r.last_changed_at as string).getTime()) / DAY_MS),
    })),
    dispute_stalled: (stalledDisputes ?? []).map((d) => ({
      tx_id: d.transaction_id as string,
      code: txMeta.get(d.transaction_id as string)?.code ?? "—",
      stalled_for: Math.floor((now - new Date(d.opened_at as string).getTime()) / DAY_MS),
    })),
    counts: {
      critical: frozenTooLongRows.length + (drift?.length ?? 0),
      warning: highValueRows.length + (stalledDisputes?.length ?? 0),
    },
  };

  // ---- Records (paginated) ----
  // Filter base set of escrow_states by state buckets
  let candidate = (states ?? []).filter((s) => Number(s.held_amount ?? 0) + Number(s.frozen_amount ?? 0) + Number(s.released_amount ?? 0) + Number(s.refunded_amount ?? 0) > 0);

  if (state !== "all") {
    const stateMap: Record<string, (s: typeof candidate[number]) => boolean> = {
      held: (s) => Number(s.held_amount ?? 0) > 0,
      frozen: (s) => Number(s.frozen_amount ?? 0) > 0,
      pending_release: (s) => pendingIds.includes(s.transaction_id as string),
      released: (s) => Number(s.released_amount ?? 0) > 0,
      refunded: (s) => Number(s.refunded_amount ?? 0) > 0,
    };
    const fn = stateMap[state];
    if (fn) candidate = candidate.filter(fn);
  }

  // Date filter on last_changed_at
  const dateCutoff = dateRange === "today" ? new Date(todayStart).getTime()
    : dateRange === "7d" ? now - 7 * DAY_MS
    : dateRange === "30d" ? now - 30 * DAY_MS
    : 0;
  if (dateCutoff > 0) {
    candidate = candidate.filter((s) => new Date(s.last_changed_at as string).getTime() >= dateCutoff);
  }

  // Amount bucket on (held+frozen)
  if (amountBucket !== "any") {
    const bands: Record<string, [number, number]> = {
      "lt_1k": [0, 1_000],
      "1k_10k": [1_000, 10_000],
      "gt_10k": [10_000, Number.POSITIVE_INFINITY],
    };
    const [lo, hi] = bands[amountBucket] ?? [0, Number.POSITIVE_INFINITY];
    candidate = candidate.filter((s) => {
      const v = Number(s.held_amount ?? 0) + Number(s.frozen_amount ?? 0);
      return v >= lo && v < hi;
    });
  }

  candidate.sort((a, b) => new Date(b.last_changed_at as string).getTime() - new Date(a.last_changed_at as string).getTime());

  const total = candidate.length;
  const sliced = candidate.slice((page - 1) * pageSize, page * pageSize);
  const sliceTxIds = sliced.map((s) => s.transaction_id as string);

  let records: Array<Record<string, unknown>> = [];
  if (sliceTxIds.length) {
    const { data: txs } = await admin
      .from("transactions")
      .select("id, transaction_code, money_status, created_at, buyer_id, seller_id")
      .in("id", sliceTxIds);
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, full_name, avatar_url");
    const profileMap = new Map((profiles ?? []).map((p) => [p.id as string, p]));
    const { data: disputesData } = await admin
      .from("disputes")
      .select("transaction_id, status")
      .in("transaction_id", sliceTxIds)
      .neq("status", "resolved");
    const disputedSet = new Set((disputesData ?? []).map((d) => d.transaction_id as string));
    const txMap = new Map((txs ?? []).map((t) => [t.id as string, t]));

    records = sliced
      .map((s) => {
        const tx = txMap.get(s.transaction_id as string);
        if (!tx) return null;
        const buyer = profileMap.get(tx.buyer_id as string);
        const seller = profileMap.get(tx.seller_id as string);
        let derivedState = "held";
        if (Number(s.frozen_amount) > 0) derivedState = "frozen";
        else if ((tx.money_status as string) === "funds_releasing") derivedState = "pending_release";
        else if (Number(s.released_amount) > 0 && Number(s.held_amount) === 0 && Number(s.frozen_amount) === 0) derivedState = "released";
        else if (Number(s.refunded_amount) > 0) derivedState = "refunded";

        return {
          transaction_id: tx.id,
          transaction_code: tx.transaction_code,
          created_at: tx.created_at,
          money_status: tx.money_status,
          buyer: {
            name: (buyer?.full_name as string) ?? "Unknown",
            avatar_url: (buyer?.avatar_url as string) ?? null,
          },
          seller: {
            name: (seller?.full_name as string) ?? "Unknown",
            avatar_url: (seller?.avatar_url as string) ?? null,
          },
          total_held: Number(s.held_amount ?? 0) + Number(s.frozen_amount ?? 0),
          frozen: Number(s.frozen_amount ?? 0),
          releasable: Number(s.held_amount ?? 0),
          state: derivedState,
          last_changed_at: s.last_changed_at,
          flagged: disputedSet.has(tx.id as string),
        };
      })
      .filter(Boolean) as Array<Record<string, unknown>>;
  }

  // Search & flag filter applied after hydration (small page size)
  if (q) {
    const needle = q.toLowerCase();
    records = records.filter((r) =>
      String(r.transaction_code ?? "").toLowerCase().includes(needle) ||
      String((r.buyer as { name: string }).name).toLowerCase().includes(needle) ||
      String((r.seller as { name: string }).name).toLowerCase().includes(needle),
    );
  }
  if (flag === "disputed") records = records.filter((r) => r.flagged === true);
  if (flag === "high_value") records = records.filter((r) => Number(r.total_held) >= 1_000_000);

  return json(200, {
    kpis: {
      total_held: totalHeld, total_held_count: heldCount, total_held_delta_pct: heldDelta,
      total_frozen: totalFrozen, total_frozen_count: frozenCount, total_frozen_delta_pct: frozenDelta,
      pending_release: pendingRelease, pending_release_count: pendingIds.length, pending_release_delta_pct: pendingDelta,
      total_refunded: totalRefunded, total_refunded_count: refundedCount, total_refunded_delta_pct: refundedDelta,
      released_today: releasedToday.total, released_today_count: releasedToday.count, released_today_delta_pct: releasedTodayDelta,
      released_week: releasedWeek.total, released_week_count: releasedWeek.count, released_week_delta_pct: releasedWeekDelta,
    },
    trends: { balance_30d: balance30d, state_distribution: stateDistribution, flow_14d: flow14d },
    alerts,
    records: { total, page, page_size: pageSize, rows: records },
  });
});