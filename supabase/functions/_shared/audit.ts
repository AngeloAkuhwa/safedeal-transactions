// Unified admin audit helper. Writes ONE canonical row to `admin_actions`
// with a JSONB diff (before / after / changed_keys), and optionally mirrors
// to `audit_logs` for security-sensitive events. Every admin mutation edge
// function should call `logAdminAction` instead of hand-rolling inserts, so
// the audit trail is queryable by a single filter.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export type AdminAuditInput = {
  actorId: string;
  action: string; // e.g. "update_setting", "resolve_dispute", "reveal_user_field"
  targetType?: "user" | "transaction" | "dispute" | "vendor" | "setting" | "notification" | "system";
  targetId?: string | null;
  transactionId?: string | null;
  disputeId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string;
  metadata?: Record<string, unknown>;
  mirrorToAuditLogs?: boolean; // set true for security-sensitive events
  ip?: string | null;
  userAgent?: string | null;
};

// Small utility so callers don't repeat request-header parsing.
export function extractRequestMeta(req: Request): { ip: string | null; userAgent: string | null } {
  const ip =
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
    null;
  const userAgent = req.headers.get("user-agent") || null;
  return { ip, userAgent };
}

function computeDiff(before: unknown, after: unknown): {
  changed_keys: string[];
  before_diff: Record<string, unknown>;
  after_diff: Record<string, unknown>;
} {
  const b = (before && typeof before === "object" ? before : {}) as Record<string, unknown>;
  const a = (after && typeof after === "object" ? after : {}) as Record<string, unknown>;
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  const before_diff: Record<string, unknown> = {};
  const after_diff: Record<string, unknown> = {};
  const changed_keys: string[] = [];
  for (const k of keys) {
    const bv = b[k];
    const av = a[k];
    if (JSON.stringify(bv) !== JSON.stringify(av)) {
      before_diff[k] = bv ?? null;
      after_diff[k] = av ?? null;
      changed_keys.push(k);
    }
  }
  return { changed_keys, before_diff, after_diff };
}

export async function logAdminAction(
  admin: SupabaseClient,
  input: AdminAuditInput,
): Promise<{ ok: true; id?: string } | { ok: false; error: string }> {
  try {
    const diff = (input.before !== undefined || input.after !== undefined)
      ? computeDiff(input.before, input.after)
      : { changed_keys: [], before_diff: {}, after_diff: {} };

    const notesPayload = {
      reason: input.reason ?? null,
      target_type: input.targetType ?? null,
      target_id: input.targetId ?? null,
      changed_keys: diff.changed_keys,
      before: diff.before_diff,
      after: diff.after_diff,
      metadata: input.metadata ?? null,
      ip: input.ip ?? null,
      user_agent: input.userAgent ?? null,
    };

    const { data, error } = await admin.from("admin_actions").insert({
      admin_user_id: input.actorId,
      target_user_id: input.targetType === "user" || input.targetType === "vendor" ? input.targetId ?? null : null,
      transaction_id: input.transactionId ?? null,
      dispute_id: input.disputeId ?? null,
      action_type: input.action,
      action_notes: JSON.stringify(notesPayload),
    }).select("id").maybeSingle();

    if (error) {
      console.warn("[logAdminAction] insert admin_actions failed:", error.message);
      return { ok: false, error: error.message };
    }

    if (input.mirrorToAuditLogs) {
      const { error: mirrorErr } = await admin.from("audit_logs").insert({
        action: input.action,
        actor_user_id: input.actorId,
        transaction_id: input.transactionId ?? null,
        description: `admin:${input.action}${input.reason ? `: ${String(input.reason).slice(0, 240)}` : ""}`,
        metadata: notesPayload,
      });
      if (mirrorErr) console.warn("[logAdminAction] mirror to audit_logs failed:", mirrorErr.message);
    }

    return { ok: true, id: data?.id };
  } catch (e) {
    console.warn("[logAdminAction] unexpected error:", (e as Error).message);
    return { ok: false, error: (e as Error).message };
  }
}

// Convenience factory when the caller only has env, not a client.
export function createAdminClientForAudit(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}