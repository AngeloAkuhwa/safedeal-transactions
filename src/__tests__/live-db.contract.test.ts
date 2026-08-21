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
    // Named checks that must exist: a harness that silently stops asserting
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
        // The line above is tautological in isolation (same argument seeds the
        // snapshot and the assertion). These two are not: the snapshot is
        // pinned to a currency the caller did not pass.
        "refund_currency_ignores_caller_argument",
        "ledger_currency_follows_snapshot",
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
    // numeric-only filter: the gap is vacuous now and latent later.
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
// ONE list, used by every scan in this file (grants, forced RLS, policy value
// checks, and the SECURITY DEFINER regex). Two lists of different widths is
// how `financial_idempotency_conflicts` sat outside the grant scan while the
// definer scan covered it.
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
  // Added after the grant-inversion test was found to skip these BY
  // CONSTRUCTION: they carried anon INSERT/UPDATE/DELETE with
  // relforcerowsecurity = false because they were absent from this list.
  // A scan is only as wide as its subject list.
  "transactions",
  "transaction_items",
  "transaction_delivery_terms",
  "checkout_session_items",
  // ---- Merged in from the (previously wider) definer regex. Security-relevant
  // contents, not amounts: settings, audit trail, roles, staff and identity. ----
  "financial_idempotency_conflicts",
  "admin_rate_limits",
  "system_settings",
  "system_settings_history",
  "internal_users",
  "internal_user_roles",
  "user_roles",
  "permissions",
  "role_permissions",
  "user_permission_overrides",
  "audit_logs",
  "admin_actions",
  "vendor_plans",
  "profiles",
];

const MONEY_TABLE_SQL_ARRAY = `array[${MONEY_TABLE_LIST.map((t) => `'${t}'`).join(",")}]`;

// table.privilege pairs kept ON PURPOSE, each backed by a real RLS policy for
// `authenticated`. anon appears nowhere.
const CLIENT_MONEY_DML_ALLOWLIST = [
  // Seller writes the pricing snapshot pre-lock (sellers_{insert,update}_txn_pricing).
  "authenticated:transaction_pricing:INSERT",
  "authenticated:transaction_pricing:UPDATE",
  // payout_accounts intentionally absent: the table-level INSERT/UPDATE were
  // replaced by COLUMN-level grants on the bank-detail columns only, so no
  // table-level entry may reappear here.
  // Buyer opens and advances their own cart checkout session.
  "authenticated:checkout_sessions:INSERT",
  "authenticated:checkout_sessions:UPDATE",
  // Staff triage of the release queue (policies require has_role admin).
  "authenticated:release_review_queue:INSERT",
  "authenticated:release_review_queue:UPDATE",
  // Seller opens a transaction and its items/terms pre-lock; every one of
  // these is backed by a sellers_* policy. No UPDATE on transactions: the
  // state machine moves them through SECURITY DEFINER functions only.
  "authenticated:transactions:INSERT",
  "authenticated:transaction_items:INSERT",
  "authenticated:transaction_items:UPDATE",
  "authenticated:transaction_delivery_terms:INSERT",
  "authenticated:transaction_delivery_terms:UPDATE",
  // Buyer writes their own checkout line items (buyers_insert_own_checkout_items).
  "authenticated:checkout_session_items:INSERT",
  // ---- Policy-backed staff/self writes on the merged security tables. ----
  "authenticated:admin_actions:INSERT", // admins_insert_admin_actions
  "authenticated:user_roles:INSERT", // users_insert_own_non_admin_role
  "authenticated:profiles:UPDATE", // users_update_own_profile (self-scoped)
  "authenticated:system_settings:INSERT", // admins_insert_system_settings
  "authenticated:system_settings:UPDATE", // admins_update_system_settings
  "authenticated:internal_users:INSERT", // staff manage internal_users
  "authenticated:internal_users:UPDATE",
  "authenticated:internal_users:DELETE",
  "authenticated:internal_user_roles:INSERT", // staff manage user_roles
  "authenticated:internal_user_roles:UPDATE",
  "authenticated:internal_user_roles:DELETE",
  "authenticated:permissions:INSERT", // super admin manage permissions
  "authenticated:permissions:UPDATE",
  "authenticated:permissions:DELETE",
  "authenticated:role_permissions:INSERT", // super_admin manage role_permissions
  "authenticated:role_permissions:UPDATE",
  "authenticated:role_permissions:DELETE",
  "authenticated:user_permission_overrides:INSERT", // super_admin manage overrides
  "authenticated:user_permission_overrides:UPDATE",
  "authenticated:user_permission_overrides:DELETE",
  "authenticated:vendor_plans:INSERT", // Internal admins manage plan catalogue
  "authenticated:vendor_plans:UPDATE",
  "authenticated:vendor_plans:DELETE",
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

  /**
   * TRUNCATE is NOT subject to row level security. Neither relrowsecurity nor
   * relforcerowsecurity mitigates it. So it is scanned across EVERY public
   * table, not just the list above.
   */
  it("leaves TRUNCATE on no public table for any client role", () => {
    const found = psql(
      "select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace" +
        " where n.nspname = 'public' and c.relkind in ('r','p')" +
        " and (has_table_privilege('anon', c.oid, 'TRUNCATE')" +
        " or has_table_privilege('authenticated', c.oid, 'TRUNCATE')) order by 1",
    );
    expect(found ? found.split("\n") : []).toEqual([]);
  });
});

