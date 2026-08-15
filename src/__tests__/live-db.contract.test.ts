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
        // A session variable alone must not lift the pricing lock.
        "pricing_override_requires_super_admin",
        // Class-level structural rules.
        "all_escrow_writes_guarded",
        "ledger_write_guarded_single_overload",
        "ensure_platform_fee_reversal_single_overload",
        "no_positional_money_binding",
        // Non-finite money: +Infinity passed every previous guard.
        "infinite_refund_refused",
        "refunds_check_constraint_rejects_nonfinite",
        "payouts_check_constraint_rejects_nonfinite",
        "payments_check_constraint_rejects_nonfinite",
        "ledger_check_constraint_rejects_nan",
        "ledger_write_refuses_infinity",
        "reverse_payout_ceiling_enforced",
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

  it("keeps every numeric-argument SECURITY DEFINER function finiteness-guarded", () => {
    const unguarded = psql(
      "select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace" +
        " where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef" +
        " and 'numeric'::regtype::oid = any(p.proargtypes::oid[])" +
        " and pg_get_functiondef(p.oid) !~ 'is_finite_money\\('" +
        " order by 1",
    );
    expect(unguarded ? unguarded.split("\n") : []).toEqual([]);
  });

  it("tests finiteness rather than NaN alone on every amount-taking money function", () => {
    // `numeric` supports Infinity: `x = 'NaN'` and `x <= 0` and `x = round(x,2)`
    // all pass for +Infinity, so a NaN-only guard is not a finiteness guard.
    const nanOnly = psql(
      "select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace" +
        " where n.nspname = 'public' and p.prokind = 'f'" +
        // The self-test inserts a literal NaN on purpose to prove the column
        // constraint rejects it.
        " and p.proname not in ('is_finite_money', 'selftest_refund_rail')" +
        " and pg_get_functiondef(p.oid) ~ '''NaN''::numeric'" +
        " and pg_get_functiondef(p.oid) !~ 'is_finite_money'" +
        " order by 1",
    );
    expect(nanOnly ? nanOnly.split("\n") : []).toEqual([]);
  });

  it("keeps every public money-typed column guarded against non-finite values", () => {
    // numeric today, but float8/float4/money would be invisible to a
    // numeric-only filter — the gap is vacuous now and latent later.
    const unguarded = psql(
      "select c.relname || '.' || a.attname from pg_class c" +
        " join pg_namespace n on n.oid = c.relnamespace" +
        " join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped" +
        " where n.nspname = 'public' and c.relkind = 'r'" +
        " and a.atttypid in ('numeric'::regtype,'float8'::regtype,'float4'::regtype,'money'::regtype)" +
        " and not exists (select 1 from pg_constraint k where k.conrelid = c.oid" +
        " and k.contype = 'c' and a.attnum = any(k.conkey)" +
        " and pg_get_constraintdef(k.oid) like '%Infinity%') order by 1",
    );
    expect(unguarded ? unguarded.split("\n") : []).toEqual([]);
  });

  it("binds every SECURITY DEFINER money helper by name, whatever its arity", () => {
    const positional = psql(
      "with callees as (select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace" +
        // No arity filter: the single-argument escrow balance helpers are
        // exactly the ones a `pronargs > 1` filter silently excluded.
        " where n.nspname='public' and p.prokind='f' and p.prosecdef" +
        " and (pg_get_functiondef(p.oid) ~" +
        " '\\m(escrow_ledger_entries|escrow_states|payouts|refunds|payments|transaction_pricing|dispute_outcomes|financial_remediations)\\M'" +
        " or p.proname in ('escrow_available_balance','escrow_uncommitted_available'," +
        "'escrow_open_commitments','escrow_canonical_balance'))), callers as" +
        " (select p.proname caller,pg_get_functiondef(p.oid) src from pg_proc p" +
        " join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f')" +
        " select distinct caller || '->' || callees.proname from callers,callees" +
        " where caller <> callees.proname" +
        " and regexp_count(src,'\\m' || callees.proname || '\\(\\s*[^)[:space:]]')" +
        " > regexp_count(src,'\\m' || callees.proname || '\\(\\s*\\w+\\s*:=') order by 1",
    );
    expect(positional ? positional.split("\n") : []).toEqual([]);
  });

  it("validates complete_refund_atomic's amount before its first write", () => {
    // Position, not presence: a check that sits below the UPDATEs is only
    // fail-closed by accident of transactional rollback.
    const def = psql(
      "select pg_get_functiondef(oid) from pg_proc where proname = 'complete_refund_atomic'" +
        " and pronamespace = 'public'::regnamespace",
    );
    const guard = def.indexOf("invalid_refund_amount");
    const firstWrite = Math.min(
      ...["UPDATE public.refunds", "UPDATE public.transactions", "UPDATE public.escrow_states"]
        .map((w) => def.indexOf(w))
        .filter((i) => i >= 0),
    );
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(firstWrite);
  });

  it("bounds a payout reversal by the payout it reverses", () => {
    const def = psql(
      "select pg_get_functiondef(oid) from pg_proc where proname = 'reverse_payout_atomic'" +
        " and pronamespace = 'public'::regnamespace",
    );
    expect(def).toContain("reversal_exceeds_payout_amount");
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

  it("keeps exactly one pricing-lock trigger on transaction_pricing", () => {
    // Two BEFORE-row lock triggers fire alphabetically, so the unconditional
    // one raised before the override-aware one could ever run and
    // admin_correct_pricing could not correct a locked agreement.
    const triggers = psql(
      "select p.proname from pg_trigger t join pg_proc p on p.oid = t.tgfoid" +
        " where t.tgrelid = 'public.transaction_pricing'::regclass and not t.tgisinternal" +
        " and pg_get_functiondef(p.oid) ~* 'locked|lock' order by 1",
    );
    expect(triggers ? triggers.split("\n") : []).toEqual(["prevent_pricing_update_after_lock"]);
  });

  it("verifies the elapsed payment window before timing a transaction out", () => {
    const def = psql(
      "select pg_get_functiondef(oid) from pg_proc where proname = 'timeout_transaction_atomic'" +
        " and pronamespace = 'public'::regnamespace",
    );
    expect(def).toContain("payment_window_not_configured");
    expect(def).toContain("window_not_elapsed");
  });

  it("floors the ledger running balance at zero", () => {
    const def = psql(
      "select pg_get_functiondef(oid) from pg_proc where proname = 'ledger_write_guarded'" +
        " and pronamespace = 'public'::regnamespace",
    );
    expect(def).toContain("ledger_balance_negative");
    const con = psql(
      "select pg_get_constraintdef(oid) from pg_constraint" +
        " where conname = 'escrow_ledger_balance_after_finite'",
    );
    expect(con).toContain("balance_after >= (0)::numeric");
  });
});

