/**
 * Single source of truth for "is this transaction/dispute currently in
 * an active blocker state?" used by every admin surface (dispute detail,
 * transaction detail, list pages).
 *
 * History rows (status_history, money_status_history, dispute_status_history,
 * old admin_actions) must NEVER feed into these flags. They are derived
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

/**
 * Shared banner tone for the Admin Transaction / Dispute Detail pages.
 * - `red`     → actually dangerous: frozen, active investigation, or critical risk
 * - `amber`   → only the seller payout is pending release review (no live risk)
 * - `none`    → nothing to warn about
 * History (resolved disputes, dismissed investigations) never produces a banner.
 */
export function riskBannerTone(
  active: ActiveState,
  riskLevel?: string | null,
): "red" | "amber" | "none" {
  if (active.isFrozen) return "red";
  if (active.isInvestigationActive) return "red";
  if (riskLevel === "critical") return "red";
  if (active.isDisputeActive && (riskLevel === "high" || active.isEscalated)) return "red";
  if (active.needsReleaseReview) return "amber";
  return "none";
}

/**
 * Drop flags that are purely historical once the case has been resolved or
 * funds unfrozen. Keeps the current-state list honest.
 * Input: raw flag objects shaped like `{ label, severity }`.
 */
export function visibleRiskFlags<T extends { label?: string | null }>(
  rawFlags: T[] | null | undefined,
  active: ActiveState,
): T[] {
  const list = Array.isArray(rawFlags) ? rawFlags : [];
  return list.filter((f) => {
    const label = (f?.label ?? "").toString().trim().toLowerCase();
    if (!label) return false;
    // never surface "Dispute: Resolved" / "Dispute: Closed" as an active flag
    if (label.startsWith("dispute:") && active.isDisputeResolved) return false;
    if (label === "dispute resolved" || label === "dispute closed") return false;
    // stale manual_hold / release_hold after release-review cleared
    if ((label === "manual_hold" || label === "release_hold") && !active.needsReleaseReview && !active.isFrozen) return false;
    // stale frozen flag after unfreeze
    if ((label === "funds frozen" || label === "frozen" || label === "admin_frozen") && !active.isFrozen) return false;
    // stale escalation/overdue/in-dispute flags after resolution
    if (active.isDisputeResolved && (
      label === "escalated" ||
      label === "dispute escalated" ||
      label === "overdue" ||
      label === "dispute response overdue" ||
      label === "in_dispute" ||
      label === "dispute open"
    )) return false;
    return true;
  });
}

/**
 * Categorise a flag label into a UI tone bucket. Used to colour chips so
 * informational flags (High-value transaction, Repeat buyer) don't look
 * like fraud alerts.
 */
export function flagChipTone(label: string): "red" | "orange" | "slate" {
  const l = (label ?? "").toLowerCase();
  if (
    l.includes("frozen") ||
    l.includes("fraud") ||
    l.includes("overdue") ||
    l.includes("critical") ||
    l === "dispute open" || l === "in_dispute" ||
    l.includes("investigation open")
  ) return "red";
  if (
    l.includes("escalat") ||
    l === "manual_hold" || l === "release_hold" ||
    l.includes("high risk") || l.includes("high_risk")
  ) return "orange";
  return "slate";
}