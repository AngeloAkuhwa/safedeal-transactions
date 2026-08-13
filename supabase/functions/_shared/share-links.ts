/**
 * Shared rules for transaction share links (`transaction_links`).
 *
 * Links are pre-authentication surfaces: anyone holding the token can read the
 * agreement. They therefore MUST expire, and actions taken through them must be
 * authorised against the real transaction parties.
 */

export const SHARE_LINK_TTL_DAYS = 14;

/** ISO timestamp for a freshly minted link's expiry (now + 14 days). */
export function shareLinkExpiresAt(from: Date = new Date()): string {
  return new Date(from.getTime() + SHARE_LINK_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export function isShareLinkExpired(
  expiresAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  return !!expiresAt && new Date(expiresAt) < now;
}

export const CANCELLABLE_STATUSES = ["draft", "awaiting_buyer", "awaiting_payment"] as const;

export interface CancelActor {
  userId: string;
  email?: string | null;
}

export interface CancelTargetTransaction {
  seller_id: string | null;
  buyer_id: string | null;
  buyer_contact_email?: string | null;
}

/**
 * Who may cancel a pending transaction through a share link:
 *  - the transaction's buyer, or
 *  - the transaction's seller, or
 *  - when no buyer has been bound yet, the invited buyer identified by the
 *    contact email the seller addressed the link to.
 * Everyone else (including random holders of the token) is rejected.
 */
export function resolveCancelActorRole(
  actor: CancelActor,
  tx: CancelTargetTransaction,
): "buyer" | "seller" | "invited_buyer" | null {
  if (!actor?.userId) return null;
  if (tx.buyer_id && tx.buyer_id === actor.userId) return "buyer";
  if (tx.seller_id && tx.seller_id === actor.userId) return "seller";
  if (!tx.buyer_id && tx.buyer_contact_email && actor.email) {
    if (tx.buyer_contact_email.trim().toLowerCase() === actor.email.trim().toLowerCase()) {
      return "invited_buyer";
    }
  }
  return null;
}

export function canCancelTransaction(actor: CancelActor, tx: CancelTargetTransaction): boolean {
  return resolveCancelActorRole(actor, tx) !== null;
}
