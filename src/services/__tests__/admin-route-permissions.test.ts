import { describe, it, expect } from "vitest";
import { permissionForPath } from "@/services/admin-route-permissions";

describe("permissionForPath", () => {
  const cases: Array<[string, string]> = [
    ["/admin/dashboard", "dashboard.view"],
    ["/admin/transactions", "transactions.view"],
    ["/admin/transactions/abc123", "transactions.view"],
    ["/admin/transactions/export", "transactions.export"],
    ["/admin/transactions/abc123/update", "transactions.update"],
    ["/admin/disputes", "disputes.view"],
    ["/admin/disputes/export", "disputes.export"],
    ["/admin/disputes/xyz/resolve", "disputes.resolve_all"],
    ["/admin/disputes/xyz/escalate", "disputes.escalate"],
    ["/admin/flagged-users", "flagged_users.view"],
    ["/admin/flagged-users/export", "flagged_users.export"],
    ["/admin/flagged-users/u1/remove-flag", "flagged_users.remove_flag"],
    ["/admin/audit-logs", "audit_logs.view"],
    ["/admin/settings", "platform_configuration.configure"],
  ];

  for (const [path, perm] of cases) {
    it(`${path} → ${perm}`, () => {
      expect(permissionForPath(path)).toBe(perm);
    });
  }

  it("returns null for unknown routes", () => {
    expect(permissionForPath("/checkout")).toBeNull();
    expect(permissionForPath(null)).toBeNull();
  });

  it("normalises trailing slash", () => {
    expect(permissionForPath("/admin/dashboard/")).toBe("dashboard.view");
  });

  it("maps the support page to the support inbox permission", () => {
    expect(permissionForPath("/admin/support")).toBe("support.view");
  });

  it("ignores query strings and hashes on dashboard action hrefs", () => {
    expect(permissionForPath("/admin/users?status=pending&verification=id")).toBe(
      permissionForPath("/admin/users"),
    );
    expect(permissionForPath("/admin/payouts?tab=failed")).toBe(permissionForPath("/admin/payouts"));
    expect(permissionForPath("/admin/escrow?state=pending_release#top")).toBe(
      permissionForPath("/admin/escrow"),
    );
  });
});