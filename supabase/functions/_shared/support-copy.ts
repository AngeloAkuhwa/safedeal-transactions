/**
 * CANONICAL support promise strings, shared by the app and edge functions.
 * `src/lib/support/support-copy.ts` re-exports this module, so the promise made
 * to buyers, the acknowledgement email, and the admin console can never diverge.
 */

/** Hours during which support is staffed. */
export const SUPPORT_HOURS = "Monday to Friday, 9am – 5pm WAT";

/** The one and only first-response target. */
export const SUPPORT_RESPONSE_TARGET = "1 business day";

/** How long a confirmed transaction waits in SafeDeal review before release. */
export const FUND_RELEASE_REVIEW_TARGET = SUPPORT_RESPONSE_TARGET;

/** Buyer-facing promise, used verbatim on /contact. */
export const SUPPORT_RESPONSE_PROMISE =
  `We reply within ${SUPPORT_RESPONSE_TARGET}. Support hours are ${SUPPORT_HOURS}. Messages sent outside those hours are answered the next business day.`;

/** Internal restatement of the same promise for the admin console. */
export const SUPPORT_INTERNAL_SLA =
  `First response target: ${SUPPORT_RESPONSE_TARGET} (${SUPPORT_HOURS}).`;

/** Sentence used in the acknowledgement email. */
export const SUPPORT_ACK_SENTENCE =
  `A support agent replies within ${SUPPORT_RESPONSE_TARGET} (${SUPPORT_HOURS}).`;

/** Builds the canonical support deep link used by every "contact support" control. */
export function supportLink(
  reference?: string | null,
  topic: "general" | "transaction" | "payment" | "dispute" | "account" | "report_issue" = "general",
) {
  const params = new URLSearchParams({ topic });
  if (reference) params.set("ref", reference);
  return `/contact?${params.toString()}`;
}
