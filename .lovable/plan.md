# Multi-Tenant Settings — Re-Audit (verified against the codebase)

I re-checked every item in the previous status doc against the actual files. The picture has moved substantially since that doc was written. Status now is **~95% complete**, not 75%.

## Verified done ✅ (evidence checked this turn)

- **Correctness item 2** — `admin-escrow-alert-settings` supports `?vendor_id=` with `scope`/`vendor_id`/DELETE for vendor overrides. ✅
- **Correctness item 3** — `loadEffectiveTimeoutHours` is imported and used in `create-transaction`, `cart-checkout`, `storefront-checkout`, `claim-offer` for `buyer_verification_timeout`. ✅
- **Admin gap 4** — `src/lib/settings-catalog.ts` + `supabase/functions/_shared/settings-catalog.ts` exist with bounds, types, help text, scope permissions.
- **Admin gap 5** — `admin-system-settings` PUT clamps every write via `clampSetting`; rejects vendor writes to platform-only keys and invalid enum values.
- **Admin gap 6** — Backend returns `vendor_overrides`; `AdminSettings.tsx` renders a "Vendor Overrides" summary section (counts + list of key/vendor/value) on the platform tab.
- **Admin gap 7** — Audit card now fetches real `admin_actions` rows (`fetchSettingsAudit`), parses the JSON note, and shows summary + reason + affected keys + scope pill.
- **Vendor gap 9** — `EffectiveSettingsPanel.tsx` added to `SellerProfileSettings.tsx`, reads from `pricing-config?vendor_id=`.
- **Safety-net gap 10** — Feature flags `SETTINGS_RESOLVER_ENABLED` (server) and `VITE_SETTINGS_RESOLVER_ENABLED` (client) short-circuit both resolvers back to platform defaults.
- **Safety-net gap 11** — `src/lib/__tests__/pricing.test.ts` (12 cases) + `src/lib/__tests__/settings-catalog.test.ts` (5 cases) — 17/17 passing. Covers defaults, floor, cap, vendor override raise/lower, clamping, enum validation, unknown-key passthrough, platform-only rejection.

## Residual gaps ❌ (small, honest list)

1. **Item 8 (partial)** — "Overridden by vendor" badge is wired on `min_platform_fee` and `max_total_service_fee` only. Other overridable fields in the vendor tab (session timeout, refund policy, tier rates, timeout rules, seller override ceilings, escrow alert thresholds) do not yet show the badge when a vendor row exists.

2. **Item 1 (cosmetic)** — `_shared/safedeal-money-policy.ts` still exports `MAX_TOTAL_SERVICE_FEE = 2500` as a constant. It is no longer used to *compute* the cap flag (`is_total_service_fee_capped` is trusted from the persisted row), but the constant and `pricing_model_version` stamp are not config-aware, so a stale value could appear in future readers if someone imports the constant directly.

3. **Item 12** — Snapshot parity test exists on the **client** (`pricing.test.ts` "snapshot parity" block asserts `computePricing(x) === computePricing(x, "NGN", DEFAULT_MIRROR)`). There is no equivalent **server-side** test yet that runs the shared `computePricing` from `supabase/functions/_shared/pricing.ts` with an empty vendor config and asserts byte-identical output to the no-config path.

## Explicitly out of scope (unchanged)

- Auto-release / cron release-core / retry-payout timeout resolver — payouts are admin-triggered.

## Proposal to close to 100%

Small, contained finish pass — do all three in one go:

- **A. Extend override badges (item 8)**  
  Reuse the existing `overriddenKeys` set already populated in `AdminSettings.tsx`. Extend `FeeField`/`TimeoutRow`/`ToggleRow` to accept `overridden?: boolean` (FeeField already does) and pass `isOverridden(key)` for every remaining vendor-writable field: `security.session_timeout_minutes`, `fees.refund_policy`, `pricing.tier_rates`, each `timeout_rules.rule_type`, `escrow.alert_thresholds.*`, and seller override ceilings.

- **B. Wire pricing_model_version to config (item 1)**  
  In `_shared/safedeal-money-policy.ts`, compute the version stamp from the effective config (hash of `min_platform_fee`+`max_total_service_fee`+`tier_rates`) instead of a static string. Keep `MAX_TOTAL_SERVICE_FEE_FALLBACK` as the labelled fallback, delete the plain re-export so no caller can pick up a stale hardcoded cap.

- **C. Server snapshot parity test (item 12)**  
  Add `supabase/functions/_shared/__tests__/pricing.parity.test.ts` (Deno test) that imports the server `computePricing`, runs the same `AMOUNTS` grid, and asserts `computePricing(x) deepEquals computePricing(x, "NGN", {})` and `deepEquals computePricing(x, "NGN", DEFAULT_MIRROR)`. Guarantees no drift between "no override" and "override that matches the default".

Estimated size: ~120 LOC across 4 files, zero migrations, zero UI redesign.

Confirm and I'll execute A + B + C to close it out at 100%.
