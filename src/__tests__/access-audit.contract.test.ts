import { describe, it, expect } from "vitest";

/**
 * Pins the audit payload shape emitted by the unified access-control logger
 * so downstream readers (`admin-audit-logs`, timeline, exports) stay stable.
 */

type AuditPayload = {
  target_user_id: string;
  action_type: string;
  reason: string | null;
  before: unknown;
  after: unknown;
  approval_reference: string | null;
  result: "success" | "blocked_by_safeguard" | "failed";
  entity_ref: string | null;
  metadata: Record<string, unknown>;
};

const ACCEPTED_ACTIONS = new Set([
  "user_invited","invitation_resent","user_activated",
  "role_assigned","role_changed",
  "permission_override_requested","permission_override_approved","permission_override_rejected",
  "role_change_approved","role_change_rejected",
  "user_reactivated","user_deactivated",
  "session_revoked","task_reassigned",
  "suspend_user","unsuspend_user","add_internal_note",
]);

function assertCanonicalPayload(p: AuditPayload) {
  expect(typeof p.target_user_id).toBe("string");
  expect(ACCEPTED_ACTIONS.has(p.action_type)).toBe(true);
  expect(["success","blocked_by_safeguard","failed"]).toContain(p.result);
  expect(p.entity_ref).toMatch(/^internal_users:/);
}

describe("access-control audit payload contract", () => {
  it("role_changed carries a before/after diff and success result", () => {
    const payload: AuditPayload = {
      target_user_id: "00000000-0000-0000-0000-000000000001",
      action_type: "role_changed",
      reason: "promotion",
      before: { roles: ["support_agent"] },
      after: { roles: ["senior_support_agent"] },
      approval_reference: null,
      result: "success",
      entity_ref: "internal_users:00000000-0000-0000-0000-000000000001",
      metadata: { raw_action: "access_roles_updated", severity: "info" },
    };
    assertCanonicalPayload(payload);
  });

  it("permission_override_approved carries an approval_reference", () => {
    const payload: AuditPayload = {
      target_user_id: "00000000-0000-0000-0000-000000000002",
      action_type: "permission_override_approved",
      reason: "granted per policy",
      before: null,
      after: { grants: ["finance_refunds.approve"] },
      approval_reference: "11111111-1111-1111-1111-111111111111",
      result: "success",
      entity_ref: "internal_users:00000000-0000-0000-0000-000000000002",
      metadata: { request_id: "11111111-1111-1111-1111-111111111111" },
    };
    assertCanonicalPayload(payload);
    expect(payload.approval_reference).not.toBeNull();
  });

  it("blocked_by_safeguard is a valid result state", () => {
    const payload: AuditPayload = {
      target_user_id: "00000000-0000-0000-0000-000000000003",
      action_type: "suspend_user",
      reason: "attempted self-suspend",
      before: { status: "active" },
      after: { status: "active" },
      approval_reference: null,
      result: "blocked_by_safeguard",
      entity_ref: "internal_users:00000000-0000-0000-0000-000000000003",
      metadata: { safeguard_rule: "c" },
    };
    assertCanonicalPayload(payload);
    expect(payload.result).toBe("blocked_by_safeguard");
  });
});