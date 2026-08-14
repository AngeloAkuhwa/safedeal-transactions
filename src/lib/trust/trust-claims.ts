/**
 * SINGLE SOURCE OF TRUTH for every user-facing trust / protection claim.
 *
 * A "trust claim" is any string that tells a user something is verified,
 * protected, tracked or guaranteed. Every entry declares BOTH the text and the
 * condition that must hold for the text to be shown. `ALWAYS_TRUE` is only
 * allowed where the claim is structurally true for every transaction.
 *
 * A contract test (`trust-claims.contract.test.ts`) fails the build if any of
 * these strings appears as a literal anywhere under `src/pages` or
 * `src/components`, so a new screen cannot ship an ungated claim.
 */

export type TrustCondition =
  /** Structurally true for every transaction on the platform. */
  | "ALWAYS_TRUE"
  /** `account_verifications.identity_verified` is true for the seller. */
  | "SELLER_ID_VERIFIED"
  /** `account_verifications.email_verified` is true for the seller. */
  | "SELLER_EMAIL_VERIFIED"
  /** `account_verifications.phone_verified` is true for the seller. */
  | "SELLER_PHONE_VERIFIED"
  /** Seller's computed `verification_level` is trusted_buyer/high_trust_buyer. */
  | "SELLER_TRUST_LEVEL_VERIFIED"
  /** The chosen/booked delivery method is courier-tracked. */
  | "DELIVERY_IS_TRACKED"
  /** The chosen/booked delivery method is confirmed by handover code. */
  | "DELIVERY_IS_CODE_CONFIRMED";

export interface TrustClaim {
  /** The exact user-facing text. */
  readonly text: string;
  /** What must be true for this text to render. */
  readonly condition: TrustCondition;
  /** Where the condition is read from — auditable in one place. */
  readonly basis: string;
}

const claim = (text: string, condition: TrustCondition, basis: string): TrustClaim =>
  ({ text, condition, basis });

export const TRUST_CLAIMS = {
  /** Every paid transaction routes funds into escrow before release. */
  ESCROW_PROTECTED: claim(
    "Escrow Protected",
    "ALWAYS_TRUE",
    "Every paid transaction books funds into escrow_ledger_entries before any release.",
  ),
  ESCROW_PROTECTION_HEADING: claim(
    "SafeDeal Escrow Protection",
    "ALWAYS_TRUE",
    "Same as ESCROW_PROTECTED — heading form.",
  ),
  ESCROW_HANDLER_LABEL: claim(
    "Payment handled by",
    "ALWAYS_TRUE",
    "Label only; the payment leg is always escrowed. Delivery is NOT handled by SafeDeal.",
  ),
  ESCROW_HANDLER_VALUE: claim(
    "SafeDeal Escrow",
    "ALWAYS_TRUE",
    "Funds are held by SafeDeal escrow for every paid transaction.",
  ),

  SELLER_ID_VERIFIED: claim(
    "ID Verified Seller",
    "SELLER_ID_VERIFIED",
    "account_verifications.identity_verified === true",
  ),
  SELLER_VERIFIED: claim(
    "Verified Seller",
    "SELLER_EMAIL_VERIFIED",
    "account_verifications.email_verified === true (weakest verification we will label).",
  ),
  SELLER_LEVEL_VERIFIED: claim(
    "Verified Seller",
    "SELLER_TRUST_LEVEL_VERIFIED",
    "compute_verification_level() returned trusted_buyer or high_trust_buyer.",
  ),
  SELLER_PHONE_VERIFIED: claim(
    "Phone Verified",
    "SELLER_PHONE_VERIFIED",
    "account_verifications.phone_verified === true",
  ),
  SELLER_TRUST_PROFILE_HEADING: claim(
    "Seller Trust Profile",
    "ALWAYS_TRUE",
    "Neutral heading over per-signal tiles that each render their own real state.",
  ),

  DELIVERY_TRACKED: claim(
    "Courier tracking required",
    "DELIVERY_IS_TRACKED",
    "Delivery method is courier-based; tracking is mandatory before release.",
  ),
  DELIVERY_CODE_CONFIRMED: claim(
    "Confirmed with a delivery code",
    "DELIVERY_IS_CODE_CONFIRMED",
    "Delivery method is hand_delivery / meetup / pickup; handover uses a delivery token.",
  ),
} as const;

/** Delivery methods where no courier tracking number exists. */
export const UNTRACKED_DELIVERY_METHODS = [
  "hand_delivery",
  "meetup",
  "pickup",
  "digital",
  "digital_delivery",
] as const;

export function isTrackedDelivery(method?: string | null): boolean {
  if (!method) return false;
  return !(UNTRACKED_DELIVERY_METHODS as readonly string[]).includes(method);
}

/**
 * Resolves the strongest seller verification claim that real data supports.
 * Returns `null` when nothing is verified — callers must render nothing.
 */
export function sellerVerificationClaim(input: {
  identityVerified?: boolean | null;
  emailVerified?: boolean | null;
}): TrustClaim | null {
  if (input.identityVerified) return TRUST_CLAIMS.SELLER_ID_VERIFIED;
  if (input.emailVerified) return TRUST_CLAIMS.SELLER_VERIFIED;
  return null;
}

/** Every claim text that may never appear as a literal outside this module. */
export const ALL_TRUST_CLAIM_TEXTS: readonly string[] = Array.from(
  new Set(Object.values(TRUST_CLAIMS).map((c) => c.text)),
);