/**
 * ACL-GENERATOR class. Every scan above reads the ACLs that exist NOW.
 * `pg_default_acl` decides the ACLs of objects that do not exist yet: with
 * `postgres` granting anon/authenticated `arwdDxtm` (D = TRUNCATE) on tables,
 * `rwU` on sequences and `X` on functions, the next `CREATE TABLE` in any
 * migration regenerated the entire hole. A snapshot of a self-resetting value
 * is not a control. Nothing had ever read this catalog.
 */
d("live default privileges", () => {
  /**
   * EXPLICIT BASELINE, not a grantor allowlist. A previous version filtered
   * out every row whose grantor was `supabase_admin`, which erased all 24 live
   * rows: including `supabase_admin:r:anon:TRUNCATE` and
   * `supabase_admin:f:anon:EXECUTE`. A green tick then carried zero
   * information. These rows are KNOWN, UNFIXED and PLATFORM-OWNED: our
   * migration role is not a member of supabase_admin and cannot ALTER them.
   * They bind only to objects CREATED BY supabase_admin; SafeDeal migrations
   * run as `postgres`, whose default ACLs are now empty for client roles.
   * Listing them verbatim keeps them visible and fails on ANY change. A new
   * row, a removed row, or a postgres-granted row appearing.
   */
  const DEFAULT_ACL_BASELINE = [
    "supabase_admin:S:anon:SELECT",
    "supabase_admin:S:anon:UPDATE",
    "supabase_admin:S:anon:USAGE",
    "supabase_admin:S:authenticated:SELECT",
    "supabase_admin:S:authenticated:UPDATE",
    "supabase_admin:S:authenticated:USAGE",
    "supabase_admin:f:anon:EXECUTE",
    "supabase_admin:f:authenticated:EXECUTE",
    "supabase_admin:r:anon:DELETE",
    "supabase_admin:r:anon:INSERT",
    "supabase_admin:r:anon:MAINTAIN",
    "supabase_admin:r:anon:REFERENCES",
    "supabase_admin:r:anon:SELECT",
    "supabase_admin:r:anon:TRIGGER",
    "supabase_admin:r:anon:TRUNCATE",
    "supabase_admin:r:anon:UPDATE",
    "supabase_admin:r:authenticated:DELETE",
    "supabase_admin:r:authenticated:INSERT",
    "supabase_admin:r:authenticated:MAINTAIN",
    "supabase_admin:r:authenticated:REFERENCES",
    "supabase_admin:r:authenticated:SELECT",
    "supabase_admin:r:authenticated:TRIGGER",
    "supabase_admin:r:authenticated:TRUNCATE",
    "supabase_admin:r:authenticated:UPDATE",
  ].sort();

  it("matches the recorded default-privilege baseline exactly", () => {
    const found = psql(
      "select d.defaclrole::regrole::text || ':' || d.defaclobjtype::text || ':' ||" +
        " a.grantee::regrole::text || ':' || a.privilege_type" +
        " from pg_default_acl d, aclexplode(d.defaclacl) a" +
        " where d.defaclnamespace::regnamespace::text = 'public'" +
        " and a.grantee::regrole::text in ('anon','authenticated','public') order by 1",
    );
    const list = (found ? found.split("\n") : []).sort();
    expect(list).toEqual(DEFAULT_ACL_BASELINE);
  });

  it("grants client roles nothing by default from the postgres migration role", () => {
    // The half we DO control, asserted separately so it cannot be masked by
    // the platform baseline above.
    const found = psql(
      "select d.defaclobjtype::text || ':' || a.grantee::regrole::text || ':' || a.privilege_type" +
        " from pg_default_acl d, aclexplode(d.defaclacl) a" +
        " where d.defaclnamespace::regnamespace::text = 'public'" +
        " and d.defaclrole::regrole::text = 'postgres'" +
        " and a.grantee::regrole::text in ('anon','authenticated','public') order by 1",
    );
    expect(found ? found.split("\n") : []).toEqual([]);
  });

  it("leaves anon no write privilege on any relation in public", () => {
    // Schema-wide, not the security list: no table anywhere has a policy
    // granting anon INSERT/UPDATE/DELETE, so any such grant is residue.
    const found = psql(
      "select c.relname || ':' || a.privilege_type" +
        " from pg_class c join pg_namespace n on n.oid = c.relnamespace," +
        " aclexplode(c.relacl) a" +
        " where n.nspname = 'public' and c.relkind in ('r','p','v','m','f')" +
        " and a.grantee::regrole::text = 'anon'" +
        " and a.privilege_type <> 'SELECT' order by 1",
    );
    expect(found ? found.split("\n") : []).toEqual([]);
  });

  it("leaves no MAINTAIN, REFERENCES or TRIGGER residue on any relation", () => {
    // TRIGGER is the sharp one: it lets the grantee attach a trigger function
    // to a table it does not own.
    const found = psql(
      "select a.grantee::regrole::text || ':' || c.relname || ':' || a.privilege_type" +
        " from pg_class c join pg_namespace n on n.oid = c.relnamespace," +
        " aclexplode(c.relacl) a" +
        " where n.nspname = 'public'" +
        " and a.grantee::regrole::text in ('anon','authenticated')" +
        " and a.privilege_type in ('MAINTAIN','REFERENCES','TRIGGER') order by 1",
    );
    expect(found ? found.split("\n") : []).toEqual([]);
  });

  it("lets no client role setval a sequence", () => {
    // transaction_code_seq backs a UNIQUE column: setval() there is a durable
    // collision DoS on transaction creation. relkind 'S' was scanned by nothing.
    const found = psql(
      "select c.relname || ':' || a.grantee::regrole::text" +
        " from pg_class c join pg_namespace n on n.oid = c.relnamespace," +
        " aclexplode(c.relacl) a" +
        " where n.nspname = 'public' and c.relkind = 'S'" +
        " and a.grantee::regrole::text in ('anon','authenticated')" +
        " and a.privilege_type = 'UPDATE' order by 1",
    );
    expect(found ? found.split("\n") : []).toEqual([]);
  });

  it("matches the recorded pg_net grant baseline exactly", () => {
    // KNOWN, UNFIXED, PLATFORM-OWNED. net.http_* is latent SSRF: the grant is
    // to PUBLIC ('-'), so anon inherits it, and both the schema and the
    // functions are owned by supabase_admin and are not revocable by our
    // migration role. Recorded as an explicit row list rather than skipped, so
    // the hole stays visible and any change to it fails the suite. The only
    // barrier is that `net` is not an exposed PostgREST schema.
    const NET_GRANT_BASELINE = [
      "http_collect_response:-:EXECUTE",
      "http_delete:-:EXECUTE",
      "http_get:-:EXECUTE",
      "http_post:-:EXECUTE",
    ];
    const found = psql(
      "select p.proname || ':' || a.grantee::regrole::text || ':' || a.privilege_type" +
        " from pg_proc p join pg_namespace n on n.oid = p.pronamespace," +
        " aclexplode(p.proacl) a where n.nspname = 'net'" +
        " and a.grantee::regrole::text in ('anon','authenticated','public','-') order by 1",
    );
    expect(found ? found.split("\n") : []).toEqual(NET_GRANT_BASELINE);
  });

  it("exposes no public wrapper around a net.http_* call", () => {
    // The half we DO control: no function in the exposed `public` schema may
    // wrap net.http_* and hand anon a reachable door to it.
    const wrappers = psql(
      "select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace" +
        " where n.nspname = 'public' and pg_get_functiondef(p.oid) ~ 'net\\.http_'" +
        " and has_function_privilege('anon', p.oid, 'EXECUTE') order by 1",
    );
    expect(wrappers ? wrappers.split("\n") : []).toEqual([]);
  });

  it("forces RLS on every table in the realtime publication", () => {
    // supabase_realtime streams complete OLD rows for tables with
    // REPLICA IDENTITY FULL. The decision to keep FULL rests on RLS being
    // enforced for every publisher: which was true for payments, payouts,
    // transactions and money_status_history but NOT for disputes,
    // notifications, notification_deliveries and transaction_events.
    const found = psql(
      "select c.relname from pg_publication_rel pr" +
        " join pg_class c on c.oid = pr.prrelid" +
        " join pg_publication p on p.oid = pr.prpubid" +
        " where p.pubname = 'supabase_realtime'" +
        " and not (c.relrowsecurity and c.relforcerowsecurity) order by 1",
    );
    expect(found ? found.split("\n") : []).toEqual([]);
  });
});

