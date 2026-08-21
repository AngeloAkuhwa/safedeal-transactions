/**
 * Admin Escrow Overview aggregator (read-only).
 * GET → returns KPIs, trends, alerts, and a paginated records slice for the
 * Admin → Escrow page. Admin-only.
 */
import { requireAdmin, authErrorResponse , requirePermission} from "../_shared/auth.ts";
import { fetchReconciliationRows, fetchReconciliationSummary, EMPTY_SUMMARY, type ReconciliationRow } from "../_shared/reconciliation.ts";

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

  let ctx;
  try {
    ctx = await requirePermission(req, "escrow.view");
  } catch (err) {
    const r = authErrorResponse(err, corsHeaders);
    if (r) return r;
    console.error("[admin-escrow-overview] auth", err);
    return json(500, { error: "auth_failed" });
  }

  if (req.method !== "GET") return json(405, { error: "method_not_allowed" });
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

  // ---- KPIs (SQL-side aggregate, no in-memory scan) ----
  const { data: kpiRows, error: kpiErr } = await admin.rpc("admin_escrow_kpis");
  if (kpiErr) {
    console.error("[admin-escrow-overview] kpis rpc", kpiErr);
    return json(500, { error: "kpis_fetch_failed" });
  }
  const k = (kpiRows?.[0] ?? {}) as Record<string, number | string | null>;
  const totalHeld = Number(k.total_held ?? 0);
  const heldCount = Number(k.total_held_count ?? 0);
  const totalFrozen = Number(k.total_frozen ?? 0);
  const frozenCount = Number(k.total_frozen_count ?? 0);
  const totalRefunded = Number(k.total_refunded ?? 0);
  const refundedCount = Number(k.total_refunded_count ?? 0);
  const pendingRelease = Number(k.pending_release ?? 0);
  const pendingReleaseCount = Number(k.pending_release_count ?? 0);
  const releasedToday = {
    total: Number(k.released_today ?? 0),
    count: Number(k.released_today_count ?? 0),
  };
  const releasedWeek = {
    total: Number(k.released_week ?? 0),
    count: Number(k.released_week_count ?? 0),
  };

  // KPI aggregates sum across every escrow row, so they only carry a currency
  // when the whole book settles in one. `admin_escrow_kpis` computes
  // `count(distinct currency_code)` in SQL over the ENTIRE pricing table. A
  // sampled page could miss a second currency and let the tiles assert one.
  // Mixed books yield null and the UI renders the amount without a symbol.
  const distinctCurrencyCount = Number(k.distinct_currency_count ?? 0);
  const aggregateCurrency =
    distinctCurrencyCount === 1 && typeof k.book_currency === "string" && k.book_currency
      ? k.book_currency
      : null;

  // Alerts still need row-level detail, but scoped to the alert window and
  // rows that could actually trigger any alert (bounded scan, not full table).
  const alertWindowIso = new Date(now - Math.max(60, thresholds.frozen_days + 30) * DAY_MS).toISOString();
  const { data: states } = await admin
    .from("escrow_states")
    .select("transaction_id, held_amount, frozen_amount, refunded_amount, last_changed_at")
    .or(`frozen_amount.gt.0,held_amount.gte.${thresholds.high_value_amount}`)
    .gte("last_changed_at", alertWindowIso);

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

  // Canonical cash chain (must match reconcile-escrow):
  //   credits = payment_credit + adjustment   (adjustments are signed append-only corrections)
  //   debits  = payout_debit + refund_debit
  // Deliberately EXCLUDED from the cash chain:
  //   - escrow_hold: mirror of payment_credit, would double-count
  //   - fee_record: platform fee bookkeeping, not escrow cash movement
  //   - freeze_hold, payout_awaiting_release,
  //     dispute_release_approved_pending_admin_release: intent markers, no cash moved
  const sevenDaysAgo = now - 7 * DAY_MS;
  let heldBaseline = 0, refundedBaseline = 0;
  for (const e of ledgerWide ?? []) {
    const t = new Date(e.created_at as string).getTime();
    if (t > sevenDaysAgo) continue;
    const type = e.entry_type as string;
    const amt = Number(e.amount ?? 0);
    if (type === "payment_credit" || type === "adjustment") heldBaseline += amt;
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
  const pendingDelta = pendingReleaseCount > 0 ? pct(pendingReleaseCount, Math.max(1, pendingReleaseCount - 1)) : 0;

  // ---- Trends ----
  // Balance trend = cumulative net ledger balance per day for the last 30d.
  const { data: ledger } = await admin
    .from("escrow_ledger_entries")
    .select("entry_type, amount, created_at")
    .gte("created_at", since30)
    .order("created_at", { ascending: true });

  // Same canonical credit/debit sets as reconcile-escrow: see note above.
  const CREDIT = new Set(["payment_credit", "adjustment"]);
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
    { state: "Pending Release", value: pendingReleaseCount },
    { state: "Refunded", value: refundedCount },
    { state: "Released", value: releasedWeek.count },
  ];

  // ---- Alerts ----
  // Frozen too long: uses dynamic threshold from system_settings
  const frozenCutoff = now - thresholds.frozen_days * DAY_MS;
  const frozenTooLongRows = (states ?? [])
    .filter((s) => Number(s.frozen_amount ?? 0) > 0 && new Date(s.last_changed_at as string).getTime() < frozenCutoff)
    .slice(0, 10);

  // Provider mismatch: canonical reconciliation (same routine the Dashboard
  // and the Reconciliation hub call, so the counts always agree).
  let reconSummary = { ...EMPTY_SUMMARY };
  let reconRows: ReconciliationRow[] = [];
  try {
    [reconSummary, reconRows] = await Promise.all([
      fetchReconciliationSummary(admin, null),
      fetchReconciliationRows(admin, { onlyIssues: true }),
    ]);
  } catch (e) {
    console.error("[admin-escrow-overview] reconciliation failed", e);
  }
  const drift = reconRows
    .filter((r) => r.status === "mismatch" || r.status === "requires_review")
    .slice(0, 10)
    .map((r) => ({ transaction_id: r.transaction_id, delta: r.difference, status: r.status }));

  // High-value held: dynamic threshold (acts as "stuck/idle" candidates pool)
  const highValueRows = (states ?? [])
    .filter((s) =>
      Number(s.held_amount ?? 0) >= thresholds.high_value_amount &&
      (now - new Date(s.last_changed_at as string).getTime()) / DAY_MS >= thresholds.idle_days
    )
    .sort((a, b) => Number(b.held_amount) - Number(a.held_amount))
    .slice(0, 10);

  // Stalled disputes: dynamic overdue threshold
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
    thresholds,
  };

  // ---- Records (paginated) ----
  // P1: pagination + filtering pushed fully into SQL via
  // admin_escrow_records_page. Previously this block filtered/sorted/sliced
  // the entire escrow_states set in JS. An OOM/silent-truncation risk once
  // the table grows past ~100k rows.
  // The KPI scan above still walks escrow_states, but record pagination no
  // longer materializes the full set in JS before slicing.
  const { data: pageRows, error: pageErr } = await admin.rpc("admin_escrow_records_page", {
    _state: state,
    _date_range: dateRange,
    _amount_bucket: amountBucket,
    _page: page,
    _page_size: pageSize,
    _search: q,
    _flag: flag,
  });
  if (pageErr) {
    console.error("[admin-escrow-overview] page rpc", pageErr);
    return json(500, { error: "records_page_failed" });
  }
  type PageRow = {
    transaction_id: string;
    held_amount: number | string | null;
    frozen_amount: number | string | null;
    released_amount: number | string | null;
    refunded_amount: number | string | null;
    last_changed_at: string;
    total_count: number | string;
  };
  const sliced = (pageRows ?? []) as PageRow[];
  const total = sliced.length > 0 ? Number(sliced[0].total_count) : 0;
  const sliceTxIds = sliced.map((s) => s.transaction_id);

  let records: Array<Record<string, unknown>> = [];
  if (sliceTxIds.length) {
    const { data: txs } = await admin
      .from("transactions")
      .select("id, transaction_code, money_status, created_at, buyer_id, seller_id")
      .in("id", sliceTxIds);
    // Currency is part of the balance, not a display default. An admin
    // reconciles these figures against the provider.
    const { data: pricingRows } = await admin
      .from("transaction_pricing")
      .select("transaction_id, currency_code")
      .in("transaction_id", sliceTxIds);
    const currencyMap = new Map(
      ((pricingRows ?? []) as Array<{ transaction_id: string; currency_code: string | null }>)
        .map((p) => [p.transaction_id, p.currency_code ?? null]),
    );
    // P1: only hydrate profiles for participants on this page (was: full
    // `profiles` scan, which OOMs past ~50k users).
    const participantIds = Array.from(
      new Set(
        ((txs ?? []) as Array<{ buyer_id: string | null; seller_id: string | null }>)
          .flatMap((t) => [t.buyer_id, t.seller_id])
          .filter((v): v is string => !!v),
      ),
    );
    const { data: profiles } = participantIds.length
      ? await admin
          .from("profiles")
          .select("id, full_name, avatar_url")
          .in("id", participantIds)
      : { data: [] as Array<{ id: string; full_name: string | null; avatar_url: string | null }> };
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
          currency_code: currencyMap.get(tx.id as string) ?? null,
          total_held: Number(s.held_amount ?? 0) + Number(s.frozen_amount ?? 0),
          frozen: Number(s.frozen_amount ?? 0),
          releasable: Number(s.held_amount ?? 0),
          released: Number(s.released_amount ?? 0),
          refunded: Number(s.refunded_amount ?? 0),
          state: derivedState,
          last_changed_at: s.last_changed_at,
          flagged: disputedSet.has(tx.id as string),
          state_mismatch:
            (Number(s.frozen_amount ?? 0) > 0 && (tx.money_status as string) === "released") ||
            (Number(s.held_amount ?? 0) > 0 && (tx.money_status as string) === "released") ||
            ((tx.money_status as string) === "funds_releasing" && Number(s.held_amount ?? 0) === 0),
        };
      })
      .filter(Boolean) as Array<Record<string, unknown>>;
  }

  // Search + flag filters are now applied inside admin_escrow_records_page
  // (SQL-side) so pagination reflects filtered totals correctly.

  return json(200, {
    kpis: {
      currency_code: aggregateCurrency,
      total_held: totalHeld, total_held_count: heldCount, total_held_delta_pct: heldDelta,
      total_frozen: totalFrozen, total_frozen_count: frozenCount, total_frozen_delta_pct: frozenDelta,
      pending_release: pendingRelease, pending_release_count: pendingReleaseCount, pending_release_delta_pct: pendingDelta,
      total_refunded: totalRefunded, total_refunded_count: refundedCount, total_refunded_delta_pct: refundedDelta,
      released_today: releasedToday.total, released_today_count: releasedToday.count, released_today_delta_pct: releasedTodayDelta,
      released_week: releasedWeek.total, released_week_count: releasedWeek.count, released_week_delta_pct: releasedWeekDelta,
    },
    trends: {
      currency_code: aggregateCurrency,
      balance_30d: balance30d,
      state_distribution: stateDistribution,
      flow_14d: flow14d,
    },
    alerts,
    reconciliation: reconSummary,
    records: { total, page, page_size: pageSize, rows: records },
  });
});