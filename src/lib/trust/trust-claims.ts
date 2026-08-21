/**
 * SINGLE SOURCE OF TRUTH for every user-facing trust / protection claim.
 *
 * PHASE 0g: the claim TEXT is no longer reachable. `TRUST_CLAIMS` is module
 * private and `.text` is never exported. The only way to obtain a claim string
 * is through a resolver whose evidence parameter is typed by the claim's own
 * condition, so a call site physically cannot render "Verified Seller" without
 * handing over identity data, nor "Escrow Protection Active" without escrow
 * state. The resolver returns `null` when the evidence does not support the
 * claim and the caller must render nothing.
 *
 * A contract test (`trust-claims.contract.test.ts`) fails the build if any of
 * these strings appears as a literal anywhere under `src/` or
 * `supabase/functions/`, and if `.text` is accessed outside this file.
 */

import { toTransactionDeliveryMethod, type TransactionDeliveryMethod } from "@/lib/delivery-methods";

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

interface TrustClaim {
  /** The exact user-facing text. Never exported. */
  readonly text: string;
  /** What must be true for this text to render. */
  readonly condition: TrustCondition;
  /** Where the condition is read from. Auditable in one place. */
  readonly basis: string;
}

const claim = <C extends TrustCondition>(text: string, condition: C, basis: string) =>
  ({ text, condition, basis }) as { readonly text: string; readonly condition: C; readonly basis: string };

