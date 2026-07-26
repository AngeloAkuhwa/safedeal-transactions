/**
 * Central policy that decides whether a staged permission change needs a
 * separate approver, or can be applied directly by the actor.
 *
 * Rules mirror the plan §5:
 *  1. Super Admin role touched
 *  2. permissions.* or users.* module touched
 *  3. user.impersonate touched
 *  4. escrow.release / payouts.initiate / payouts.approve / refunds.approve
 *  5. any *.export with risk high/critical
 *  6. audit.read_full
 *  7. platform_security module
 *  8. any override on a high/critical permission
 *  9. suspending or deprecating a high/critical permission
 */
import { getPermissionRisk, isPrivilegedPermission } from "./permission-catalog";

export type ChangeState =
  | "unchanged"
  | "draft"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "applied"
  | "cancelled"
  | "requested_changes"
  | "failed";

export interface ApprovalContext {
  targetScope: "role" | "user" | "template" | "permission";
  targetKey: string;
  addedKeys: string[];
  removedKeys: string[];
  /** Permission-status transitions like {status:"suspended"|"deprecated"} for scope="permission". */
  patchMeta?: { status?: "active" | "suspended" | "deprecated" };
}

export interface ApprovalRuleHit {
  code: string;
  message: string;
}

const FIN_KEYS = new Set([
  "escrow.release",
  "payouts.initiate",
  "payouts.approve",
  "refunds.approve",
]);

const AUDIT_KEY = "audit.read_full";
const IMPERSONATE_KEY = "user.impersonate";

function moduleOf(key: string): string {
  return key.split(".")[0] ?? "";
}

function isSensitiveExport(key: string): boolean {
  if (!key.endsWith(".export") && !key.includes(".export")) return false;
  const risk = getPermissionRisk(key);
  return risk === "high" || risk === "critical";
}

export function evaluateApproval(ctx: ApprovalContext): { requires: boolean; hits: ApprovalRuleHit[] } {
  const hits: ApprovalRuleHit[] = [];
  const touched = [...ctx.addedKeys, ...ctx.removedKeys];

  if (ctx.targetScope === "role" && ctx.targetKey === "super_admin") {
    hits.push({ code: "super_admin_role", message: "Changes to the Super Admin role always require approval" });
  }

  for (const k of touched) {
    const mod = moduleOf(k);
    if (mod === "permissions" || mod === "users") {
      hits.push({ code: "priv_module", message: `Touches ${mod}.* (permission/user management)` });
      break;
    }
  }

  if (touched.includes(IMPERSONATE_KEY)) {
    hits.push({ code: "impersonate", message: "Grants or revokes user impersonation" });
  }

  for (const k of touched) {
    if (FIN_KEYS.has(k)) {
      hits.push({ code: "financial", message: `Financial capability ${k}` });
      break;
    }
  }

  for (const k of touched) {
    if (isSensitiveExport(k)) {
      hits.push({ code: "export", message: `Sensitive export capability ${k}` });
      break;
    }
  }

  if (touched.includes(AUDIT_KEY)) {
    hits.push({ code: "audit", message: "Full audit-log access" });
  }

  for (const k of touched) {
    if (moduleOf(k) === "platform_security") {
      hits.push({ code: "platform_security", message: "Platform security configuration" });
      break;
    }
  }

  if (ctx.targetScope === "user") {
    for (const k of touched) {
      const risk = getPermissionRisk(k);
      if (risk === "high" || risk === "critical") {
        hits.push({ code: "critical_override", message: `Override on ${risk} permission ${k}` });
        break;
      }
    }
  }

  if (ctx.targetScope === "permission" && (ctx.patchMeta?.status === "suspended" || ctx.patchMeta?.status === "deprecated")) {
    const risk = getPermissionRisk(ctx.targetKey);
    if (risk === "high" || risk === "critical") {
      hits.push({ code: "feature_status", message: `${ctx.patchMeta.status === "suspended" ? "Suspending" : "Deprecating"} a ${risk} permission` });
    }
  }

  // Any staged privileged permission is a safety net.
  if (!hits.length) {
    for (const k of ctx.addedKeys) {
      if (isPrivilegedPermission(k)) {
        hits.push({ code: "privileged_add", message: `Introduces privileged permission ${k}` });
        break;
      }
    }
  }

  return { requires: hits.length > 0, hits };
}

export const CHANGE_STATE_LABEL: Record<ChangeState, string> = {
  unchanged: "Unchanged",
  draft: "Draft",
  pending_approval: "Pending approval",
  approved: "Approved",
  rejected: "Rejected",
  applied: "Applied",
  cancelled: "Cancelled",
  requested_changes: "Requested changes",
  failed: "Failed",
};

/**
 * Map DB `permission_change_sets.status` values (which the DB persisted before
 * this workflow lifted its vocabulary) to the richer ChangeState union we
 * render in the UI.
 */
export function normalizeChangeState(status: string): ChangeState {
  switch (status) {
    case "pending":
    case "pending_approval":
      return "pending_approval";
    case "draft":
      return "draft";
    case "approved":
      return "approved";
    case "rejected":
      return "rejected";
    case "applied":
      return "applied";
    case "cancelled":
      return "cancelled";
    case "requested_changes":
      return "requested_changes";
    case "failed":
      return "failed";
    default:
      return "draft";
  }
}

export function changeStateTone(state: ChangeState): { bg: string; text: string; ring: string; label: string } {
  const label = CHANGE_STATE_LABEL[state];
  switch (state) {
    case "draft":
      return { bg: "bg-amber-500/15", text: "text-amber-300", ring: "ring-amber-500/40", label };
    case "pending_approval":
      return { bg: "bg-sky-500/15", text: "text-sky-300", ring: "ring-sky-500/40", label };
    case "approved":
      return { bg: "bg-emerald-500/15", text: "text-emerald-300", ring: "ring-emerald-500/40", label };
    case "applied":
      return { bg: "bg-emerald-600/20", text: "text-emerald-300", ring: "ring-emerald-500/50", label };
    case "rejected":
      return { bg: "bg-rose-500/15", text: "text-rose-300", ring: "ring-rose-500/40", label };
    case "cancelled":
      return { bg: "bg-muted", text: "text-muted-foreground", ring: "ring-border", label };
    case "requested_changes":
      return { bg: "bg-orange-500/15", text: "text-orange-300", ring: "ring-orange-500/40", label };
    case "failed":
      return { bg: "bg-red-600/20", text: "text-red-300", ring: "ring-red-500/50", label };
    default:
      return { bg: "bg-muted/40", text: "text-muted-foreground", ring: "ring-border", label };
  }
}