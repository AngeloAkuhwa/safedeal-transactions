/**
 * SINGLE SOURCE OF TRUTH for the support response-time promise and hours.
 *
 * Every screen that states when SafeDeal replies — the public /contact page and
 * the internal /admin/support console — MUST import from here so the promise
 * made to buyers and the target shown to agents can never disagree.
 */

/** Hours during which support is staffed. */
export const SUPPORT_HOURS = "Monday to Friday, 9am – 5pm WAT";

/** The one and only first-response target. */
export const SUPPORT_RESPONSE_TARGET = "1 business day";

/** Buyer-facing promise, used verbatim on /contact. */
export const SUPPORT_RESPONSE_PROMISE =
  `We reply within ${SUPPORT_RESPONSE_TARGET}. Support hours are ${SUPPORT_HOURS}. Messages sent outside those hours are answered the next business day.`;

/** Internal restatement of the same promise for the admin console. */
export const SUPPORT_INTERNAL_SLA =
  `First response target: ${SUPPORT_RESPONSE_TARGET} (${SUPPORT_HOURS}).`;

/** Builds the canonical support deep link used by every "contact support" control. */
export function supportLink(
  reference?: string | null,
  topic: "general" | "transaction" | "payment" | "dispute" | "account" | "report_issue" = "general",
) {
  const params = new URLSearchParams({ topic });
  if (reference) params.set("ref", reference);
  return `/contact?${params.toString()}`;
}
