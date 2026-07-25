import { describe, it, expect } from "vitest";
import { deriveAccessLevel, validateRoleSet } from "@/services/permission-catalog";

describe("deriveAccessLevel", () => {
  it("returns full for super_admin regardless of perms", () => {
    expect(deriveAccessLevel([], ["super_admin"])).toBe("full");
  });
  it("returns high when a high-signal permission is present", () => {
    expect(deriveAccessLevel(["financial_controls.approve"], [])).toBe("high");
    expect(deriveAccessLevel(["users_and_access.suspend"], [])).toBe("high");
  });
  it("returns standard when only operational actions exist", () => {
    expect(deriveAccessLevel(["disputes.assign", "disputes.view"], [])).toBe("standard");
  });
  it("returns limited for view/export-only perms", () => {
    expect(deriveAccessLevel(["dashboard.view", "reports.export"], [])).toBe("limited");
    expect(deriveAccessLevel([], [])).toBe("limited");
  });
});

describe("validateRoleSet", () => {
  it("rejects empty role sets", () => {
    expect(validateRoleSet([])).toEqual({ ok: false, error: expect.any(String) });
  });
  it("rejects super_admin combined with other roles", () => {
    const r = validateRoleSet(["super_admin", "auditor"]);
    expect(r.ok).toBe(false);
  });
  it("rejects finance_operator + finance_approver", () => {
    const r = validateRoleSet(["finance_operator", "finance_approver"]);
    expect(r.ok).toBe(false);
  });
  it("accepts multi-role combos otherwise", () => {
    expect(validateRoleSet(["dispute_manager", "support_agent"]).ok).toBe(true);
  });
});