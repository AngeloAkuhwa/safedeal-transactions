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
  /** `account_verifications.phone_verified` is true for the seller. */
  | "SELLER_PHONE_VERIFIED"
  /** The chosen/booked delivery method is courier-tracked. */
  | "DELIVERY_IS_TRACKED"
  /** The chosen/booked delivery method is confirmed by handover code. */
  | "DELIVERY_IS_CODE_CONFIRMED"
  /** Funds for this transaction are currently held in escrow (post-payment). */
  | "FUNDS_HELD_IN_ESCROW";

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
  /** Present tense — only true once money is actually sitting in escrow. */
  ESCROW_ACTIVE: claim(
    "Escrow Protection Active",
    "FUNDS_HELD_IN_ESCROW",
    "transactions.payment_status === 'payment_secured' / funds_held_in_escrow — escrow_ledger_entries booked.",
  ),
  PAYMENT_PROTECTED_NOW: claim(
    "Your payment is protected",
    "FUNDS_HELD_IN_ESCROW",
    "Funds are booked into escrow; release requires buyer confirmation or dispute resolution.",
  ),
  MONEY_PROTECTED_NOW: claim(
    "Your money is protected",
    "FUNDS_HELD_IN_ESCROW",
    "Same basis as PAYMENT_PROTECTED_NOW — money wording.",
  ),
  /** Future tense — safe to show before payment because it describes what will happen. */
  PAYMENT_WILL_BE_ESCROWED: claim(
    "Your payment will be held in escrow until you confirm the item",
    "ALWAYS_TRUE",
    "Every payment routes into escrow before release; stated in the future tense pre-payment.",
  ),

  SELLER_ID_VERIFIED: claim(
    "ID Verified Seller",
    "SELLER_ID_VERIFIED",
    "account_verifications.identity_verified === true",
  ),
  SELLER_VERIFIED: claim(
    "Verified Seller",
    "SELLER_ID_VERIFIED",
    "account_verifications.identity_verified === true; email or phone confirmation alone never earns this badge.",
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

/**
 * Closed allowlist: unknown or missing methods never earn a tracking claim.
 * Verified against the live `delivery_method_type` enum, whose only members are
 * courier / pickup / meetup / hand_delivery. `courier` is the only tracked one;
 * the previously listed aliases (`shipping`, `standard_delivery`, `delivery`)
 * are not storable values and `delivery` was ambiguous with hand delivery.
 */
export const TRACKED_DELIVERY_METHODS = ["courier"] as const;

export function isTrackedDelivery(method?: string | null): boolean {
  if (!method) return false;
  return (TRACKED_DELIVERY_METHODS as readonly string[]).includes(method);
}

/**
 * Resolves the strongest seller verification claim that real data supports.
 * Returns `null` when nothing is verified — callers must render nothing.
 */
export function sellerVerificationClaim(input: {
  identityVerified?: boolean | null;
}): TrustClaim | null {
  if (input.identityVerified) return TRUST_CLAIMS.SELLER_ID_VERIFIED;
  return null;
}

/** Every claim text that may never appear as a literal outside this module. */
export const ALL_TRUST_CLAIM_TEXTS: readonly string[] = Array.from(
  new Set(Object.values(TRUST_CLAIMS).map((c) => c.text)),
);