const TRUST_CLAIMS = {
  /** Every paid transaction routes funds into escrow before release. */
  ESCROW_PROTECTED: claim(
    "Escrow Protected",
    "ALWAYS_TRUE",
    "Every paid transaction books funds into escrow_ledger_entries before any release.",
  ),
  ESCROW_PROTECTION_HEADING: claim(
    "SafeDeal Escrow Protection",
    "ALWAYS_TRUE",
    "Same as ESCROW_PROTECTED: heading form.",
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
  /** Present tense: only true once money is actually sitting in escrow. */
  ESCROW_ACTIVE: claim(
    "Escrow Protection Active",
    "FUNDS_HELD_IN_ESCROW",
    "escrow.state === 'held': escrow_ledger_entries booked and not yet released or refunded.",
  ),
  PAYMENT_PROTECTED_NOW: claim(
    "Your payment is protected",
    "FUNDS_HELD_IN_ESCROW",
    "Funds are booked into escrow; release requires buyer confirmation or dispute resolution.",
  ),
  MONEY_PROTECTED_NOW: claim(
    "Your money is protected",
    "FUNDS_HELD_IN_ESCROW",
    "Same basis as PAYMENT_PROTECTED_NOW. Money wording.",
  ),
  /** Future tense: safe to show before payment because it describes what will happen. */
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

export type TrustClaimKey = keyof typeof TRUST_CLAIMS;
type ConditionOf<K extends TrustClaimKey> = (typeof TRUST_CLAIMS)[K]["condition"];

/** The proof each condition demands. TypeScript refuses a call without it. */
export interface TrustEvidenceMap {
  ALWAYS_TRUE: undefined;
  SELLER_ID_VERIFIED: { identityVerified: boolean | null | undefined };
  SELLER_PHONE_VERIFIED: { phoneVerified: boolean | null | undefined };
  DELIVERY_IS_TRACKED: { deliveryMethod: string | null | undefined };
  DELIVERY_IS_CODE_CONFIRMED: { deliveryMethod: string | null | undefined };
  FUNDS_HELD_IN_ESCROW: { escrowState: string | null | undefined };
}

type AlwaysTrueKey = { [K in TrustClaimKey]: ConditionOf<K> extends "ALWAYS_TRUE" ? K : never }[TrustClaimKey];
type ConditionalKey = Exclude<TrustClaimKey, AlwaysTrueKey>;

/**
 * Closed allowlist: unknown or missing methods never earn a tracking claim.
 * Verified against the live `delivery_method_type` enum, whose only members are
 * courier / pickup / meetup / hand_delivery.
 */
export const TRACKED_DELIVERY_METHODS = ["courier"] as const;
const CODE_CONFIRMED_DELIVERY_METHODS = ["pickup", "meetup", "hand_delivery"] as const;

/**
 * Delivery evidence arrives in two vocabularies: the transaction enum
 * (`courier` …) and product-listing strings (`courier_shipping`, `delivery` …).
 * Resolvers normalise first, so a listing-vocabulary value earns the claim it
 * genuinely supports instead of silently resolving to null.
 */
function normalizeDeliveryEvidence(method?: string | null): TransactionDeliveryMethod | null {
  return toTransactionDeliveryMethod(method);
}

export function isTrackedDelivery(method?: string | null): boolean {
  const normalized = normalizeDeliveryEvidence(method);
  if (!normalized) return false;
  return (TRACKED_DELIVERY_METHODS as readonly string[]).includes(normalized);
}

function holdsEscrow(state?: string | null): boolean {
  return state === "held" || state === "funds_held_in_escrow" || state === "payment_secured";
}

function satisfied<C extends TrustCondition>(condition: C, evidence: TrustEvidenceMap[C]): boolean {
  switch (condition) {
    case "ALWAYS_TRUE":
      return true;
    case "SELLER_ID_VERIFIED":
      return (evidence as TrustEvidenceMap["SELLER_ID_VERIFIED"]).identityVerified === true;
    case "SELLER_PHONE_VERIFIED":
      return (evidence as TrustEvidenceMap["SELLER_PHONE_VERIFIED"]).phoneVerified === true;
    case "DELIVERY_IS_TRACKED":
      return isTrackedDelivery((evidence as TrustEvidenceMap["DELIVERY_IS_TRACKED"]).deliveryMethod);
    case "DELIVERY_IS_CODE_CONFIRMED": {
      const m = normalizeDeliveryEvidence(
        (evidence as TrustEvidenceMap["DELIVERY_IS_CODE_CONFIRMED"]).deliveryMethod,
      );
      return !!m && (CODE_CONFIRMED_DELIVERY_METHODS as readonly string[]).includes(m);
    }
    case "FUNDS_HELD_IN_ESCROW":
      return holdsEscrow((evidence as TrustEvidenceMap["FUNDS_HELD_IN_ESCROW"]).escrowState);
    default:
      return false;
  }
}

/**
 * Resolves a conditional claim against real evidence.
 * Returns the text, or `null` when the evidence does not support it —
 * callers MUST render nothing on `null`.
 */
export function resolveClaim<K extends ConditionalKey>(
  key: K,
  evidence: TrustEvidenceMap[ConditionOf<K>],
): string | null {
  const c = TRUST_CLAIMS[key];
  return satisfied(c.condition, evidence as TrustEvidenceMap[TrustCondition]) ? c.text : null;
}

/** Claims that are structurally true for every transaction. No evidence exists to demand. */
export function alwaysClaim(key: AlwaysTrueKey): string {
  return TRUST_CLAIMS[key].text;
}

/**
 * Resolves the strongest seller verification claim that real data supports.
 * Returns `null` when identity is not verified: callers must render nothing.
 */
export function sellerVerificationClaim(input: {
  identityVerified?: boolean | null;
}): string | null {
  return resolveClaim("SELLER_ID_VERIFIED", { identityVerified: input.identityVerified });
}

/** Condition + basis for audit tooling. Deliberately excludes `text`. */
export const TRUST_CLAIM_META: Record<TrustClaimKey, { condition: TrustCondition; basis: string }> =
  Object.fromEntries(
    Object.entries(TRUST_CLAIMS).map(([k, v]) => [k, { condition: v.condition, basis: v.basis }]),
  ) as Record<TrustClaimKey, { condition: TrustCondition; basis: string }>;

/** Every claim text that may never appear as a literal outside this module. */
export const ALL_TRUST_CLAIM_TEXTS: readonly string[] = Array.from(
  new Set(Object.values(TRUST_CLAIMS).map((c) => c.text)),
);
