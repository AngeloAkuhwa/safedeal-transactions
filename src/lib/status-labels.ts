/**
 * SafeDeal status-label registry.
 *
 * Single source of truth for the user-facing copy attached to every DB status
 * we surface in the UI. Keyed by `audience` so the same DB value can read
 * differently on a seller screen vs a buyer screen (e.g. funds_released ->
 * "Released To You" for the seller, "Released To Seller" for the buyer).
 *
 * NEVER inline a status->copy map in a page or component. Import from here.
 */

export type Audience = "seller" | "buyer";

export type Tone =
  | "muted"
  | "info"
  | "warning"
  | "success"
  | "destructive";

export interface LabelEntry {
  label: string;
  /** Optional shorter form for chips that risk wrapping. */
  short?: string;
  tone: Tone;
}

export const TONE_CLASSNAMES: Record<Tone, string> = {
  muted: "bg-muted text-muted-foreground border-border",
  info: "bg-primary/15 text-primary border-primary/30",
  warning: "bg-warning/15 text-warning border-warning/30",
  success: "bg-success/15 text-success border-success/30",
  destructive: "bg-destructive/15 text-destructive border-destructive/30",
};

/* ============================================================
 * TRANSACTION STATUS
 * ============================================================ */

export type TxStatus =
  | "draft"
  | "awaiting_buyer"
  | "awaiting_payment"
  | "payment_secured"
  | "seller_preparing_delivery"
  | "seller_dispatched"
  | "delivered_awaiting_verification"
  | "disputed"
  | "completed"
  | "cancelled"
  | "timed_out"
  | "refunded"
  | "resolved";

export const TRANSACTION_LABELS: Record<Audience, Record<TxStatus, LabelEntry>> = {
  seller: {
    draft: { label: "Draft", tone: "muted" },
    awaiting_buyer: { label: "Awaiting Buyer", tone: "muted" },
    awaiting_payment: { label: "Awaiting Payment", tone: "warning" },
    payment_secured: { label: "Payment Secured", tone: "success" },
    seller_preparing_delivery: { label: "Preparing Delivery", tone: "info" },
    seller_dispatched: { label: "Dispatched", tone: "info" },
    delivered_awaiting_verification: { label: "Delivered", tone: "warning" },
    disputed: { label: "Disputed", tone: "destructive" },
    completed: { label: "Completed", tone: "success" },
    cancelled: { label: "Cancelled", tone: "muted" },
    timed_out: { label: "Timed Out", tone: "muted" },
    refunded: { label: "Refunded", tone: "muted" },
    resolved: { label: "Resolved", tone: "success" },
  },
  buyer: {
    draft: { label: "Draft", tone: "muted" },
    awaiting_buyer: { label: "Review Agreement", tone: "warning" },
    awaiting_payment: { label: "Awaiting Payment", tone: "warning" },
    payment_secured: { label: "Payment Secured", tone: "success" },
    seller_preparing_delivery: {
      label: "Seller Preparing Delivery",
      short: "Seller Preparing",
      tone: "info",
    },
    seller_dispatched: { label: "Dispatched", tone: "info" },
    delivered_awaiting_verification: {
      label: "Confirm Item Received",
      short: "Confirm Receipt",
      tone: "warning",
    },
    disputed: { label: "Disputed", tone: "destructive" },
    completed: { label: "Completed", tone: "success" },
    cancelled: { label: "Cancelled", tone: "muted" },
    timed_out: { label: "Timed Out", tone: "muted" },
    refunded: { label: "Refunded", tone: "muted" },
    resolved: { label: "Resolved", tone: "success" },
  },
};

/* ============================================================
 * MONEY STATUS
 * ============================================================ */

export type MoneyStatus =
  | "not_secured"
  | "payment_pending"
  | "funds_held_in_escrow"
  | "funds_pending_release"
  | "funds_releasing"
  | "funds_released"
  | "funds_frozen"
  | "refund_pending"
  | "refund_issued";

