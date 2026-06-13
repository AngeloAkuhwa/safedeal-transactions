/**
 * Phase 6 — hourly escrow reconciliation job.
 *
 * For every transaction touched in the last 24h, compares:
 *   paystack_collected (sum of succeeded payments.amount)
 *   paystack_paid_out  (sum of payouts.amount where status in processing/completed)
 *   paystack_refunded  (sum of refunds.amount where status in processing/completed)
 *   ledger_balance     (signed sum of escrow_ledger_entries by entry_type)
 * Writes one row per (transaction, run) into `escrow_reconciliation_results`.
 * Drift (|delta| >= 0.01) fans out a notifyOpsTeam alert.
 *
 * Triggered hourly by pg_cron (no auth required — the function is locked to
 * the service role and only writes its own table + sends ops notifications).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { notifyOpsTeam } from "../_shared/notify.ts";
import { formatMoney } from "../_shared/money-copy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const CREDIT_ENTRY_TYPES = new Set([
  "payment_credit",
]);
const DEBIT_ENTRY_TYPES = new Set([
  "payout_debit",
  "refund_debit",
]);
const TOLERANCE = 0.01;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* allow empty */ }
  const runId = (typeof body.run_id === "string" ? body.run_id : crypto.randomUUID());
  const lookbackHours = Number((body as { lookback_hours?: unknown }).lookback_hours) || 24;

  const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();

  // 1. Candidate transactions: anything updated in window + anything with an
  //    open drift from a prior run.
  const { data: recentTx, error: recentErr } = await admin
    .from("transactions")
    .select("id, transaction_code, money_status, updated_at")
    .gte("updated_at", since)
    .not("money_status", "in", "(not_secured,payment_pending)");
  if (recentErr) {
    console.error("[reconcile-escrow] tx fetch failed", recentErr);
    return json(500, { error: "tx_fetch_failed", detail: recentErr.message });
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
    return json(200, { ok: true, run_id: runId, considered: 0, drift_count: 0 });
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
      .select("transaction_id, amount, status")
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
    return json(500, { error: "fetch_failed" });
  }

  const sumBy = <T extends { transaction_id: string; amount: number | string }>(
    rows: T[] | null,
    txId: string,
    where: (r: T) => boolean = () => true,
  ): number =>
    (rows ?? [])
      .filter((r) => r.transaction_id === txId && where(r))
      .reduce((acc, r) => acc + Number(r.amount || 0), 0);

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

    const collected = sumBy(payments.data, txId);
    const paid_out  = sumBy(payouts.data, txId);
    const refunded  = sumBy(refunds.data, txId);
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
    const { error: insErr } = await admin
      .from("escrow_reconciliation_results")
      .upsert(rowsToInsert, { onConflict: "transaction_id,run_id" });
    if (insErr) {
      console.error("[reconcile-escrow] insert failed", insErr);
      return json(500, { error: "insert_failed", detail: insErr.message });
    }
  }

  // 4. Fan out ops alerts (best-effort, one per drift tx).
  for (const a of driftAlerts) {
    const severity = Math.abs(a.delta) >= 100 ? "high" : "medium";
    await notifyOpsTeam(admin, {
      type: "security_alert",
      title: `Escrow drift detected (${formatMoney(a.delta, a.currency)})`,
      message: `Reconciliation found a delta of ${formatMoney(a.delta, a.currency)} on ${a.code}.`,
      related_transaction_id: a.txId,
      metadata: { severity, run_id: runId, delta: a.delta },
    });
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
        lookback_hours: lookbackHours,
      },
    });
  } catch (e) {
    console.warn("[reconcile-escrow] system_logs insert skipped", e);
  }

  return json(200, {
    ok: true,
    run_id: runId,
    considered: txIds.length,
    drift_count: driftAlerts.length,
  });
});