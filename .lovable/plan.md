# Multi-Tenant Settings — Implementation Audit & Finish Plan

**Auto-release out of scope this phase** — admin manually triggers payouts, so
release-core / retry-payout / cron auto-release timeout wiring is skipped.

## What is DONE

- **Schema (1a, 1b, 1d partial)**: `system_settings` and `timeout_rules` have `scope`, `vendor_id`, `is_overridable`, `updated_by`, scoped uniqueness. Defaults seeded for pricing/security/timeouts.
- **Resolver (1c)**: `get_effective_settings(_vendor_id, _keys[])` exists and is used server-side.
- **Edge functions (new)**: `admin-system-settings` (GET/PUT + bulk apply + audit log) and `pricing-config` (public read) — both deployed.
- **Server pricing plumbing (2)**: `_shared/pricing.ts` and `_shared/safedeal-money-policy.ts` accept `PricingConfigOverride`; `_shared/settings-resolver.ts` loads it; `create-transaction`, `cart-checkout`, `storefront-checkout`, `claim-offer`, `initiate-paystack-payment` all pass vendor config.
- **Client pricing mirror (3b)**: `src/lib/pricing.ts` accepts overrides; `useEffectivePricingConfig` hook fetches from `pricing-config`; wired into `StorefrontCheckout`, `BuyerCart`, `CartCheckoutReview`, `SellerCreateTransaction`.
- **Verification timeout wiring**: `loadEffectiveTimeoutHours(vendor, 'buyer_verification_timeout', fallback)` resolves per-vendor overrides at term-creation time in `create-transaction`, `storefront-checkout`, `cart-checkout`, `claim-offer` (falls back to product value → platform default).
- **Escrow alert vendor scope**: `admin-escrow-alert-settings` accepts `?vendor_id=<uuid>` for GET/PUT/DELETE, returning platform baseline + effective vendor value, and writes audit rows.
- **Admin UI (3a)**: Scope selector, vendor picker, "apply to all vendors" checkbox, mandatory reason, platform-only lock badges on non-overridable fields (base fee, cap, refund policy). Wired to real service.

## What is NOT done (gaps vs the plan)

### Medium-impact gaps
1. **Settings catalog** (`src/lib/settings-catalog.ts`) never created — no single manifest of keys/types/bounds; UI hardcodes the list of fields.
2. **Bounds enforcement in resolver** — vendor writes are not clamped to platform min/max; only the `is_overridable=false` gate exists.
3. **"Vendor overrides" admin tab** — override_counts is returned by the function but no UI tab lists which vendors override which keys with jump-to-vendor links.
4. **Seller "Your effective settings" panel** on `SellerProfileSettings.tsx` not added.

### Low-impact / cosmetic
5. **Field scope badges** only present for the three locked keys; other overridable fields lack an "Overridden by vendor" indicator when viewing vendor scope.
6. **Audit history card** in `AdminSettings.tsx` still renders hardcoded example rows instead of `admin_actions` where `action_type='update_setting'`.
7. **Feature flag** (`settings.resolver_enabled`) not implemented.
8. **Tests** for `computePricing` with override configs not added.

### Confirmed unchanged (correct per plan)
- `verify-paystack-payment`, `paystack-webhook`, `AdminTransactionDetail`, `AdminTransactions` — read persisted snapshot only.
- Auto-release consumers — intentionally skipped (admin-triggered payouts).

## Suggested finish order (if you approve)

**Phase A — Correctness (must-fix so overrides actually take effect):**
- Refactor `src/lib/pricing.ts` to accept optional config; add `useEffectivePricingConfig(vendorId)` calling `pricing-config`; thread through cart, checkout, storefront, seller create-tx previews.
- Patch `initiate-paystack-payment` to `loadPricingConfig(sellerId)` before recompute (or better: reuse persisted snapshot).
- Refactor `_shared/safedeal-money-policy.ts` to accept config.
- Wire auto-release / release-core to `get_effective_timeout(vendor)`.

**Phase B — Admin completeness:**
- Build `src/lib/settings-catalog.ts` manifest and render `AdminSettings.tsx` from it (drops hardcoded field list, adds bounds).
- Add bounds clamping in `admin-system-settings` PUT.
- Add "Vendor overrides" tab using `override_counts` + a drilldown query.
- Replace mock audit rows with real `admin_actions` fetch.

**Phase C — Vendor visibility:**
- Extend `admin-escrow-alert-settings` for vendor scope.
- Add read-only "Your effective settings" panel on `SellerProfileSettings.tsx`.

**Phase D — Safety net:**
- Feature flag + unit/integration tests for pricing under all three scope modes.

Confirm and I'll execute Phase A first (the only phase that changes user-observable behavior); B–D can follow independently.
