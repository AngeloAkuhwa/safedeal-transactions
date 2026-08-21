// Shared helper for creating orchestration tasks from any edge function.
// Uses the SECURITY DEFINER RPC `create_orchestration_task` which is
// idempotent on `_source_event_key`.
//
// Callers pass a service-role Supabase client (admin) so this runs regardless
// of the invoking user's permissions.

type AdminClient = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

// deno-lint-ignore no-explicit-any
type AnyClient = any;

export type OrchestrationTaskType =
  | "dispute_review"
  | "dispute_response_review"
  | "evidence_review"
  | "identity_review"
  | "release_review"
  | "payout_review"
  | "escalation"
  | "general";

export type OrchestrationPriority = "low" | "medium" | "high" | "critical";

export interface CreateTaskInput {
  type: OrchestrationTaskType;
  title: string;
  description?: string | null;
  priority?: OrchestrationPriority;
  queue?: string;
  disputeId?: string | null;
  transactionId?: string | null;
  buyerId?: string | null;
  sellerId?: string | null;
  /** Optional. When set, `currency` is mandatory: the database rejects an
   *  amount without its own currency rather than assuming one. */
  amount?: number | null;
  currency?: string | null;
  requiredPermissions?: string[];
  /** Stable, unique key so re-tries don't create duplicate tasks. */
  sourceEventKey: string;
}

/**
 * Enqueue an orchestration task. Never throws. Logs and returns null on
 * failure so business flows (dispute creation, response submission, …) are
 * not blocked by orchestration issues.
 */
export async function enqueueOrchestrationTask(
  admin: AdminClient,
  input: CreateTaskInput,
): Promise<string | null> {
  // A task amount without a stated currency is not a number we can trust, so
  // it is dropped rather than laundered through an invented NGN.
  const currency = input.currency && input.currency.trim() !== "" ? input.currency.trim() : null;
  const amount = currency ? (input.amount ?? null) : null;
  if (input.amount != null && !currency) {
    console.error("enqueueOrchestrationTask: amount supplied without a currency; amount dropped");
  }
  try {
    const { data, error } = await admin.rpc("create_orchestration_task", {
      _type: input.type,
      _title: input.title,
      _description: input.description ?? null,
      _priority: input.priority ?? "medium",
      _queue: input.queue ?? "disputes",
      _dispute_id: input.disputeId ?? null,
      _transaction_id: input.transactionId ?? null,
      _buyer_id: input.buyerId ?? null,
      _seller_id: input.sellerId ?? null,
      _amount: amount,
      _currency: currency,
      _required_permissions: input.requiredPermissions ?? [],
      _source_event_key: input.sourceEventKey,
    });
    if (error) {
      console.error("enqueueOrchestrationTask failed:", error);
      return null;
    }
    return typeof data === "string" ? data : null;
  } catch (err) {
    console.error("enqueueOrchestrationTask threw:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Orchestration notifications
// ---------------------------------------------------------------------------

export type OrchestrationNotificationEvent =
  | "task_assigned"
  | "task_reassigned"
  | "task_escalated"
  | "sla_approaching"
  | "sla_overdue"
  | "critical_unassigned"
  | "agent_at_capacity"
  | "automation_rule_failed"
  | "no_eligible_agent";

/**
 * `notifications.type` is a fixed Postgres enum, so orchestration alerts are
 * stored under a valid enum label and the real event lives in metadata.
 */
function notificationTypeFor(event: string): string {
  switch (event) {
    case "automation_rule_failed":
    case "no_eligible_agent":
    case "critical_unassigned":
      return "security_alert";
    default:
      return "system_message";
  }
}

export interface NotifyOrchestrationInput {
  event: OrchestrationNotificationEvent | string;
  recipients: string[];
  title: string;
  body: string;
  /** Suppression key; identical unchanged conditions won't re-fire in-window. */
  dedupeKey?: string;
  dedupeMinutes?: number;
  /** Deep link into the orchestration surface, e.g. `?task=<id>`. */
  link?: string;
  data?: Record<string, unknown>;
  channel?: string;
}

/**
 * Single fan-out helper for every orchestration notification. Writes
 * `notifications` rows plus matching `notification_deliveries` rows so the
 * admin Notification Center can show status / retry. Never throws.
 */
export async function notifyOrchestration(
  admin: AnyClient,
  input: NotifyOrchestrationInput,
): Promise<void> {
  try {
    let recipients = [...new Set((input.recipients ?? []).filter(Boolean))];
    if (!recipients.length) return;

    if (input.dedupeKey) {
      const { dedupeNotification } = await import("./orchestration-rules.ts");
      recipients = await dedupeNotification(
        admin,
        input.event,
        input.dedupeKey,
        recipients,
        input.dedupeMinutes ?? 60,
      );
      if (!recipients.length) return;
    }

    const channel = input.channel ?? "in_app";
    const metadata = {
      ...(input.data ?? {}),
      event: input.event,
      ...(input.link ? { link: input.link } : {}),
      ...(input.dedupeKey ? { dedupe_key: input.dedupeKey } : {}),
    };

    const { data: inserted, error } = await admin
      .from("notifications")
      .insert(
        recipients.map((uid) => ({
          user_id: uid,
          type: notificationTypeFor(input.event),
          channel,
          title: input.title,
          message: input.body,
          status: "sent",
          metadata,
        })),
      )
      .select("id");

    if (error) {
      console.error("notifyOrchestration insert failed:", error);
      return;
    }

    const now = new Date().toISOString();
    const deliveries = (inserted ?? []).map((n: { id: string }) => ({
      notification_id: n.id,
      channel,
      delivery_status: "sent",
      attempt_count: 1,
      sent_at: now,
    }));
    if (deliveries.length) {
      const { error: dErr } = await admin.from("notification_deliveries").insert(deliveries);
      if (dErr) console.error("notifyOrchestration deliveries failed:", dErr);
    }
  } catch (err) {
    console.error("notifyOrchestration threw:", err);
  }
}

/**
 * Resolve the manager(s) that should be copied on an agent's task events.
 * Prefers the agent's `reporting_manager_id`, then their team leads, and
 * finally falls back to senior admins.
 */
export async function managersFor(
  admin: AnyClient,
  agentId: string | null | undefined,
): Promise<string[]> {
  const out = new Set<string>();
  try {
    if (agentId) {
      const { data: me } = await admin
        .from("internal_users")
        .select("id, team, reporting_manager_id")
        .eq("id", agentId)
        .maybeSingle();
      if (me?.reporting_manager_id) out.add(me.reporting_manager_id);
      if (!out.size && me?.team) {
        const { data: peers } = await admin
          .from("internal_users")
          .select("id")
          .eq("team", me.team)
          .eq("status", "active");
        const ids = (peers ?? []).map((p: { id: string }) => p.id).filter((id: string) => id !== agentId);
        if (ids.length) {
          const { data: leads } = await admin
            .from("user_roles")
            .select("user_id")
            .in("user_id", ids)
            .in("role", ["dispute_manager", "senior_admin", "super_admin"]);
          for (const l of leads ?? []) out.add(l.user_id);
        }
      }
    }
    if (!out.size) {
      const { data: seniors } = await admin
        .from("user_roles")
        .select("user_id")
        .in("role", ["super_admin", "senior_admin"]);
      for (const s of seniors ?? []) out.add(s.user_id);
    }
  } catch (err) {
    console.error("managersFor threw:", err);
  }
  out.delete(agentId ?? "");
  return [...out];
}
