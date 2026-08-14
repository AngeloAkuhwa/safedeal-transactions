import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";

/**
 * LIVE database contracts.
 *
 * Everything else in this suite reads source text. Source text could not see
 * the refund outage: `ensure_platform_fee_reversal` bound the wrong
 * `ledger_write_guarded` overload positionally, the reversal row failed the
 * `adjustment_requires_balance_after` trigger, and every buyer refund aborted.
 * Only executing the real RPCs against the real triggers catches that class.
 *
 * Skips (rather than fails) when the sandbox has no database credentials, so
 * the suite still runs offline.
 */
const HAS_DB = Boolean(process.env.PGHOST);
const d = HAS_DB ? describe : describe.skip;

function psql(sql: string): string {
  return execFileSync("psql", ["-At", "-c", sql], { encoding: "utf8" }).trim();
}

d("live refund rail", () => {
  it("executes capture -> platform fee reversal -> refund end to end", () => {
    const raw = psql("select public.selftest_refund_rail('NGN')");
    const result = JSON.parse(raw) as {
      ok: boolean;
      error?: string;
      skipped?: boolean;
      checks?: Array<{ check: string; pass: boolean; detail?: string }>;
    };
    if (result.skipped) return;
    const failed = (result.checks ?? []).filter((c) => !c.pass);
    expect({ error: result.error, failed }).toEqual({ error: undefined, failed: [] });
    expect(result.ok).toBe(true);
    // Named checks that must exist — a harness that silently stops asserting
    // is worse than no harness.
    const names = (result.checks ?? []).map((c) => c.check);
    expect(names).toEqual(
      expect.arrayContaining([
        "capture_ok",
        "escrow_held",
        "refund_created",
        "fee_reversal_written",
        "balance_after_set",
        "refund_is_idempotent",
        "capture_refuses_missing_escrow",
      ]),
    );
  });

  it("leaves no rows behind", () => {
    const counts = psql(
      "select (select count(*) from transactions where transaction_code like 'SELFTEST%')" +
        " + (select count(*) from refunds where reason = 'selftest')" +
        " + (select count(*) from payments where provider_reference like 'selftest%')",
    );
    expect(Number(counts)).toBe(0);
  });

  it("keeps ledger_write_guarded unambiguous (one overload only)", () => {
    const n = psql(
      "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace" +
        " where n.nspname = 'public' and p.proname = 'ledger_write_guarded'",
    );
    expect(Number(n)).toBe(1);
  });
});

/**
 * Live `pg_proc` scan. Authored migrations are only half the truth: a function
 * body can be replaced and the literal never appears in a file we scan.
 * These are RATCHETS — the named baselines may shrink, never grow.
 */
const NGN_LITERAL_BASELINE = [
  "admin_financial_reconciliation",
  "apply_financial_remediation_atomic",
  "complete_payout_atomic",
  "complete_refund_atomic",
  "create_orchestration_task",
  "freeze_funds_atomic",
  "ledger_write_guarded",
  "record_completion_release_intent_atomic",
  "resolve_dispute_atomic",
  "reverse_payout_atomic",
  "unfreeze_funds_atomic",
];

const HARDCODED_WINDOW_BASELINE = [
  "activate_vendor_purchase",
  "admin_escrow_kpis",
  "admin_escrow_ledger_daily_trend",
  "admin_escrow_records_page",
  "admin_flagged_users_summary",
  "admin_users_directory_page",
  "admin_users_directory_summary",
  "create_orchestration_task",
  "timeout_transaction_atomic",
];

function scanProcs(regex: string): string[] {
  // Dollar-quoted so the pattern reaches Postgres exactly as written.
  const out = psql(
    "select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace" +
      ` where n.nspname = 'public' and p.prokind = 'f' and pg_get_functiondef(p.oid) ~ $re$${regex}$re$` +
      " order by 1",
  );
  return out ? out.split("\n") : [];
}

d("live pg_proc invented-defaults scan", () => {
  it("adds no new currency literal to a database function", () => {
    const found = scanProcs("'NGN'");
    expect(found.filter((f) => !NGN_LITERAL_BASELINE.includes(f))).toEqual([]);
  });

  it("adds no new hardcoded time window to a database function", () => {
    const found = scanProcs(
      String.raw`(interval\s*'[0-9]+ (day|hour)|\m(24|48|72|168)\M\s*\*?\s*(hour|::|\)))`,
    );
    expect(found.filter((f) => !HARDCODED_WINDOW_BASELINE.includes(f))).toEqual([]);
  });
});
