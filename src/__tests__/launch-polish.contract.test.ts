import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { isBuiltAdminRoute } from "@/components/admin/useAdminNav";
import { resolveTransactionLabel } from "@/lib/status-labels";

const SIDEBAR = fs.readFileSync(
  path.resolve(__dirname, "../components/admin/AdminSidebar.tsx"),
  "utf8",
);

describe("admin sidebar has no dead-end destinations", () => {
  const hrefs = [...SIDEBAR.matchAll(/href:\s*"([^"]+)"/g)].map((m) => m[1]);

  it("finds sidebar items", () => {
    expect(hrefs.length).toBeGreaterThan(5);
  });

  it("every sidebar item points at a built route", () => {
    const dead = hrefs.filter((h) => !isBuiltAdminRoute(h));
    expect(dead).toEqual([]);
  });

  it("identity review is wired", () => {
    expect(hrefs).toContain("/admin/identity");
    expect(isBuiltAdminRoute("/admin/identity")).toBe(true);
  });
});

describe("escrow-holding transactions are not shown as Completed", () => {
  it("labels receipt-confirmed but unreleased funds as Awaiting Release", () => {
    const entry = resolveTransactionLabel("completed", "buyer", {
      moneyStatus: "funds_held_in_escrow",
    });
    expect(entry.label).not.toMatch(/completed/i);
    expect(entry.label).toBe("Awaiting Release");
  });

  it("still reads Completed once funds are released", () => {
    expect(
      resolveTransactionLabel("completed", "buyer", { moneyStatus: "funds_released" }).label,
    ).toBe("Completed");
  });

  it("falls back to the plain label when money status is unknown", () => {
    expect(resolveTransactionLabel("completed", "buyer").label).toBe("Completed");
  });
});