/**
 * VIEW class. Nothing in this suite read pg_class for relkind 'v'/'m' until a
 * single-table, auto-updatable view (`public_seller_profiles`) with
 * `security_invoker = off`, owned by a rolbypassrls role and granted full DML
 * to anon, turned out to be an unauthenticated write path into `profiles`.
 * Functions, then column defaults, now views: a catalog nobody reads is where
 * the next defect lives.
 */
d("live view surface", () => {
  // Individually justified exceptions. Empty by design. A definer view is a
  // deliberate RLS bypass and must be argued for in writing, here.
  const SECURITY_DEFINER_VIEW_BASELINE: string[] = [];

  it("runs every view with security_invoker = on", () => {
    const found = psql(
      "select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace" +
        " where n.nspname = 'public' and c.relkind = 'v'" +
        " and not coalesce(array_to_string(c.reloptions, ',') ~ 'security_invoker=(on|true)', false)" +
        " order by 1",
    );
    const list = found ? found.split("\n") : [];
    expect(list.filter((v) => !SECURITY_DEFINER_VIEW_BASELINE.includes(v))).toEqual([]);
  });

  it("gives client roles no DML on any view or materialized view", () => {
    const found = psql(
      "select a.grantee::regrole::text || ':' || c.relname || ':' || a.privilege_type" +
        " from pg_class c join pg_namespace n on n.oid = c.relnamespace," +
        " aclexplode(c.relacl) a" +
        " where n.nspname = 'public' and c.relkind in ('v','m')" +
        " and a.grantee::regrole::text in ('anon','authenticated')" +
        // ALL privilege types, not the four write verbs: MAINTAIN, REFERENCES
        // and TRIGGER were sitting on seven views as GRANT ALL residue and were
        // invisible to a filter that only listed INSERT/UPDATE/DELETE/TRUNCATE.
        " and a.privilege_type <> 'SELECT' order by 1",
    );
    expect(found ? found.split("\n") : []).toEqual([]);
  });

  it("keeps the public storefront projection structurally non-writable", () => {
    // Sourced from a SECURITY DEFINER set-returning function, so PostgreSQL
    // cannot make it auto-updatable even if a grant is restored by mistake.
    expect(
      psql("select pg_relation_is_updatable('public.public_seller_profiles'::regclass, false)"),
    ).toBe("0");
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

  it("ties checkout line items to their components", () => {
    const defs = psql(
      "select conname from pg_constraint" +
        " where conrelid = 'public.checkout_session_items'::regclass" +
        " and conname in ('checkout_items_quantity_positive'," +
        "'checkout_items_line_total_matches_components') order by 1",
    );
    expect(defs ? defs.split("\n") : []).toEqual([
      "checkout_items_line_total_matches_components",
      "checkout_items_quantity_positive",
    ]);
  });

  /**
   * Widened from three hardcoded table names to EVERY money table with a
   * client write policy. Scoping this scan by name is why an ownership-only
   * payout_accounts policy stayed invisible while its neighbours were fixed.
   *
   * A client write policy passes when the VALUES it admits are constrained —
   * either by the policy itself (`is_finite_money` in WITH CHECK) or by a
   * schema CHECK covering every numeric column of that table. A table with no
   * numeric column has no amount to invent and passes by construction.
   */
  it("value-checks every money-table client write policy, not just ownership", () => {
    const offenders = psql(
      "with unguarded_cols as (" +
        "  select c.relname as tbl" +
        "  from pg_class c join pg_namespace n on n.oid = c.relnamespace" +
        "  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped" +
        `  where n.nspname = 'public' and c.relname = any(${MONEY_TABLE_SQL_ARRAY})` +
        "    and format_type(a.atttypid, null) in ('numeric','double precision','real','money')" +
        "    and not exists (" +
        "      select 1 from pg_constraint k where k.conrelid = c.oid and k.contype = 'c'" +
        "        and pg_get_constraintdef(k.oid) ~ ('\\m' || a.attname || '\\M')" +
        "        and pg_get_constraintdef(k.oid) ~ 'Infinity')" +
        ")" +
        " select p.tablename || '.' || p.policyname from pg_policies p" +
        " where p.schemaname = 'public' and p.cmd in ('INSERT','UPDATE')" +
        ` and p.tablename = any(${MONEY_TABLE_SQL_ARRAY})` +
        " and p.tablename in (select tbl from unguarded_cols)" +
        " and coalesce(p.with_check,'') !~ 'is_finite_money' order by 1",
    );
    expect(offenders ? offenders.split("\n") : []).toEqual([]);
  });

  it("keeps payout verification fields off the client role", () => {
    // The seller decides WHERE money lands; they must not also decide that
    // the destination is verified.
    const writable = psql(
      "select a.attname from pg_attribute a, aclexplode(a.attacl) x" +
        " where a.attrelid = 'public.payout_accounts'::regclass" +
        " and x.grantee::regrole::text in ('anon','authenticated')" +
        " and x.privilege_type in ('INSERT','UPDATE')" +
        " and a.attname in ('verification_status','provider_recipient_code'," +
        "'provider_recipient_id','last_verified_at','provider_response') order by 1",
    );
    expect(writable ? writable.split("\n") : []).toEqual([]);

    const trig = psql(
      "select tgname from pg_trigger where tgrelid = 'public.payout_accounts'::regclass" +
        " and tgname = 'payout_accounts_pin_privileged_fields'",
    );
    expect(trig).toBe("payout_accounts_pin_privileged_fields");
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
// DERIVED from MONEY_TABLE_LIST: the single subject list. It is no longer
// possible for the grant scan and the definer scan to disagree on scope.
const MONEY_TABLES = MONEY_TABLE_LIST.join("|");

// Each entry is READ-ONLY over money tables and justified individually.
const CLIENT_REACHABLE_MONEY_DEFINERS: string[] = [
  // Read-only daily counts (transactions/disputes), staff dashboards only:
  // revoked from anon, and the page behind it is permission-gated.
  "admin_daily_activity_counts",
  // Read-only escrow aggregates; raises 'forbidden' unless the caller is a
  // signed-in admin, and revoked from anon.
  "admin_escrow_kpis",
  // Read-only membership predicate used inside RLS policies; must stay
  // executable by authenticated or every transaction policy fails closed.
  // anon is revoked: an unauthenticated caller has no policy to satisfy.
  "is_transaction_party",
  // ---- Surfaced by widening MONEY_TABLES beyond amount-bearing tables. ----
  // Read-only counter over flagged users; revoked from anon, page-gated.
  "admin_flagged_users_count",
  // Read-only counter of approvals awaiting a given actor; revoked from anon.
  "count_pending_approvals_for_actor",
  // Read-only role/access predicates evaluated INSIDE RLS policies. Revoking
  // authenticated fails every policy closed; they return booleans only.
  "has_role",
  "has_any_internal_role",
  "has_internal_role",
  "is_internal_admin",
  "internal_access_active",
  "internal_actor_rank",
  "internal_effective_access_level",
  "internal_effective_permissions",
  "internal_users_mfa_status",
  // Read-only settings resolvers. Public pricing and the storefront read fee
  // configuration before sign-in, so anon EXECUTE is deliberate.
  "get_effective_setting",
  "get_effective_settings",
  "get_pricing_settings_at",
  // Read-only plan/slot resolvers backing the public pricing page.
  "effective_vendor_plan_code",
  "vendor_photo_slot_limit",
  // ---- Surfaced by unifying the subject list (adds `profiles`). ----
  // Read-only trust-tier derivation over profiles/identity submissions.
  "compute_verification_level",
  // Read-only regional gate evaluated during onboarding and checkout.
  "is_user_region_allowed",
  // Read-only public projection behind `public_seller_profiles`: nine
  // non-sensitive columns, rows filtered to store_slug IS NOT NULL. Definer so
  // the storefront can render before sign-in WITHOUT opening a profiles SELECT
  // policy that would expose email and phone to every signed-in user.
  "storefront_seller_profiles",
];

// SECURITY DEFINER WRITERS a signed-in client may reach. Each must carry its
// own authorization check in the body. The grant is not the control.
const CLIENT_REACHABLE_DEFINER_WRITERS: string[] = [
  // super_admin check + self-approval guard in the body; revoked from anon.
  "apply_permission_change_set",
  // Writes only `internal_users.last_active_at WHERE id = auth.uid()`:
  // self-scoped by construction, revoked from anon.
  "touch_internal_user_last_active",
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
    expect(
      list.filter(
        (f) =>
          !CLIENT_REACHABLE_MONEY_DEFINERS.includes(f) &&
          !CLIENT_REACHABLE_DEFINER_WRITERS.includes(f),
      ),
    ).toEqual([]);
  });

  it("never lets a client role reach a SECURITY DEFINER money WRITER", () => {
    // Allowlist entries are read-only by contract. This proves it, so a
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
    const list = writers ? writers.split("\n") : [];
    expect(list.filter((f) => !CLIENT_REACHABLE_DEFINER_WRITERS.includes(f))).toEqual([]);
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
 * These are RATCHETS: the named baselines may shrink, never grow.
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

  // Zero is NOT carved out of the scan any more: "money coerced to zero by
  // column default" is the same class as any other invented default. Nor is
  // the column NAME a filter any more. `escrow_reconciliation_results
  // .ledger_balance DEFAULT 0` was invisible because it matches none of
  // (fee|rate|amount|price|cap). Every numeric-typed column in the schema is
  // scanned. Each remaining entry is a running accumulator that legitimately
  // starts empty and is only ever moved by a guarded write.
  const ZERO_DEFAULT_BASELINE = [
    "checkout_sessions.subtotal_amount = 0",
    "checkout_sessions.total_amount = 0",
    "checkout_sessions.total_protection_fee = 0",
    "escrow_states.frozen_amount = 0",
    "escrow_states.held_amount = 0",
    "escrow_states.refunded_amount = 0",
    "escrow_states.released_amount = 0",
  ];

  it("adds no fee rate, cap, or price literal to a column default", () => {
    // The proc scan reads pg_proc only, so `vendor_plans.escrow_fee_rate
    // DEFAULT 0.0200`: a fabricated 2%: was invisible to it.
    const found = psql(
      "select c.relname || '.' || a.attname || ' = ' || pg_get_expr(d.adbin, d.adrelid)" +
        " from pg_attrdef d join pg_class c on c.oid = d.adrelid" +
        " join pg_namespace n on n.oid = c.relnamespace" +
        " join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum" +
        " where n.nspname = 'public' and c.relkind = 'r'" +
        " and format_type(a.atttypid, null) in ('numeric','double precision','real','money')" +
        " and pg_get_expr(d.adbin, d.adrelid) !~ '^(NULL|false|true|now\\(\\))$'" +
        " order by 1",
    );
    const list = found ? found.split("\n") : [];
    expect(list.filter((f) => !ZERO_DEFAULT_BASELINE.includes(f))).toEqual([]);
  });
});
