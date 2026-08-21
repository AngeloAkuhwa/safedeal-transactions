/**
 * Launch-region constants.
 *
 * SafeDeal's checkout currently collects addresses for a single serviceable
 * launch region. The country code is NOT a per-order input and must never be
 * written as a bare literal at a call site. That reads like a value the buyer
 * supplied. Name it here so widening the rollout is one edit, and so the
 * `serviceable_regions` gate and the address writer can never disagree.
 */
export const LAUNCH_REGION_COUNTRY_CODE = "NG";
export const LAUNCH_REGION_NAME = "Nigeria";
