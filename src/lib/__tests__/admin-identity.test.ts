import { describe, it, expect } from "vitest";
import { adminDisplayName, adminInitials, adminRoleLabel } from "../admin-identity";

describe("adminDisplayName", () => {
  it("prefers the full name", () => {
    expect(adminDisplayName("Ada Lovelace", "ada@safedeal.ng")).toBe("Ada Lovelace");
  });
  it("falls back to the email local part", () => {
    expect(adminDisplayName("  ", "ada.l@safedeal.ng")).toBe("ada.l");
  });
  it("falls back to Admin", () => {
    expect(adminDisplayName(null, null)).toBe("Admin");
  });
});

describe("adminInitials", () => {
  it("takes two initials from a full name", () => {
    expect(adminInitials("Ada Lovelace", null)).toBe("AL");
  });
  it("splits separators in an email local part", () => {
    expect(adminInitials(null, "ada.lovelace@safedeal.ng")).toBe("AL");
  });
  it("defaults to A", () => {
    expect(adminInitials(null, null)).toBe("AD");
  });
});

describe("adminRoleLabel", () => {
  it("super admin always wins", () => {
    expect(adminRoleLabel(["support_agent"], true)).toBe("Super Admin");
  });
  it("returns a label for a held role", () => {
    expect(adminRoleLabel(["support_agent"], false)).not.toBe("Team member");
  });
  it("falls back when no internal role is held", () => {
    expect(adminRoleLabel([], false)).toBe("Team member");
  });
});