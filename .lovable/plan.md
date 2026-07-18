# Multi-Tenant Settings — Implementation Audit & Finish Plan

## What is DONE

- **Schema (1a, 1b, 1d partial)**: `system_settings` and `timeout_rules` have `scope`, `vendor_id`, `is_overridable`, `updated_by`, scoped uniqueness. Defaults seeded for pricing/security/timeouts.
- **Resolver (1c)**: `get_effective_settings(_vendor_id, _keys[])` exists and is used server-side.
- **Edge functions (new)**: `admin-system-settings` (GET/PUT + bulk apply + audit log) and `pricing-config` (public read) — both deployed.
- **Server pricing plumbing (2)**: `_shared/pricing.ts` accepts `PricingConfigOverride`; `_shared/settings-resolver.ts` loads it; `create-transaction`, `cart-checkout`, `storefront-checkout`, `claim-offer` all pass vendor config.
- **Admin UI (3a)**: Scope selector, vendor picker, "apply to all vendors" checkbox, mandatory reason, platform-only lock badges on non-overridable fields (base fee, cap, refund policy). Wired to real service.

## What is NOT done (gaps vs the plan)

### High-impact gaps
1. **Client pricing mirror (`src/lib/pricing.ts`)** still uses hardcoded `MIN_PLATFORM_FEE=250` / `MAX_TOTAL_FEE=2500`. Any UI preview (cart, storefront checkout, seller create transaction, buyer payment summary) shows stale numbers if a vendor overrides.
2. **`initiate-paystack-payment`** still calls `computePricing(itemAmount, currency)` with no config — will recompute at pay time using constants and can disagree with the persisted snapshot for overridden vendors.
3. **`_shared/safedeal-money-policy.ts`** not refactored — `MAX_TOTAL_SERVICE_FEE` and version stamp still hardcoded.
4. **Auto-release / timeout consumers** (`_shared/release-core.ts`, `retry-payout`, cron auto-release) still read unscoped `timeout_rules` — vendor overrides for auto-release window are ignored.
5. **`admin-escrow-alert-settings`** not extended for `?vendor_id=` scoping.

### Medium-impact gaps
6. **`useEffectivePricingConfig` hook** not created; no client-side consumer of `pricing-config` yet.
7. **Settings catalog** (`src/lib/settings-catalog.ts`) never created — no single manifest of keys/types/bounds; UI hardcodes the list of fields.
8. **Bounds enforcement in resolver** — vendor writes are not clamped to platform min/max; only the `is_overridable=false` gate exists.
9. **"Vendor overrides" admin tab** — override_counts is returned by the function but no UI tab lists which vendors override which keys with jump-to-vendor links.
10. **Seller "Your effective settings" panel** on `SellerProfileSettings.tsx` not added.

### Low-impact / cosmetic
11. **Field scope badges** only present for the three locked keys; other overridable fields lack an "Overridden by vendor" indicator when viewing vendor scope.
12. **Audit history card** in `AdminSettings.tsx` still renders hardcoded example rows instead of `admin_actions` where `action_type='update_setting'`.
13. **Feature flag** (`settings.resolver_enabled`) not implemented.
14. **Tests** for `computePricing` with override configs not added.

### Confirmed unchanged (correct per plan)
- `verify-paystack-payment`, `paystack-webhook`, `AdminTransactionDetail`, `AdminTransactions` — read persisted snapshot only.

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