export const MONEY_LABELS: Record<Audience, Record<MoneyStatus, LabelEntry>> = {
  seller: {
    not_secured: { label: "Not Secured", tone: "muted" },
    payment_pending: { label: "Payment Pending", tone: "warning" },
    funds_held_in_escrow: { label: "Funds Held", tone: "info" },
    funds_pending_release: { label: "Awaiting Release", tone: "info" },
    funds_releasing: { label: "Payment Processing", tone: "success" },
    funds_released: { label: "Released To You", tone: "success" },
    funds_frozen: { label: "Funds Frozen", tone: "destructive" },
    refund_pending: { label: "Refund Pending", tone: "warning" },
    refund_issued: { label: "Refunded", tone: "muted" },
  },
  buyer: {
    not_secured: { label: "Not Paid Yet", tone: "muted" },
    payment_pending: { label: "Payment Pending", tone: "warning" },
    funds_held_in_escrow: { label: "Payment Secured", tone: "success" },
    funds_pending_release: { label: "Awaiting Release", tone: "info" },
    funds_releasing: { label: "Payment Processing", tone: "info" },
    funds_released: { label: "Released To Seller", tone: "success" },
    funds_frozen: { label: "Funds Frozen", tone: "destructive" },
    refund_pending: { label: "Refund Pending", tone: "warning" },
    refund_issued: { label: "Refunded", tone: "muted" },
  },
};

/**
 * Resolve the right money label for the buyer audience, taking the
 * seller-confirmation signal into account so we can distinguish the two
 * flavors of `funds_pending_release`.
 */
export function resolveMoneyLabel(
  status: MoneyStatus | string,
  audience: Audience,
  ctx?: { sellerConfirmed?: boolean | null },
): LabelEntry {
  const base =
    MONEY_LABELS[audience][status as MoneyStatus] ??
    ({
      label: String(status).replace(/_/g, " "),
      tone: "muted",
    } satisfies LabelEntry);

  if (
    audience === "buyer" &&
    status === "funds_pending_release" &&
    ctx?.sellerConfirmed === false
  ) {
    return {
      label: "Awaiting Seller Confirmation",
      short: "Awaiting Confirmation",
      tone: "warning",
    };
  }

  return base;
}

export function resolveTransactionLabel(
  status: TxStatus | string,
  audience: Audience,
): LabelEntry {
  return (
    TRANSACTION_LABELS[audience][status as TxStatus] ??
    ({
      label: String(status).replace(/_/g, " "),
      tone: "muted",
    } satisfies LabelEntry)
  );
}

/* ============================================================
 * DISPUTE STATUS
 * ============================================================ */

export type DisputeStatus =
  | "open"
  | "awaiting_seller_response"
  | "awaiting_buyer_response"
  | "under_review"
  | "resolved_buyer_refund"
  | "resolved_seller_release"
  | "resolved_partial"
  | "withdrawn"
  | "closed";

export const DISPUTE_LABELS: Record<Audience, Record<DisputeStatus, LabelEntry>> = {
  seller: {
    open: { label: "Open", tone: "warning" },
    awaiting_seller_response: { label: "Your Response Needed", tone: "warning" },
    awaiting_buyer_response: { label: "Awaiting Buyer", tone: "info" },
    under_review: { label: "SafeDeal Review", tone: "info" },
    resolved_buyer_refund: { label: "Resolved · Refunded", tone: "muted" },
    resolved_seller_release: { label: "Resolved · Released", tone: "success" },
    resolved_partial: { label: "Resolved · Partial", tone: "muted" },
    withdrawn: { label: "Withdrawn", tone: "muted" },
    closed: { label: "Closed", tone: "muted" },
  },
  buyer: {
    open: { label: "Open", tone: "warning" },
    awaiting_seller_response: { label: "Awaiting Seller", tone: "info" },
    awaiting_buyer_response: { label: "Your Response Needed", tone: "warning" },
    under_review: { label: "SafeDeal Review", tone: "info" },
    resolved_buyer_refund: { label: "Resolved · Refunded", tone: "success" },
    resolved_seller_release: { label: "Resolved · Released to Seller", tone: "muted" },
    resolved_partial: { label: "Resolved · Partial", tone: "muted" },
    withdrawn: { label: "Withdrawn", tone: "muted" },
    closed: { label: "Closed", tone: "muted" },
  },
};

export function resolveDisputeLabel(
  status: DisputeStatus | string,
  audience: Audience,
): LabelEntry {
  return (
    DISPUTE_LABELS[audience][status as DisputeStatus] ??
    ({
      label: String(status).replace(/_/g, " "),
      tone: "muted",
    } satisfies LabelEntry)
  );
}

/* ============================================================
 * INTERNAL REASON COPY
 * Maps DB-internal reason codes (release_review_reason, queue_type) to
 * friendly seller-facing copy. Buyers never see these strings.
 * ============================================================ */

