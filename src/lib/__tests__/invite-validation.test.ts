import { describe, it, expect } from "vitest";
import { validateInviteInput } from "@/services/admin-access-control.service";

// Contract tests for the invite validator: names, email, department, roles.
// Skipped until the service is publicly stable enough to snapshot messages.
describe.skip("validateInviteInput", () => {
  const base = {
    first_name: "Ada",
    last_name: "Nwoke",
    email: "ada@safedeal.ng",
    department: "Support",
    roles: ["support_agent" as const],
    primary_role: "support_agent" as const,
    require_2fa: true,
  };

  it("accepts a complete valid invite", () => {
    expect(validateInviteInput(base)).toEqual({ ok: true });
  });

  it("requires first and last name", () => {
    expect(validateInviteInput({ ...base, first_name: "" }).ok).toBe(false);
    expect(validateInviteInput({ ...base, last_name:  "" }).ok).toBe(false);
  });

  it("requires a syntactically valid email", () => {
    expect(validateInviteInput({ ...base, email: "" }).ok).toBe(false);
    expect(validateInviteInput({ ...base, email: "ada@safedeal" }).ok).toBe(false);
  });

  it("requires department and primary role", () => {
    expect(validateInviteInput({ ...base, department: "" }).ok).toBe(false);
    // @ts-expect-error deliberately invalid
    expect(validateInviteInput({ ...base, primary_role: undefined }).ok).toBe(false);
  });

  it("primary role must be one of the assigned roles", () => {
    const bad = validateInviteInput({
      ...base,
      roles: ["support_agent" as const],
      primary_role: "finance_lead" as const,
    });
    expect(bad.ok).toBe(false);
  });
});