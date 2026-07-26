// Shared helper for creating orchestration tasks from any edge function.
// Uses the SECURITY DEFINER RPC `create_orchestration_task` which is
// idempotent on `_source_event_key`.
//
// Callers pass a service-role Supabase client (admin) so this runs regardless
// of the invoking user's permissions.

type AdminClient = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

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
  amount?: number | null;
  currency?: string | null;
  requiredPermissions?: string[];
  /** Stable, unique key so re-tries don't create duplicate tasks. */
  sourceEventKey: string;
}

/**
 * Enqueue an orchestration task. Never throws — logs and returns null on
 * failure so business flows (dispute creation, response submission, …) are
 * not blocked by orchestration issues.
 */
export async function enqueueOrchestrationTask(
  admin: AdminClient,
  input: CreateTaskInput,
): Promise<string | null> {
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
      _amount: input.amount ?? null,
      _currency: input.currency ?? "NGN",
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