export const INTERNAL_REASON_COPY: Record<string, string> = {
  pricing_missing: "Pricing details incomplete",
  payout_account_missing: "Add a payout account to receive funds",
  silent_dispute: "No buyer confirmation — under SafeDeal review",
  transfer_reversed: "Bank transfer reversed — under SafeDeal review",
  manual_hold: "On hold by SafeDeal",
  delivery_proof_missing: "Delivery proof needed",
  failed_payout: "Bank transfer failed — SafeDeal will retry",
  refund_request: "Refund being processed",
  suspicious_activity: "Account under SafeDeal review",
  stuck: "Awaiting confirmation",
  missing_seller_confirmation: "Awaiting your delivery confirmation",
  missing_buyer_confirmation: "Awaiting buyer confirmation",
  stuck_confirmation: "Awaiting confirmation",
  auto_timeout_24h: "Payment window expired",
};

export function describeInternalReason(reason: string | null | undefined): string {
  if (!reason) return "Awaiting Release";
  return INTERNAL_REASON_COPY[reason] ?? "Under SafeDeal review";
}

/* ============================================================
 * PRODUCT STATUS  (seller-only surface)
 * ============================================================ */

export type ProductStatus =
  | "draft"
  | "published"
  | "out_of_stock"
  | "archived"
  | "deactivated";

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, LabelEntry> = {
  draft: { label: "Draft", tone: "muted" },
  published: { label: "Published", tone: "success" },
  out_of_stock: { label: "Out of Stock", tone: "warning" },
  archived: { label: "Archived", tone: "muted" },
  deactivated: { label: "Deactivated", tone: "destructive" },
};

export function resolveProductStatusLabel(status: string): LabelEntry {
  return (
    PRODUCT_STATUS_LABELS[status as ProductStatus] ??
    ({ label: String(status).replace(/_/g, " "), tone: "muted" } satisfies LabelEntry)
  );
}

export type ProductVisibility = "public" | "private" | "unlisted";

export const PRODUCT_VISIBILITY_LABELS: Record<ProductVisibility, LabelEntry> = {
  public: { label: "Public", tone: "success" },
  private: { label: "Private", tone: "info" },
  unlisted: { label: "Unlisted", tone: "muted" },
};

export function resolveProductVisibilityLabel(visibility: string): LabelEntry {
  return (
    PRODUCT_VISIBILITY_LABELS[visibility as ProductVisibility] ??
    ({ label: String(visibility).replace(/_/g, " "), tone: "muted" } satisfies LabelEntry)
  );
}

/* ============================================================
 * ESCROW STATE  (held / frozen / released / refunded aggregate)
 * ============================================================ */

export type EscrowState =
  | "held"
  | "frozen"
  | "released_to_seller"
  | "refunded_to_buyer";

export const ESCROW_STATE_LABELS: Record<Audience, Record<EscrowState, LabelEntry>> = {
  seller: {
    held: { label: "Held in Escrow", tone: "info" },
    frozen: { label: "Funds Frozen", tone: "destructive" },
    released_to_seller: { label: "Released To You", tone: "success" },
    refunded_to_buyer: { label: "Refunded To Buyer", tone: "muted" },
  },
  buyer: {
    held: { label: "Held in Escrow", tone: "success" },
    frozen: { label: "Funds Frozen", tone: "warning" },
    released_to_seller: { label: "Released To Seller", tone: "muted" },
    refunded_to_buyer: { label: "Refunded To You", tone: "success" },
  },
};

export function resolveEscrowStateLabel(state: string, audience: Audience): LabelEntry {
  return (
    ESCROW_STATE_LABELS[audience][state as EscrowState] ??
    ({ label: String(state).replace(/_/g, " "), tone: "muted" } satisfies LabelEntry)
  );
}

/* ============================================================
 * PAYOUT STATUS
 * ============================================================ */

export type PayoutStatus =
  | "awaiting_release"
  | "blocked"
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled"
  | "reversed";

export const PAYOUT_STATUS_LABELS: Record<PayoutStatus, LabelEntry> = {
  awaiting_release: { label: "Awaiting Release", tone: "info" },
  blocked: { label: "Blocked", tone: "warning" },
  pending: { label: "Queued for Transfer", tone: "info" },
  processing: { label: "Transferring", tone: "info" },
  completed: { label: "Paid Out", tone: "success" },
  failed: { label: "Transfer Failed", tone: "destructive" },
  cancelled: { label: "Cancelled", tone: "muted" },
  reversed: { label: "Reversed", tone: "destructive" },
};

export function resolvePayoutStatusLabel(status: string): LabelEntry {
  return (
    PAYOUT_STATUS_LABELS[status as PayoutStatus] ??
    ({ label: String(status).replace(/_/g, " "), tone: "muted" } satisfies LabelEntry)
  );
}