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
// The gate is LOUD by default: a run without a database does not silently
// skip the only checks that execute real money code. Set ALLOW_SKIP_LIVE_DB=1
// to opt out explicitly (offline sandboxes), and say so in the report.
const ALLOW_SKIP = process.env.ALLOW_SKIP_LIVE_DB === "1";
const d = HAS_DB ? describe : describe.skip;

describe("live database gate", () => {
  it("has database credentials, or an explicit opt-out", () => {
    if (HAS_DB) return;
    expect(
      ALLOW_SKIP,
      "PGHOST is unset, so every live money check below is SKIPPED, not passing. " +
        "Set ALLOW_SKIP_LIVE_DB=1 to acknowledge an offline run.",
    ).toBe(true);
  });
});

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
        "escrow_hold_balance_after",
        "refund_created",
        "fee_reversal_written",
        "balance_after_set",
        "refund_is_idempotent",
        "refund_currency_from_snapshot",
        "capture_refuses_missing_escrow",
        "freeze_refuses_missing_escrow",
        "unfreeze_refuses_missing_escrow",
        "complete_payout_refuses_missing_escrow",
        "complete_refund_refuses_missing_escrow",
        "reverse_payout_refuses_missing_escrow",
        // Sign/magnitude: a negative refund inverted into an escrow credit.
        "negative_refund_refused",
        "refunds_check_constraint_rejects_negative",
        // Dispute rail, executed rather than asserted.
        "resolve_dispute_refund_buyer_executes",
        "dispute_refund_has_buyer",
        "dispute_unwinds_frozen_escrow",
        // Class-level structural rules.
        "all_escrow_writes_guarded",
        "ledger_write_guarded_single_overload",
        "ensure_platform_fee_reversal_single_overload",
        "no_positional_money_binding",
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

  it("keeps every money amount sign-guarded at the database boundary", () => {
    const unguarded = psql(
      "select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace" +
        " where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef" +
        " and p.proname in ('start_refund_atomic','complete_payout_atomic','complete_refund_atomic'," +
        "'reverse_payout_atomic','resolve_dispute_atomic','apply_financial_remediation_atomic'," +
        "'record_completion_release_intent_atomic','ledger_write_guarded')" +
        " and pg_get_functiondef(p.oid) !~ 'invalid_(money|refund|reversal|adjustment|commitment)_amount'" +
        " order by 1",
    );
    expect(unguarded ? unguarded.split("\n") : []).toEqual([]);
  });

  it("keeps refunds.refund_amount positive at the schema level", () => {
    const n = psql(
      "select count(*) from pg_constraint where conrelid = 'public.refunds'::regclass" +
        " and conname = 'refunds_refund_amount_positive'",
    );
    expect(Number(n)).toBe(1);
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

const HARDCODED_FEE_BASELINE = [
  "get_pricing_settings_at",
  "selftest_refund_rail",
  "track_pricing_setting_version",
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

  it("adds no new hardcoded fee rate, cap, or fee-setting key to a database function", () => {
    const found = scanProcs(String.raw`(0\.0?2|\m400(?:\.0+)?\M|max_total_service_fee)`);
    expect(found.filter((f) => !HARDCODED_FEE_BASELINE.includes(f))).toEqual([]);
  });
});
