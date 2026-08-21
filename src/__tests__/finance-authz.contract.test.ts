import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  FINANCE_ENDPOINT_PERMISSIONS,
  MONEY_MOVEMENT_PERMISSIONS,
  MONEY_MOVEMENT_ROLES,
  MONEY_MOVEMENT_FORBIDDEN_ROLES,
  financeGateAllows,
} from "@/services/finance-permissions";
import { evaluateMakerChecker, MAKER_CHECKER_ERROR } from "../../supabase/functions/_shared/maker-checker-rules";
import { getAllPermissionKeys } from "@/services/permission-catalog";
import { SETTINGS_CATALOG } from "@/lib/settings-catalog";

const fnSource = (name: string) =>
  readFileSync(resolve(process.cwd(), `supabase/functions/${name}/index.ts`), "utf8");

// Role → effective permissions, mirroring the DB seed for the finance keys.
const ROLE_PERMS: Record<string, string[]> = {
  super_admin: [...MONEY_MOVEMENT_PERMISSIONS],
  finance_operator: [...MONEY_MOVEMENT_PERMISSIONS, "payouts.view", "refunds.view"],
  finance_approver: [...MONEY_MOVEMENT_PERMISSIONS, "payouts.approve", "refunds.approve"],
  auditor: ["payouts.view", "payouts.export", "refunds.view", "refunds.export", "release_review.view"],
  support_agent: ["transactions.view", "disputes.view_assigned"],
  identity_officer: ["identity_verification.view", "identity_verification.approve"],
  dispute_agent: ["disputes.view_assigned", "disputes.add_internal_note"],
};

describe("money-movement endpoints: permission gate", () => {
  for (const [fn, perm] of Object.entries(FINANCE_ENDPOINT_PERMISSIONS)) {
    it(`${fn} calls requirePermission("${perm}") and no bare requireAdmin`, () => {
      const src = fnSource(fn);
      expect(src).toContain(`requirePermission(req, "${perm}")`);
      expect(src).not.toMatch(/requireAdmin\(req\)/);
    });
  }

  it("every finance key exists in the permission catalog", () => {
    const keys = getAllPermissionKeys();
    for (const key of MONEY_MOVEMENT_PERMISSIONS) expect(keys).toContain(key);
  });

  describe.each(Object.keys(FINANCE_ENDPOINT_PERMISSIONS))("%s authorisation", (fn) => {
    const required = FINANCE_ENDPOINT_PERMISSIONS[fn];

    it("rejects an auditor (403: permission_denied)", () => {
      expect(
        financeGateAllows({ effectivePermissions: ROLE_PERMS.auditor, required }),
      ).toBe(false);
    });

    it("rejects support_agent, identity_officer and dispute_agent", () => {
      for (const role of ["support_agent", "identity_officer", "dispute_agent"]) {
        expect(financeGateAllows({ effectivePermissions: ROLE_PERMS[role], required })).toBe(false);
      }
    });

    it("allows finance_operator", () => {
      expect(
        financeGateAllows({ effectivePermissions: ROLE_PERMS.finance_operator, required }),
      ).toBe(true);
    });

    it("allows super_admin and the legacy consumer admin short-circuit", () => {
      expect(financeGateAllows({ isSuperAdmin: true, effectivePermissions: [], required })).toBe(true);
      expect(financeGateAllows({ isConsumerAdmin: true, effectivePermissions: [], required })).toBe(true);
    });
  });

  it("forbidden roles never appear in the allowed-role list", () => {
    for (const role of MONEY_MOVEMENT_FORBIDDEN_ROLES) {
      expect(MONEY_MOVEMENT_ROLES).not.toContain(role);
    }
  });
});

describe("maker-checker", () => {
  const MAKER = "11111111-1111-4111-8111-111111111111";
  const CHECKER = "22222222-2222-4222-8222-222222222222";

  it("is registered as a platform setting in both catalogs", () => {
    expect(SETTINGS_CATALOG.some((e) => e.key === "finance.maker_checker_enforced")).toBe(true);
    const denoCatalog = readFileSync(
      resolve(process.cwd(), "supabase/functions/_shared/settings-catalog.ts"),
      "utf8",
    );
    expect(denoCatalog).toContain("finance.maker_checker_enforced");
  });

  it("allows self-approval when enforcement is OFF (log only)", () => {
    const d = evaluateMakerChecker({ enforced: false, initiatorId: MAKER, approverId: MAKER });
    expect(d.allowed).toBe(true);
    expect(d.selfApproval).toBe(true);
  });

  it("rejects self-approval when enforcement is ON", () => {
    const d = evaluateMakerChecker({ enforced: true, initiatorId: MAKER, approverId: MAKER });
    expect(d.allowed).toBe(false);
    expect(d.error).toBe(MAKER_CHECKER_ERROR);
  });

  it("allows a different approver when enforcement is ON", () => {
    const d = evaluateMakerChecker({ enforced: true, initiatorId: MAKER, approverId: CHECKER });
    expect(d.allowed).toBe(true);
    expect(d.selfApproval).toBe(false);
  });

  it("allows when no initiator is recorded", () => {
    const d = evaluateMakerChecker({ enforced: true, initiatorId: null, approverId: CHECKER });
    expect(d.allowed).toBe(true);
  });

  it("release-payout and refund-transaction wire the gate before the money core", () => {
    for (const [fn, core] of [
      ["release-payout", "releasePayoutCore"],
      ["refund-transaction", "refundBuyerCore"],
    ] as const) {
      const src = fnSource(fn);
      expect(src).toContain("checkMakerChecker(");
      expect(src.indexOf("checkMakerChecker(")).toBeLessThan(src.indexOf(`await ${core}(`));
      expect(src).toContain("mc.error");
    }
  });
});
