import { describe, it, expect } from "vitest";
import { AccessSafeguardError } from "@/services/admin-access-control.service";

/**
 * Unit-level contract that pins the shape of AccessSafeguardError so every
 * rule a–h surfaces a typed error the UI can render inline.
 *
 * End-to-end rule tests live in the integration suite (guarded by admin
 * credentials): these local assertions guarantee the error contract itself
 * doesn't drift when the safeguard helpers are refactored.
 */
describe("AccessSafeguardError contract: rules a–h", () => {
  const cases: Array<{
    rule: "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h";
    code: string;
    message: string;
  }> = [
    { rule: "a", code: "E_SELF_APPROVAL",         message: "requester cannot approve their own request" },
    { rule: "b", code: "E_MISSING_PERMISSION",    message: "cannot grant a permission you don't hold" },
    { rule: "c", code: "E_TARGET_OUTRANKS_YOU",   message: "target has equal or higher access" },
    { rule: "d", code: "E_LAST_SUPER_ADMIN",      message: "cannot remove the last active super admin" },
    { rule: "e", code: "E_SELF_ELEVATION",        message: "cannot elevate your own access" },
    { rule: "f", code: "W_OPEN_WORK_IMPACT",      message: "removal affects open work" },
    { rule: "g", code: "E_FINANCE_SELF_APPROVAL", message: "finance change cannot be approved by requester" },
    { rule: "h", code: "E_REASON_REQUIRED",       message: "reason is required" },
  ];

  it.each(cases)("rule %s carries typed rule, code and message", ({ rule, code, message }) => {
    const err = new AccessSafeguardError(rule, code, message);
    expect(err.name).toBe("AccessSafeguardError");
    expect(err.rule).toBe(rule);
    expect(err.code).toBe(code);
    expect(err.message).toBe(message);
    expect(err).toBeInstanceOf(Error);
  });
});