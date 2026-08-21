/**
 * Phase 6 — hourly escrow reconciliation job.
 *
 * For every transaction touched in the last 24h, compares:
 *   paystack_collected (sum of succeeded payments.amount)
 *   paystack_paid_out  (sum of payouts.amount where status in processing/completed)
 *   paystack_refunded  (sum of refunds.amount where status in processing/completed)
 *   ledger_balance     (signed sum of escrow_ledger_entries by entry_type)
 * Writes one row per (transaction, run) into `escrow_reconciliation_results`.
 * Drift (|delta| >= 0.01) raises a deduplicated ops alert (one active alert per
 * transaction, refreshed on repeat runs and resolved when the drift clears).
 *
 * Triggered hourly by pg_cron (no auth required — the function is locked to
 * the service role and only writes its own table + sends ops notifications).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { formatMoney } from "../_shared/money-copy.ts";
import { requirePermission, authErrorResponse } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const CREDIT_ENTRY_TYPES = new Set([
  "payment_credit",
  // Append-only corrections posted through `apply_financial_remediation_atomic`
  // are credits in the canonical model (escrow_hold + adjustment − debits).
  "adjustment",
]);
const DEBIT_ENTRY_TYPES = new Set([
  "payout_debit",
  "refund_debit",
]);
const TOLERANCE = 0.01;
const LEASE_JOB_NAME = "reconcile-escrow";
const HEARTBEAT_EVERY_MS = 30_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  // ---------------------------------------------------------------------
  // AUTHORIZATION. Two — and only two — authorized callers:
  //   1. the pg_cron scheduler, presenting the vault-held cron secret;
  //   2. a signed-in back-office user holding `financial_controls.configure`.
  // Anonymous / publishable-key / unauthenticated requests are rejected
  // before any lease is taken or any row is read.
  // ---------------------------------------------------------------------
  const cronSecret = req.headers.get("x-cron-secret");
  let caller: "scheduler" | "admin";
  if (cronSecret) {
    const { data: ok, error: verifyErr } = await admin.rpc(
      "verify_reconcile_cron_secret",
      { p_secret: cronSecret },
    );
    if (verifyErr) {
      console.error("[reconcile-escrow] cron secret verification failed", verifyErr.message);
      return json(500, { error: "cron_auth_unavailable" });
    }
    if (ok !== true) return json(401, { error: "unauthorized" });
    caller = "scheduler";
  } else {
    try {
      await requirePermission(req, "financial_controls.configure");
      caller = "admin";
    } catch (err) {
      const r = authErrorResponse(err, corsHeaders);
      if (r) return r;
      console.error("[reconcile-escrow] auth error", err);
      return json(500, { error: "auth_failed" });
    }
  }

  // Method contract is disclosed only after the caller is authorized.
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });



  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* allow empty */ }
  const runId = (typeof body.run_id === "string" ? body.run_id : crypto.randomUUID());
  const lookbackHours = Number((body as { lookback_hours?: unknown }).lookback_hours) || 24;
  const dryRun = (body as { dry_run?: unknown }).dry_run === true;
  console.log("[reconcile-escrow] authorized run", { caller, runId, dryRun });

  if (dryRun) {
    // Authorization smoke-check that touches no lease and writes no rows.
    return json(200, { ok: true, dry_run: true, caller, run_id: runId });
  }

  const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();

  // 0. Single-runner lease. A stale lease (no heartbeat within the configured
  //    TTL) is taken over automatically; an active one short-circuits the run.
  const { data: leaseRes, error: leaseErr } = await admin.rpc("acquire_job_lease", {
    p_job_name: LEASE_JOB_NAME,
    p_holder: runId,
  });
  if (leaseErr) {
    console.error("[reconcile-escrow] lease acquire failed", leaseErr);
    return json(500, { error: "lease_acquire_failed", detail: leaseErr.message });
  }
  const lease = (leaseRes ?? {}) as {
    acquired?: boolean; lease_token?: string; held_by?: string; expires_at?: string;
  };
  if (!lease.acquired) {
    console.warn("[reconcile-escrow] another run holds the lease", lease);
    return json(409, {
      error: "reconciliation_already_running",
      held_by: lease.held_by ?? null,
      expires_at: lease.expires_at ?? null,
    });
  }
  const leaseToken = lease.lease_token!;
  let lastHeartbeat = Date.now();
  const heartbeat = async () => {
    if (Date.now() - lastHeartbeat < HEARTBEAT_EVERY_MS) return;
    lastHeartbeat = Date.now();
    const { data: alive } = await admin.rpc("heartbeat_job_lease", {
      p_job_name: LEASE_JOB_NAME,
      p_lease_token: leaseToken,
    });
    if (alive === false) {
      console.warn("[reconcile-escrow] lease lost mid-run", { runId });
    }
  };
  const finish = async (status: number, payload: Record<string, unknown>) => {
    try {
      await admin.rpc("release_job_lease", {
        p_job_name: LEASE_JOB_NAME,
        p_lease_token: leaseToken,
      });
    } catch (e) {
      console.warn("[reconcile-escrow] lease release failed", e);
    }
    return json(status, payload);
  };

  // 1. Candidate transactions: anything updated in window + anything with an
  //    open drift from a prior run.
  const { data: recentTx, error: recentErr } = await admin
    .from("transactions")
    .select("id, transaction_code, money_status, updated_at")
    .gte("updated_at", since)
    .not("money_status", "in", "(not_secured,payment_pending)");
  if (recentErr) {
    console.error("[reconcile-escrow] tx fetch failed", recentErr);
    return await finish(500, { error: "tx_fetch_failed", detail: recentErr.message });
  }

  const { data: openDrift } = await admin
    .from("escrow_reconciliation_results")
    .select("transaction_id")
    .neq("status", "ok")
    .gte("run_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

  const ids = new Set<string>((recentTx ?? []).map((t) => t.id as string));
  for (const r of openDrift ?? []) ids.add(r.transaction_id as string);
  const txIds = Array.from(ids);

  if (txIds.length === 0) {
    return await finish(200, { ok: true, run_id: runId, considered: 0, drift_count: 0 });
  }

  // 2. Fetch all relevant operational rows in one round-trip each.
  const [payments, payouts, refunds, ledger, txRows] = await Promise.all([
    admin.from("payments")
      .select("transaction_id, amount, status")
      .in("transaction_id", txIds)
      .eq("status", "succeeded"),
    admin.from("payouts")
      .select("transaction_id, amount, status")
      .in("transaction_id", txIds)
      .in("status", ["processing", "completed"]),
    admin.from("refunds")
      .select("transaction_id, refund_amount, status")
      .in("transaction_id", txIds)
      .in("status", ["processing", "completed"]),
    admin.from("escrow_ledger_entries")
      .select("transaction_id, entry_type, amount")
      .in("transaction_id", txIds),
    admin.from("transactions")
      .select("id, transaction_code, money_status")
      .in("id", txIds),
    // currency lives on transaction_pricing; fetched separately so a missing
    // pricing row doesn't blow up the join.
  ]);

  if (payments.error || payouts.error || refunds.error || ledger.error || txRows.error) {
    console.error("[reconcile-escrow] fetch error", {
      payments: payments.error, payouts: payouts.error, refunds: refunds.error,
      ledger: ledger.error, tx: txRows.error,
    });
    return await finish(500, { error: "fetch_failed" });
  }

  const sumBy = <T extends { transaction_id: string }>(
    rows: T[] | null,
    txId: string,
    amountKey: keyof T,
    where: (r: T) => boolean = () => true,
  ): number =>
    (rows ?? [])
      .filter((r) => r.transaction_id === txId && where(r))
      .reduce((acc, r) => acc + Number((r[amountKey] as unknown as number | string) || 0), 0);

  const ledgerBalance = (txId: string): number => {
    let credit = 0, debit = 0;
    for (const e of ledger.data ?? []) {
      if (e.transaction_id !== txId) continue;
      const amt = Number((e as { amount: number | string }).amount || 0);
      const t = (e as { entry_type: string }).entry_type;
      if (CREDIT_ENTRY_TYPES.has(t)) credit += amt;
      else if (DEBIT_ENTRY_TYPES.has(t)) debit += amt;
    }
    return credit - debit;
  };

  const txMap = new Map<string, { transaction_code: string; money_status: string; currency_code: string }>();
  for (const t of txRows.data ?? []) {
    txMap.set(t.id as string, {
      transaction_code: t.transaction_code as string,
      money_status: t.money_status as string,
      currency_code: "NGN",
    });
  }

  // Hydrate currency from transaction_pricing where available.
  const { data: pricingCurrencies } = await admin
    .from("transaction_pricing")
    .select("transaction_id, currency_code")
    .in("transaction_id", txIds);
  for (const p of pricingCurrencies ?? []) {
    const m = txMap.get(p.transaction_id as string);
    if (m && (p as { currency_code?: string }).currency_code) {
      m.currency_code = (p as { currency_code: string }).currency_code;
    }
  }

  const rowsToInsert: Array<Record<string, unknown>> = [];
  const driftAlerts: Array<{ txId: string; code: string; delta: number; currency: string }> = [];

  for (const txId of txIds) {
    const meta = txMap.get(txId);
    if (!meta) continue;

    const collected = sumBy(payments.data as Array<{ transaction_id: string; amount: number | string }> | null, txId, "amount");
    const paid_out  = sumBy(payouts.data as Array<{ transaction_id: string; amount: number | string }> | null, txId, "amount");
    const refunded  = sumBy(refunds.data as Array<{ transaction_id: string; refund_amount: number | string }> | null, txId, "refund_amount");
    const ledger_bal = ledgerBalance(txId);
    const expected   = collected - paid_out - refunded;
    const delta      = Number((ledger_bal - expected).toFixed(2));

    let status: "ok" | "drift" | "missing_ledger" | "missing_pricing" = "ok";
    if (collected > 0 && (ledger.data ?? []).every((e) => e.transaction_id !== txId)) {
      status = "missing_ledger";
    } else if (Math.abs(delta) >= TOLERANCE) {
      status = "drift";
    }

    rowsToInsert.push({
      transaction_id: txId,
      run_id: runId,
      paystack_collected: collected,
      paystack_paid_out: paid_out,
      paystack_refunded: refunded,
      ledger_balance: ledger_bal,
      expected_ledger_balance: expected,
      delta,
      status,
      detail: {
        money_status: meta.money_status,
        currency: meta.currency_code,
        tolerance: TOLERANCE,
      },
    });

    if (status === "drift" || status === "missing_ledger") {
      driftAlerts.push({
        txId,
        code: meta.transaction_code,
        delta,
        currency: meta.currency_code,
      });
    }
  }

  // 3. Bulk upsert (idempotent per run_id).
  if (rowsToInsert.length) {
    await heartbeat();
    const { error: insErr } = await admin
      .from("escrow_reconciliation_results")
      .upsert(rowsToInsert, { onConflict: "transaction_id,run_id" });
    if (insErr) {
      console.error("[reconcile-escrow] insert failed", insErr);
      return await finish(500, { error: "insert_failed", detail: insErr.message });
    }
  }

  // 4. Raise-or-refresh one deduplicated ops alert per drifting transaction.
  //    Repeat runs update the existing active alert instead of inserting a new
  //    row; transactions whose drift cleared get their alert resolved.
  const activeAlertKeys: string[] = [];
  for (const a of driftAlerts) {
    await heartbeat();
    const severity = Math.abs(a.delta) >= 100 ? "high" : "medium";
    const dedupeKey = `escrow_drift:${a.txId}`;
    activeAlertKeys.push(dedupeKey);
    const { error: alertErr } = await admin.rpc("raise_system_alert", {
      _dedupe_key: dedupeKey,
      _type: "security_alert",
      _title: `Escrow drift detected (${formatMoney(a.delta, a.currency)})`,
      _message: `Reconciliation found a delta of ${formatMoney(a.delta, a.currency)} on ${a.code}.`,
      _related_transaction_id: a.txId,
      _metadata: { severity, run_id: runId, delta: a.delta, transaction_code: a.code },
    });
    if (alertErr) console.error("[reconcile-escrow] alert upsert failed", alertErr.message);
  }

  // Auto-resolve drift alerts for transactions examined in this run whose
  // condition has cleared. Scoped per transaction so alerts for transactions
  // outside this run's window are never touched.
  const activeKeySet = new Set(activeAlertKeys);
  let resolvedAlerts = 0;
  for (const txId of txIds) {
    const key = `escrow_drift:${txId}`;
    if (activeKeySet.has(key)) continue;
    const { data: n, error: resolveErr } = await admin.rpc("resolve_system_alerts", {
      _key_prefix: key,
      _active_keys: [],
    });
    if (resolveErr) console.error("[reconcile-escrow] alert resolve failed", resolveErr.message);
    else resolvedAlerts += Number(n ?? 0);
  }

  // 5. Log summary to system_logs (best-effort).
  try {
    await admin.from("system_logs").insert({
      level: "info",
      message: "reconcile-escrow run complete",
      metadata: {
        run_id: runId,
        considered: txIds.length,
        drift_count: driftAlerts.length,
      resolved_alerts: resolvedAlerts,
        lookback_hours: lookbackHours,
      },
    });
  } catch (e) {
    console.warn("[reconcile-escrow] system_logs insert skipped", e);
  }

  return await finish(200, {
    ok: true,
    run_id: runId,
    considered: txIds.length,
    drift_count: driftAlerts.length,
    resolved_alerts: resolvedAlerts,
  });
});