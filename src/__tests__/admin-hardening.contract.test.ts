import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const authShared = readFileSync("supabase/functions/_shared/auth.ts", "utf8");
const rateLimit = readFileSync("supabase/functions/_shared/rate-limit.ts", "utf8");
const repo = readFileSync("src/services/permission-repository.ts", "utf8");
const payouts = readFileSync("src/pages/AdminPayouts.tsx", "utf8");
const batchDialog = readFileSync(
  "src/components/admin/payouts/BatchReleaseConfirmDialog.tsx", "utf8",
);

// The migration SQL for apply_permission_change_set lives in supabase/migrations;
// resolve the newest definition by scanning all files for the function body.
import { readdirSync } from "node:fs";
function latestApplyRpcSql(): string {
  const dir = "supabase/migrations";
  const files = readdirSync(dir).sort();
  let last = "";
  for (const f of files) {
    const sql = readFileSync(`${dir}/${f}`, "utf8");
    // Must be the DEFINITION, not merely a mention: a later migration that
    // only REVOKEs EXECUTE on the function would otherwise be read as the
    // newest body and blank out every assertion below.
    if (/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.apply_permission_change_set/i.test(sql)) {
      last = sql;
    }
  }
  return last;
}

describe("PART 1: admin AAL2 gate fails CLOSED on settings-read error", () => {
  it("throws on a settings read error instead of swallowing it", () => {
    expect(authShared).toContain("SettingsReadError");
    expect(authShared).toMatch(/if \(readErr\) throw new SettingsReadError/);
  });

  it("returns 503 mfa_gate_unavailable when enforcement is believed ON", () => {
    expect(authShared).toContain("mfa_gate_unavailable");
    expect(authShared).toMatch(/lastKnownMfaEnforced && ctx\.aal !== "aal2"/);
  });

  it("keeps log-only behaviour while enforcement is OFF", () => {
    expect(authShared).toContain("mfa_gate_log_only");
  });

  it("caches the last observed enforcement value from a successful read", () => {
    expect(authShared).toMatch(/lastKnownMfaEnforced = enforced/);
  });
});

describe("PART 2: permission change set apply/approve", () => {
  const sql = latestApplyRpcSql();

  it("submit writes a status the RPC accepts", () => {
    const submitStatuses = ["pending_approval", "draft"];
    for (const s of submitStatuses) {
      expect(repo).toContain(`"${s}"`);
      expect(sql).toContain(`'${s}'`);
    }
    expect(sql).toMatch(/status NOT IN \('pending', 'pending_approval', 'draft', 'requested_changes'\)/);
  });

  it("no longer hard-requires the legacy 'pending' status", () => {
    expect(sql).not.toMatch(/cs\.status <> 'pending'/);
  });

  it("rejects self-approval inside the RPC", () => {
    expect(sql).toContain("self_approval_forbidden");
    expect(sql).toMatch(/cs\.requested_by = auth\.uid\(\)/);
  });
});

describe("PART 3: rate limiting and safe batch release", () => {
  it("rate limiter fails CLOSED with 503 on internal errors", () => {
    expect(rateLimit).toContain("rate_limit_unavailable");
    expect(rateLimit).not.toMatch(/rpc error", actionKey, error\);\s*\n\s*return null;/);
    const bodies = rateLimit.match(/return limiterUnavailable\(corsHeaders\);/g) ?? [];
    expect(bodies.length).toBeGreaterThanOrEqual(2);
  });

  it("still denies with 429 when the hourly cap is hit", () => {
    expect(rateLimit).toContain('error: "rate_limited"');
    expect(rateLimit).toContain("status: 429");
  });

  for (const fn of [
    "release-payout",
    "refund-transaction",
    "retry-payout",
    "admin-invite-internal-user",
  ]) {
    it(`${fn} enforces the admin rate limit`, () => {
      const src = readFileSync(`supabase/functions/${fn}/index.ts`, "utf8");
      expect(src).toContain("enforceAdminRateLimit");
      expect(src).toMatch(/const rl = await enforceAdminRateLimit\(/);
      expect(src).toMatch(/if \(rl\) return rl;/);
    });
  }

  it("batch release no longer uses window.confirm and never auto-selects", () => {
    expect(payouts).not.toContain("window.confirm");
    expect(payouts).not.toContain("Auto-select all eligible");
    expect(payouts).toContain("BatchReleaseConfirmDialog");
    expect(payouts).toContain("Select payouts first");
  });

  it("batch dialog requires a typed phrase plus a reason and forwards the reason", () => {
    expect(batchDialog).toContain("BATCH_RELEASE_CONFIRM_PHRASE");
    expect(batchDialog).toMatch(/phrase\.trim\(\)\.toUpperCase\(\) === BATCH_RELEASE_CONFIRM_PHRASE/);
    expect(batchDialog).toMatch(/reason\.trim\(\)\.length >= 5/);
    expect(payouts).toMatch(/notes: reason/);
  });
});
