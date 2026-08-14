/**
 * SINGLE SOURCE OF TRUTH for the support response-time promise and hours.
 *
 * The strings live in `supabase/functions/_shared/support-copy.ts` so the edge
 * functions (acknowledgement + reply emails) and the app read the exact same
 * values. This module only re-exports them.
 */
export {
  SUPPORT_HOURS,
  SUPPORT_RESPONSE_TARGET,
  FUND_RELEASE_REVIEW_TARGET,
  SUPPORT_RESPONSE_PROMISE,
  SUPPORT_INTERNAL_SLA,
  SUPPORT_ACK_SENTENCE,
  supportLink,
} from "../../../supabase/functions/_shared/support-copy";
