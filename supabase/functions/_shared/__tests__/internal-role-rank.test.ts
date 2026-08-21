import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  checkRoleGrant,
  INTERNAL_ROLE_KEYS,
  rankOf,
} from "../internal-role-rank.ts";

const inviteSrc = readFileSync(
  resolve(process.cwd(), "supabase/functions/admin-invite-internal-user/index.ts"),
  "utf8",
);

describe("internal role rank order", () => {
  it("ranks super_admin above senior_admin above managers above agents", () => {
    expect(rankOf("super_admin")).toBeGreaterThan(rankOf("senior_admin"));
    expect(rankOf("senior_admin")).toBeGreaterThan(rankOf("dispute_manager"));
    expect(rankOf("dispute_manager")).toBe(rankOf("finance_approver"));
    expect(rankOf("compliance_officer")).toBeGreaterThan(rankOf("support_agent"));
    for (const r of ["dispute_agent", "finance_operator", "identity_officer", "support_agent", "auditor"]) {
      expect(rankOf(r)).toBe(40);
    }
  });

  it("covers exactly the ten internal roles", () => {
    expect(INTERNAL_ROLE_KEYS.sort()).toEqual([
      "auditor", "compliance_officer", "dispute_agent", "dispute_manager",
      "finance_approver", "finance_operator", "identity_officer",
      "senior_admin", "super_admin", "support_agent",
    ]);
  });
});

describe("checkRoleGrant: privilege escalation guard", () => {
  it("rejects a senior_admin granting super_admin", () => {
    const r = checkRoleGrant(["senior_admin"], ["super_admin"]);
    expect(r.ok).toBe(false);
    expect(r).toMatchObject({ status: 403, error: "insufficient_rank", blocked: ["super_admin"] });
  });

  it("rejects a senior_admin granting senior_admin", () => {
    expect(checkRoleGrant(["senior_admin"], ["senior_admin"])).toMatchObject({
      ok: false, status: 403, error: "insufficient_rank",
    });
  });

  it("allows a senior_admin granting support_agent", () => {
    expect(checkRoleGrant(["senior_admin"], ["support_agent"])).toMatchObject({ ok: true });
  });

  it("allows a senior_admin granting a manager-tier role", () => {
    expect(checkRoleGrant(["senior_admin"], ["dispute_manager", "compliance_officer"])).toMatchObject({ ok: true });
  });

  it("rejects an unknown role key with invalid_role", () => {
    expect(checkRoleGrant(["super_admin"], ["root"])).toMatchObject({
      ok: false, status: 400, error: "invalid_role", invalid: ["root"],
    });
  });

  it("lets a super_admin grant anything, including super_admin", () => {
    expect(checkRoleGrant(["super_admin"], ["super_admin"])).toMatchObject({ ok: true });
    expect(checkRoleGrant(["super_admin"], ["senior_admin", "auditor"])).toMatchObject({ ok: true });
  });

  it("blocks peer-level grants (a dispute_manager cannot mint a dispute_manager)", () => {
    expect(checkRoleGrant(["dispute_manager"], ["dispute_manager"])).toMatchObject({ ok: false, status: 403 });
    expect(checkRoleGrant(["dispute_manager"], ["dispute_agent"])).toMatchObject({ ok: true });
  });

  it("gives an actor with no internal role zero authority", () => {
    expect(checkRoleGrant([], ["auditor"])).toMatchObject({ ok: false, status: 403 });
  });

  it("blocks the whole invite when any single requested role is too high", () => {
    const r = checkRoleGrant(["senior_admin"], ["support_agent", "super_admin"]);
    expect(r).toMatchObject({ ok: false, blocked: ["super_admin"] });
  });
});

describe("admin-invite-internal-user wiring", () => {
  it("runs the rank guard before creating any role rows", () => {
    const guardIdx = inviteSrc.indexOf("assertCanGrantRoles(admin, ctx.userId, roles)");
    const insertIdx = inviteSrc.indexOf('.from("internal_user_roles").insert(roleRows)');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(guardIdx);
  });

  it("returns 400 invalid_role and 403 insufficient_rank", () => {
    expect(inviteSrc).toMatch(/json\(400, \{ error: "invalid_role"/);
    expect(inviteSrc).toMatch(/error: "insufficient_rank"/);
  });

  it("audits blocked escalation attempts", () => {
    expect(inviteSrc).toMatch(/result: "blocked_insufficient_rank"/);
  });
});
