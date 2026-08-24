/**
 * Centralized dispute display derivation.
 *
 * After a dispute is resolved, the visible status everywhere in the UI must
 * be derived from `dispute_outcomes` + `money_status` + escrow state: never
 * from the raw `disputes.status` or the legacy "In Dispute" badge.
 *
 * SafeDeal central release model: seller-favor outcomes ALWAYS land in
 * `funds_pending_release` and are payed out by the central admin release
 * workflow: never directly from dispute resolution.
 */

export type DisputeOutcomeType =
  | "refund_buyer"
  | "release_funds_to_seller"
  | "partial_refund_release"
  | "dismissed_seller_favor"
  | "dismissed_buyer_favor"
  | "close_case_without_resolution";

export type DisputeDisplayTone = "neutral" | "info" | "warning" | "danger" | "success";

export interface DisputeOutcomeInput {
  outcome_type: DisputeOutcomeType | string;
  refund_amount?: number | null;
  release_amount?: number | null;
}

export interface DisputeDisplayPart {
  label: "Refund Pending" | "Release Pending";
  amount: number;
}

export interface DisputeDisplayResult {
  /** Headline label shown to the admin (e.g. "Awaiting Release"). */
  label: string;
  tone: DisputeDisplayTone;
  /** Money status the UI should reflect for this resolved dispute. */
  moneyStatus: string | null;
  /** Populated for partial outcomes: shows the refund + release split. */
  parts?: DisputeDisplayPart[];
  /**
   * True when the dispute is resolved. Callers should use this to suppress
   * the legacy "In Dispute" badge.
   */
  resolved: boolean;
}

export interface DeriveDisputeDisplayInput {
  disputeStatus: string | null | undefined;
  outcome?: DisputeOutcomeInput | null;
  moneyStatus: string | null | undefined;
  escrow?: {
    heldAmount?: number | null;
    frozenAmount?: number | null;
  } | null;
}

/**
 * Derive the visible dispute display status. Returns `null` for unresolved
 * disputes: callers should fall back to their existing dispute-status badge.
 */
export function deriveDisputeDisplay(
  input: DeriveDisputeDisplayInput,
): DisputeDisplayResult | null {
  const { disputeStatus, outcome, moneyStatus, escrow } = input;
  if (disputeStatus !== "resolved") return null;

  const ms = moneyStatus ?? null;
  // No zero fallback on money: an absent escrow figure must not read as a
  // known ₦0. Number(undefined) is NaN, and NaN > 0 is false, so the gating
  // below behaves identically while never inventing an amount.
  const frozen = Number(escrow?.frozenAmount);
  const held = Number(escrow?.heldAmount);

  // No outcome row but dispute is resolved. Fall back to money state.
  const otype = (outcome?.outcome_type ?? "") as DisputeOutcomeType;

  switch (otype) {
    case "release_funds_to_seller":
    case "dismissed_seller_favor":
      return {
        label: "Awaiting Release",
        tone: "info",
        moneyStatus: "funds_pending_release",
        resolved: true,
      };

    case "refund_buyer":
    case "dismissed_buyer_favor":
      return {
        label: "Refund Pending",
        tone: "warning",
        moneyStatus: "refund_pending",
        resolved: true,
      };

    case "partial_refund_release":
      return {
        label: "Partially Resolved",
        tone: "info",
        moneyStatus: ms ?? "refund_pending",
        // A split row appears only when its amount is actually recorded: a
        // partial outcome with an absent figure must not display as ₦0.00.
        parts: [
          ...(typeof outcome?.refund_amount === "number"
            ? [{ label: "Refund Pending" as const, amount: outcome.refund_amount }]
            : []),
          ...(typeof outcome?.release_amount === "number"
            ? [{ label: "Release Pending" as const, amount: outcome.release_amount }]
            : []),
        ],
        resolved: true,
      };

    case "close_case_without_resolution": {
      if (frozen > 0 || ms === "funds_frozen") {
        return {
          label: "Manual Action Required",
          tone: "danger",
          moneyStatus: "funds_frozen",
          resolved: true,
        };
      }
      if (ms === "funds_pending_release") {
        return {
          label: "Awaiting Release",
          tone: "info",
          moneyStatus: "funds_pending_release",
          resolved: true,
        };
      }
      // held in escrow (default), or any other non-frozen state
      return {
        label: "Funds Held in Escrow",
        tone: "info",
        moneyStatus: ms ?? "funds_held_in_escrow",
        resolved: true,
      };
    }

    default:
      // Unknown outcome: derive from money status only.
      if (ms === "refund_pending") {
        return { label: "Refund Pending", tone: "warning", moneyStatus: ms, resolved: true };
      }
      if (ms === "funds_pending_release") {
        return { label: "Awaiting Release", tone: "info", moneyStatus: ms, resolved: true };
      }
      if (ms === "funds_frozen" || frozen > 0) {
        return { label: "Manual Action Required", tone: "danger", moneyStatus: "funds_frozen", resolved: true };
      }
      return {
        label: "Funds Held in Escrow",
        tone: "info",
        moneyStatus: ms ?? "funds_held_in_escrow",
        resolved: true,
      };
  }
}
