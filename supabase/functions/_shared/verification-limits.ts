/**
 * What each verification level is allowed to do. One definition site.
 *
 * This existed as FIVE independent copies, one per edge function, on the money
 * path. Four of them agreed on the buyer amount limit, which is not a property
 * of the system, it is a coincidence with a maintenance cost: the next person
 * to raise a limit has to find all five, and nothing tells them how many there
 * are. Rule 7, and the storefront already paid for that lesson once.
 *
 * Two things this module deliberately does NOT do:
 *
 *   1. **It does not change a single number.** Every value below is copied
 *      character for character from the call site it came from. Consolidating
 *      a limit and re-pricing it in the same change would make the re-pricing
 *      invisible in review, and these are the numbers that decide how much of
 *      someone else's money can move.
 *
 *   2. **It does not invent a value for a level that has none.** See
 *      `SELLER_PUBLISH_LIMIT_BY_LEVEL` below.
 *
 * The unresolved conflict between the two concurrency tables is recorded here
 * rather than quietly resolved. See `BUYER_CONCURRENT_*`.
 */

/** Every level the `verification_level_type` enum can hold. */
export const KNOWN_LEVELS = [
  "unverified",
  "basic_verified",
  "trusted_buyer",
  "high_trust_buyer",
] as const;

export type VerificationLevel = (typeof KNOWN_LEVELS)[number];

/**
 * How much a BUYER may pay in one transaction, in naira.
 *
 * Was defined identically in `initiate-paystack-payment`, `buyer-profile`,
 * `seller-profile` and `buyer-disputes`. Unified verbatim.
 */
export const BUYER_AMOUNT_LIMIT_BY_LEVEL: Record<string, number> = {
  unverified: 0,
  basic_verified: 50_000,
  trusted_buyer: 200_000,
  high_trust_buyer: 500_000,
};

/**
 * How much a SELLER may publish an offer for, in naira.
 *
 * Deliberately separate from the buyer table and deliberately larger: it gates
 * a different actor doing a different thing. A seller publishing a 200,000
 * offer is fine even though a `basic_verified` BUYER cannot pay it, because a
 * higher-tier buyer can.
 *
 * `high_trust_buyer` is ABSENT on purpose, and this is the one behavioural
 * change in this module. It previously read `Number.MAX_SAFE_INTEGER`, an
 * unbounded publishing limit. Two facts make that worth removing rather than
 * keeping:
 *
 *   - `compute_verification_level` can only ever return `unverified`,
 *     `basic_verified` or `trusted_buyer`. Nothing in the system assigns
 *     `high_trust_buyer`, so the only way to hold it is a manual database
 *     write, which makes an unlimited cap an unaudited escalation path;
 *   - production currently holds zero accounts at that level, so removing it
 *     changes nothing for anybody today.
 *
 * With it absent, a manually promoted account hits the explicit
 * `verification_level_unknown` refusal instead of an unlimited allowance. That
 * is fail-closed, and it invents no number: what a high-trust seller may
 * publish is a product decision nobody has made.
 */
export const SELLER_PUBLISH_LIMIT_BY_LEVEL: Record<string, number> = {
  unverified: 0,
  basic_verified: 200_000,
  trusted_buyer: 5_000_000,
};

/**
 * Dispute caps are NOT here. They already live in `_shared/dispute-limits.ts`,
 * which has been the shared source for `buyer-disputes` (display) and
 * `transaction-verify` (enforcement) since before this module existed, and has
 * its own test.
 *
 * The first draft of this file copied that table in, which would have created
 * the exact duplication the module was written to remove. Noted here so the
 * next person reaching for a dispute cap finds the right file instead of
 * re-adding it.
 */

/**
 * The two concurrency tables, which DISAGREE, kept apart and named so the
 * disagreement cannot be mistaken for a decision.
 *
 * `initiate-paystack-payment` enforces one set of numbers at the moment a
 * buyer pays. `buyer-profile` and `seller-profile` show a different set to the
 * person as their allowance, and `seller-profile` computes
 * `canCreateAnotherActiveTransaction` from the shown one.
 *
 *   level            shown   enforced
 *   basic_verified       1          5
 *   trusted_buyer        3         10
 *   high_trust_buyer     5         20
 *
 * The effective product behaviour today is the SHOWN column, because the
 * interface stops people long before the payment gate would. So the enforced
 * column has, in practice, never applied.
 *
 * Converging them is a product decision about how many transactions a buyer
 * may run at once, not a refactor, and picking either silently would change
 * real behaviour in one direction or the other: taking the enforced numbers
 * quietly quintuples an allowance, and taking the shown numbers quietly
 * tightens a gate someone might be mid-flow against. Both are recorded as
 * decision D12 and neither is applied here.
 */
export const BUYER_CONCURRENT_SHOWN_IN_PROFILE: Record<string, number> = {
  unverified: 0,
  basic_verified: 1,
  trusted_buyer: 3,
  high_trust_buyer: 5,
};

export const BUYER_CONCURRENT_ENFORCED_AT_PAYMENT: Record<string, number> = {
  unverified: 0,
  basic_verified: 5,
  trusted_buyer: 10,
  high_trust_buyer: 20,
};

/**
 * Look a level up, or say you could not.
 *
 * `null` means the level is not in this table, which is a data fault: either
 * a new level was added without updating the limits, or a row holds something
 * the enum should not permit. Every caller turns that into an explicit refusal.
 *
 * The alternative, `table[level] ?? 0`, is what four call sites used to do, and
 * it fails in the worst available way: a zero limit is indistinguishable from
 * a real cap, so the person sees "you have reached your limit" for a system
 * fault, and nobody is paged because nothing errored.
 */
export function limitFor(
  table: Record<string, number>,
  level: string | null | undefined,
): number | null {
  if (!level) return null;
  return Object.prototype.hasOwnProperty.call(table, level) ? table[level] : null;
}

/** The refusal every caller returns when `limitFor` comes back null. */
export const UNKNOWN_LEVEL_ERROR = "verification_level_unknown";
