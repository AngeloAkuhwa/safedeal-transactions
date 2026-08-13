// Pure, testable rules for the server-side dispute / hold guards that protect
// money movement (release + ad-hoc refund). Kept free of any Supabase client so
// both the edge functions and the vitest contract tests can use them.

/** A dispute is only "closed" once it reaches `resolved`. */
export const RESOLVED_DISPUTE_STATUS = "resolved";

/**
 * Queue statuses that represent an EXPLICIT active hold. `pending`/`claimed`
 * are the normal "ready for release review" states and must stay releasable —
 * that is how a dispute resolved in the seller's favour is paid out.
 */
export const ACTIVE_HOLD_QUEUE_STATUSES = ["held", "awaiting_info"] as const;

export type DisputeRow = { status?: string | null };
export type ReleaseQueueRow = { status?: string | null };

export function hasOpenDispute(disputes: DisputeRow[] | null | undefined): boolean {
  return (disputes ?? []).some(
    (d) => String(d?.status ?? "").toLowerCase() !== RESOLVED_DISPUTE_STATUS,
  );
}

export function hasActiveHold(rows: ReleaseQueueRow[] | null | undefined): boolean {
  return (rows ?? []).some((r) =>
    (ACTIVE_HOLD_QUEUE_STATUSES as readonly string[]).includes(String(r?.status ?? "").toLowerCase()),
  );
}

export type ReleaseBlock = { error: "dispute_open" | "release_on_hold" } | null;

/**
 * Returns the blocking condition for a release, or null when the release may
 * proceed. Open disputes take precedence over holds.
 */
export function evaluateReleaseBlocks(
  disputes: DisputeRow[] | null | undefined,
  queueRows: ReleaseQueueRow[] | null | undefined,
): ReleaseBlock {
  if (hasOpenDispute(disputes)) return { error: "dispute_open" };
  if (hasActiveHold(queueRows)) return { error: "release_on_hold" };
  return null;
}