/**
 * Table-level DML class. RLS default-deny is one layer; the table grant is the
 * other. A client role holding INSERT/UPDATE/DELETE on a money table is a
 * finding even when no policy exists today, because the next policy someone
 * writes inherits that surface.
 */
const MONEY_TABLE_LIST = [
  "payments",
  "payouts",
  "refunds",
  "escrow_states",
  "escrow_ledger_entries",
  "dispute_outcomes",
  "money_status_history",
  "vendor_plan_purchases",
  "transaction_pricing",
  "financial_remediations",
  "escrow_reconciliation_results",
  "payout_accounts",
  "checkout_sessions",
  "release_review_queue",
];

const MONEY_TABLE_SQL_ARRAY = `array[${MONEY_TABLE_LIST.map((t) => `'${t}'`).join(",")}]`;

// table.privilege pairs kept ON PURPOSE, each backed by a real RLS policy for
// `authenticated`. anon appears nowhere.
const CLIENT_MONEY_DML_ALLOWLIST = [
  // Seller writes the pricing snapshot pre-lock (sellers_{insert,update}_txn_pricing).
  "authenticated:transaction_pricing:INSERT",
  "authenticated:transaction_pricing:UPDATE",
  // A user maintains their own payout destination.
  "authenticated:payout_accounts:INSERT",
  "authenticated:payout_accounts:UPDATE",
  // Buyer opens and advances their own cart checkout session.
  "authenticated:checkout_sessions:INSERT",
  "authenticated:checkout_sessions:UPDATE",
  // Staff triage of the release queue (policies require has_role admin).
  "authenticated:release_review_queue:INSERT",
  "authenticated:release_review_queue:UPDATE",
];

d("live money-table grants", () => {
  it("gives client roles no unjustified DML on a money table", () => {
    const found = psql(
      "select a.grantee::regrole::text || ':' || c.relname || ':' || a.privilege_type" +
        " from pg_class c join pg_namespace n on n.oid = c.relnamespace," +
        " aclexplode(c.relacl) a" +
        ` where n.nspname = 'public' and c.relname = any(${MONEY_TABLE_SQL_ARRAY})` +
        " and a.grantee::regrole::text in ('anon','authenticated')" +
        " and a.privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE') order by 1",
    );
    const list = found ? found.split("\n") : [];
    expect(list.filter((g) => !CLIENT_MONEY_DML_ALLOWLIST.includes(g))).toEqual([]);
  });

  it("forces row level security on every money table", () => {
    const missing = psql(
      "select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace" +
        ` where n.nspname = 'public' and c.relname = any(${MONEY_TABLE_SQL_ARRAY})` +
        " and not c.relforcerowsecurity order by 1",
    );
    expect(missing ? missing.split("\n") : []).toEqual([]);
  });
});

