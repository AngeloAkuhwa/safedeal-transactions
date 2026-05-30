/**
 * Single source of truth for "is this transaction/dispute currently in
 * an active blocker state?" used by every admin surface (dispute detail,
 * transaction detail, list pages).
 *
 * History rows (status_history, money_status_history, dispute_status_history,
 * old admin_actions) must NEVER feed into these flags — they are derived
 * from the *current* row state only. Timelines are display-only history.
 */

const ACTIVE_DISPUTE_STATES = new Set([
  "open",
  "awaiting_seller_response",
  "seller_response_pending",
  "under_review",
  "escalated",
]);

const ACTIVE_INVESTIGATION_STATES = new Set([
  "open",
  "in_progress",
  "investigating",
]);

export interface ActiveStateInputs {
  dispute?: {
    status?: string | null;
    seller_response_due_at?: string | null;
    sellerResponseDueAt?: string | null;
    resolved_at?: string | null;
    resolvedAt?: string | null;
  } | null;
  investigation?: { status?: string | null; resolvedAt?: string | null } | null;
  investigations?: Array<{ status?: string | null; resolvedAt?: string | null }>;
  moneyStatus?: string | null;
  escrow?: { heldAmount?: number | null; frozenAmount?: number | null } | null;
  risk?: { level?: string | null } | null;
  payout?: { status?: string | null; awaitingRelease?: boolean | null } | null;
  needsReleaseReview?: boolean | null;
}

export interface ActiveState {
  isDisputeActive: boolean;
  isDisputeResolved: boolean;
  isFrozen: boolean;
  isInvestigationActive: boolean;
  isEscalated: boolean;
  isOverdue: boolean;
  needsReleaseReview: boolean;
  activeBlockers: string[];
  needsAdminReview: boolean;
}

export function deriveActiveState(input: ActiveStateInputs): ActiveState {
  const dispute = input.dispute ?? null;
  const status = dispute?.status ?? null;
  const resolvedAt = dispute?.resolved_at ?? dispute?.resolvedAt ?? null;
  const dueAt = dispute?.seller_response_due_at ?? dispute?.sellerResponseDueAt ?? null;

  const isDisputeResolved =
    !!resolvedAt || status === "resolved" || status === "closed" || status === "dismissed";
  const isDisputeActive = !isDisputeResolved && !!status && ACTIVE_DISPUTE_STATES.has(status);

  const investigations = input.investigations
    ?? (input.investigation ? [input.investigation] : []);
  const isInvestigationActive = investigations.some((i) => {
    if (!i) return false;
    if (i.resolvedAt) return false;
    return !!i.status && ACTIVE_INVESTIGATION_STATES.has(i.status);
  });

  const frozenAmount = Number(input.escrow?.frozenAmount ?? 0);
  const isFrozen = input.moneyStatus === "funds_frozen" || frozenAmount > 0;

  const isEscalated = isDisputeActive && status === "escalated";

  const isOverdue = isDisputeActive && !!dueAt && new Date(dueAt).getTime() < Date.now();

  const needsReleaseReview =
    !!input.needsReleaseReview
    || input.payout?.status === "pending"
    || input.payout?.status === "awaiting_release"
    || !!input.payout?.awaitingRelease;

  const activeBlockers: string[] = [];
  if (isDisputeActive) activeBlockers.push("active_dispute");
  if (isInvestigationActive) activeBlockers.push("active_investigation");
  if (isFrozen) activeBlockers.push("funds_frozen");
  if (needsReleaseReview) activeBlockers.push("release_review");
  if (input.risk?.level === "high" || input.risk?.level === "critical") {
    activeBlockers.push("high_risk");
  }

  return {
    isDisputeActive,
    isDisputeResolved,
    isFrozen,
    isInvestigationActive,
    isEscalated,
    isOverdue,
    needsReleaseReview,
    activeBlockers,
    needsAdminReview: activeBlockers.length > 0,
  };
}

/** Plain-English next-action label after a dispute resolution. */
export function nextActionLabelFor(outcomeType?: string | null): string {
  switch (outcomeType) {
    case "refund_buyer":
      return "Pending refund processing";
    case "release_funds_to_seller":
      return "Pending release review";
    case "partial_refund_release":
      return "Pending split settlement";
    case "close_case_without_resolution":
      return "No money movement required";
    default:
      return "Resolution recorded";
  }
}