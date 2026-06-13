import type { PayoutRow } from "@/services/admin-payouts.service";

/**
 * Shared presentation helpers for payouts.
 * Both the table row and the drawer hero must read from these so labels never drift.
 */

export type PayoutPillKey =
  | "released"
  | "processing"
  | "failed"
  | "pending_release"
  | "blocked"
  | "reversed"
  | "cancelled"
  | "unknown";

export interface PayoutPill {
  key: PayoutPillKey;
  label: string;
  tone: "emerald" | "blue" | "red" | "amber" | "orange" | "slate";
}

/** Map raw payout status (+ blocked flag) to a friendly user-facing pill. Never returns raw enum text. */
export function getPayoutPill(status: string | null | undefined, blocked: boolean): PayoutPill {
  if (blocked) return { key: "blocked", label: "Blocked", tone: "orange" };
  switch ((status ?? "").toLowerCase()) {
    case "released":
    case "paid":
    case "completed":
      return { key: "released", label: "Released", tone: "emerald" };
    case "processing":
    case "initiated":
    case "pending":
      return { key: "processing", label: "Processing", tone: "blue" };
    case "failed":
      return { key: "failed", label: "Failed", tone: "red" };
    case "awaiting_release":
    case "queued":
      return { key: "pending_release", label: "Pending Release", tone: "amber" };
    case "reversed":
      return { key: "reversed", label: "Reversed", tone: "red" };
    case "cancelled":
    case "canceled":
      return { key: "cancelled", label: "Cancelled", tone: "slate" };
    default:
      return { key: "unknown", label: "Pending Release", tone: "amber" };
  }
}

export interface PayoutCaption {
  text: string;
  tone: "red" | "muted" | "emerald" | "blue";
}

/**
 * Single source of truth for the small reason line under the Payout ID (table)
 * and the subtitle under the hero amount (drawer).
 */
export function getPayoutCaption(args: {
  status: string | null | undefined;
  releaseBlocked: boolean;
  payoutBlockedReason?: string | null;
  failureReason?: string | null;
}): PayoutCaption | null {
  if (args.payoutBlockedReason) return { text: args.payoutBlockedReason, tone: "red" };
  if (args.failureReason) return { text: args.failureReason, tone: "red" };
  const s = (args.status ?? "").toLowerCase();
  if (s === "completed" || s === "released" || s === "paid") return { text: "Completed successfully", tone: "emerald" };
  if (s === "pending" || s === "processing" || s === "initiated") return { text: "Bank processing", tone: "blue" };
  return null;
}

export function getPayoutCaptionFromRow(r: PayoutRow): PayoutCaption | null {
  return getPayoutCaption({
    status: r.status,
    releaseBlocked: !!r.release_blocked,
    payoutBlockedReason: r.payout_blocked_reason,
    failureReason: r.failure_reason,
  });
}

/** Canonical four-state model for the seller payout account. */
export type AccountState =
  | "no_account"
  | "unverified"
  | "verified_no_recipient"
  | "verified_ready";

export interface AccountPresentation {
  state: AccountState;
  tableLabel: string;
  drawerVerificationLabel: string; // value shown next to "Verification:" in the drawer
  drawerRecipientPresent: boolean | null; // null = N/A (no account at all)
  tone: "emerald" | "red" | "amber" | "slate";
}

export function getAccountPresentation(
  account: PayoutRow["payout_account"] | null | undefined,
): AccountPresentation {
  if (!account) {
    return {
      state: "no_account",
      tableLabel: "No payout account",
      drawerVerificationLabel: "missing",
      drawerRecipientPresent: null,
      tone: "red",
    };
  }
  const verified = account.verification_status === "verified";
  if (!verified) {
    return {
      state: "unverified",
      tableLabel: "Payout account unverified",
      drawerVerificationLabel: account.verification_status ?? "unverified",
      drawerRecipientPresent: !!account.has_recipient_code,
      tone: "amber",
    };
  }
  if (!account.has_recipient_code) {
    return {
      state: "verified_no_recipient",
      tableLabel: "Recipient code missing",
      drawerVerificationLabel: "verified",
      drawerRecipientPresent: false,
      tone: "red",
    };
  }
  return {
    state: "verified_ready",
    tableLabel: "Verified",
    drawerVerificationLabel: "verified",
    drawerRecipientPresent: true,
    tone: "emerald",
  };
}