d("live value-consistency constraints", () => {
  it("ties transaction_pricing totals to their components", () => {
    const defs = psql(
      "select conname || ' ' || pg_get_constraintdef(oid) from pg_constraint" +
        " where conrelid = 'public.transaction_pricing'::regclass" +
        " and conname in ('transaction_pricing_total_matches_components'," +
        "'transaction_pricing_payout_bounded_by_item') order by 1",
    );
    expect(defs.split("\n").length).toBe(2);
  });

  it("bounds products.reserved_quantity by stock_quantity", () => {
    const def = psql(
      "select pg_get_constraintdef(oid) from pg_constraint" +
        " where conname = 'products_reserved_quantity_bounded'",
    );
    expect(def).toContain("reserved_quantity >= 0");
    expect(def).toContain("stock_quantity");
  });

  it("value-checks the money-writing client policies, not just ownership", () => {
    // Ownership-only WITH CHECK on a table with money columns is the shape
    // this phase kept finding; every one of these must reference the guard.
    const policies = psql(
      "select tablename || '.' || policyname from pg_policies" +
        " where schemaname = 'public' and cmd in ('INSERT','UPDATE')" +
        " and tablename in ('transaction_pricing','checkout_sessions','release_review_queue')" +
        " and coalesce(with_check,'') !~ 'is_finite_money' order by 1",
    );
    expect(policies ? policies.split("\n") : []).toEqual([]);
  });
});

d("live helper reachability", () => {
  it("keeps the seller-identity helper off anon and authenticated", () => {
    const reachable = psql(
      "select has_function_privilege('anon','public.derive_target_user_id(uuid,uuid)','execute')" +
        " or has_function_privilege('authenticated','public.derive_target_user_id(uuid,uuid)','execute')",
    );
    expect(reachable).toBe("f");
  });

  it("keeps the RLS party predicate on authenticated only", () => {
    expect(
      psql("select has_function_privilege('anon','public.is_transaction_party(uuid,uuid)','execute')"),
    ).toBe("f");
    expect(
      psql(
        "select has_function_privilege('authenticated','public.is_transaction_party(uuid,uuid)','execute')",
      ),
    ).toBe("t");
  });
});

/**
 * EXECUTE-grant class. Postgres grants EXECUTE to PUBLIC by default, so a
 * SECURITY DEFINER function is reachable by `anon` unless someone revoked it.
 * Inversion, like the column and guard scans: everything touching a money
 * table is a finding unless it appears in the commented allowlist below.
 */
const MONEY_TABLES =
  "escrow_ledger_entries|escrow_states|payouts|refunds|payments|transaction_pricing" +
  "|dispute_outcomes|financial_remediations|transactions|money_status_history" +
  "|vendor_plan_purchases";

// Each entry is READ-ONLY over money tables and justified individually.
const CLIENT_REACHABLE_MONEY_DEFINERS: string[] = [
  // Read-only daily counts (transactions/disputes), staff dashboards only:
  // revoked from anon, and the page behind it is permission-gated.
  "admin_daily_activity_counts",
  // Read-only escrow aggregates; raises 'forbidden' unless the caller is a
  // signed-in admin, and revoked from anon.
  "admin_escrow_kpis",
  // Read-only helper used by triggers/RLS to resolve a transaction's parties.
  "derive_target_user_id",
  // Read-only membership predicate used inside RLS policies; must stay
  // executable by authenticated or every transaction policy fails closed.
  "is_transaction_party",
];

