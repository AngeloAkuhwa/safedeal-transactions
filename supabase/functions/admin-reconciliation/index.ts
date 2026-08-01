/**
 * Phase 6 — admin-only reconciliation + pricing-coverage read API.
 *
 * GET (default): returns latest-run drift rows + per-bucket pricing coverage
 * counts + the non-complete pricing audit list (capped at 200).
 */
import { requireAdmin, authErrorResponse , requirePermission} from "../_shared/auth.ts";
import {
  fetchReconciliationRows,
  fetchReconciliationSummary,
  EMPTY_SUMMARY,
  ISSUE_CATALOG,
  type ReconciliationRow,
} from "../_shared/reconciliation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET" && req.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  let ctx;
  try {
    ctx = await requirePermission(req, "financial_controls.view");
  } catch (err) {
    const r = authErrorResponse(err, corsHeaders);
    if (r) return r;
    console.error("[admin-reconciliation] auth error", err);
    return json(500, { error: "auth_failed" });
  }
  const admin = ctx.adminClient;

  // Latest run_id from results table.
  const { data: latest } = await admin
    .from("escrow_reconciliation_results")
    .select("run_id, run_at")
    .order("run_at", { ascending: false })
    .limit(1);

  const latestRun = latest?.[0] ?? null;

  const [driftRows, coverage, audit] = await Promise.all([
    latestRun
      ? admin
          .from("escrow_reconciliation_results")
          .select(
            "id, transaction_id, run_id, run_at, paystack_collected, paystack_paid_out, paystack_refunded, ledger_balance, expected_ledger_balance, delta, status, detail",
          )
          .eq("run_id", latestRun.run_id)
          .neq("status", "ok")
          .order("run_at", { ascending: false })
          .limit(500)
      : Promise.resolve({ data: [], error: null }),
    admin.from("v_pricing_snapshot_coverage").select("*"),
    admin
      .from("v_pricing_snapshot_audit")
      .select("transaction_id, transaction_code, money_status, created_at, pricing_model_version, snapshot_state")
      .neq("snapshot_state", "snapshot_complete")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  if (driftRows.error || coverage.error || audit.error) {
    console.error("[admin-reconciliation] fetch error", {
      drift: driftRows.error, coverage: coverage.error, audit: audit.error,
    });
    return json(500, { error: "fetch_failed" });
  }

  // Hydrate drift rows with transaction codes for display.
  const driftTxIds = Array.from(new Set(((driftRows.data ?? []) as Array<{ transaction_id: string }>).map((r) => r.transaction_id)));
  let codes: Record<string, { transaction_code: string; money_status: string }> = {};
  if (driftTxIds.length) {
    const { data: txs } = await admin
      .from("transactions")
      .select("id, transaction_code, money_status")
      .in("id", driftTxIds);
    for (const t of txs ?? []) {
      codes[t.id as string] = {
        transaction_code: t.transaction_code as string,
        money_status: t.money_status as string,
      };
    }
  }

  const drift = ((driftRows.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    ...r,
    transaction_code: codes[r.transaction_id as string]?.transaction_code ?? null,
    money_status_live: codes[r.transaction_id as string]?.money_status ?? null,
  }));

  // Canonical remediation report — the same routine the Dashboard and Escrow
  // page read, so every screen reports identical counts.
  let summary = { ...EMPTY_SUMMARY };
  let remediationRows: ReconciliationRow[] = [];
  try {
    [summary, remediationRows] = await Promise.all([
      fetchReconciliationSummary(admin, null),
      fetchReconciliationRows(admin, { onlyIssues: true }),
    ]);
  } catch (e) {
    console.error("[admin-reconciliation] remediation fetch failed", e);
  }

  return json(200, {
    latest_run: latestRun,
    drift,
    coverage: coverage.data ?? [],
    pricing_audit: audit.data ?? [],
    remediation: {
      summary,
      rows: remediationRows,
      issue_catalog: ISSUE_CATALOG,
    },
  });
});