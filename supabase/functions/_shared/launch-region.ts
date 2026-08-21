/**
 * Edge mirror of `src/lib/launch-region.ts`.
 *
 * The launch region is a deliberate platform fact, not a per-record default.
 * Use it for region LOOKUPS (which regions we serve). Never use it to fill in
 * a country a user or a seller never supplied. An absent country must stay
 * `null`.
 */
export const LAUNCH_REGION_COUNTRY_CODE = "NG";
export const LAUNCH_REGION_NAME = "Nigeria";