d("live SECURITY DEFINER EXECUTE grants", () => {
  it("exposes no money-touching SECURITY DEFINER function to anon or authenticated", () => {
    const found = psql(
      "select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace" +
        " join pg_type t on t.oid = p.prorettype" +
        " where n.nspname = 'public' and p.prosecdef and t.typname <> 'trigger'" +
        " and (has_function_privilege('anon', p.oid, 'execute')" +
        " or has_function_privilege('authenticated', p.oid, 'execute'))" +
        ` and pg_get_functiondef(p.oid) ~* $re$\\m(${MONEY_TABLES})\\M$re$` +
        " order by 1",
    );
    const list = found ? found.split("\n") : [];
    expect(list.filter((f) => !CLIENT_REACHABLE_MONEY_DEFINERS.includes(f))).toEqual([]);
  });

  it("never lets a client role reach a SECURITY DEFINER money WRITER", () => {
    // Allowlist entries are read-only by contract — this proves it, so a
    // later body change cannot smuggle a write in under an existing entry.
    const writers = psql(
      "select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace" +
        " join pg_type t on t.oid = p.prorettype" +
        " where n.nspname = 'public' and p.prosecdef and t.typname <> 'trigger'" +
        " and (has_function_privilege('anon', p.oid, 'execute')" +
        " or has_function_privilege('authenticated', p.oid, 'execute'))" +
        " and pg_get_functiondef(p.oid) ~*" +
        ` $re$(insert\\s+into|update|delete\\s+from)\\s+(public\\.)?(${MONEY_TABLES})\\M$re$` +
        " order by 1",
    );
    expect(writers ? writers.split("\n") : []).toEqual([]);
  });

  it("keeps the refund self-test harness off the client roles", () => {
    const reachable = psql(
      "select has_function_privilege('anon','public.selftest_refund_rail(text)','execute')" +
        " or has_function_privilege('authenticated','public.selftest_refund_rail(text)','execute')",
    );
    expect(reachable).toBe("f");
  });

  it("keeps no SECURITY DEFINER admin function callable by anon", () => {
    const found = psql(
      "select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace" +
        " join pg_type t on t.oid = p.prorettype" +
        " where n.nspname = 'public' and p.prosecdef and t.typname <> 'trigger'" +
        " and p.proname like 'admin\\_%'" +
        " and has_function_privilege('anon', p.oid, 'execute') order by 1",
    );
    expect(found ? found.split("\n") : []).toEqual([]);
  });

  it("has no fail-open authorization guard (uid IS NOT NULL AND NOT ...)", () => {
    const found = psql(
      "select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace" +
        " where n.nspname = 'public' and p.prosecdef and pg_get_functiondef(p.oid) ~" +
        " $re$(v_uid|auth\\.uid\\(\\)) IS NOT NULL\\s+AND NOT public\\.$re$ order by 1",
    );
    expect(found ? found.split("\n") : []).toEqual([]);
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
  // Reads the cap from system_settings; the match is the setting KEY, not a
  // literal amount.
  "admin_correct_pricing",
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
  // Ratchet, not an equality assertion: entries may be removed, never added.
  const CURRENCY_DEFAULT_BASELINE: string[] = [];

  it("adds no literal currency default to a currency column", () => {
    const found = psql(
      "select c.relname || '.' || a.attname from pg_attrdef d" +
        " join pg_class c on c.oid=d.adrelid join pg_namespace n on n.oid=c.relnamespace" +
        " join pg_attribute a on a.attrelid=d.adrelid and a.attnum=d.adnum" +
        " where n.nspname='public' and a.attname ~ '(currency|currency_code)'" +
        " and pg_get_expr(d.adbin,d.adrelid) ~ '''[A-Z]{3}''' order by 1",
    );
    const list = found ? found.split("\n") : [];
    expect(list.filter((f) => !CURRENCY_DEFAULT_BASELINE.includes(f))).toEqual([]);
  });

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
    // 2500 is the RETIRED cap; it must never reappear anywhere.
    const found = scanProcs(
      String.raw`(0\.0?2|\m400(?:\.0+)?\M|\m2500\M|max_total_service_fee)`,
    );
    expect(found.filter((f) => !HARDCODED_FEE_BASELINE.includes(f))).toEqual([]);
  });

  it("adds no fee rate, cap, or price literal to a column default", () => {
    // The proc scan reads pg_proc only, so `vendor_plans.escrow_fee_rate
    // DEFAULT 0.0200` — a fabricated 2% — was invisible to it.
    const found = psql(
      "select c.relname || '.' || a.attname || ' = ' || pg_get_expr(d.adbin, d.adrelid)" +
        " from pg_attrdef d join pg_class c on c.oid = d.adrelid" +
        " join pg_namespace n on n.oid = c.relnamespace" +
        " join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum" +
        " where n.nspname = 'public' and a.attname ~ '(fee|rate|amount|price|cap)'" +
        " and pg_get_expr(d.adbin, d.adrelid) !~ '^(NULL|0|0\\.0+|false|true|now\\(\\))$'" +
        " order by 1",
    );
    expect(found ? found.split("\n") : []).toEqual([]);
  });
});
