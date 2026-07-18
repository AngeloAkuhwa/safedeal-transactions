# Multi-Tenant System Settings — Scoped Overrides Plan

Turn the Admin Settings page into the single source of truth for every configurable knob, with three scopes:

- **Platform** — global default applied to every vendor unless overridden. Also the enforced ceiling/floor.
- **Vendor** — override for one specific vendor. Falls back to Platform if unset.
- **Bulk apply-to-all** — write the Platform value AND wipe all vendor overrides (opt-in "reset overrides" checkbox).

Some keys are **platform-locked** (never overridable by vendor, e.g. base SafeDeal protection fee floor/cap, KYC threshold). Others are **vendor-overridable** (e.g. auto-release window, fulfillment SLA, notification channels, delivery methods offered). The admin page marks each field with a scope badge and, for vendor-overridable keys, adds a "Vendor scope" selector (All vendors / specific vendor).

---

## 1. Data model changes

### 1a. `system_settings` — add scope + vendor
```
ALTER TABLE public.system_settings
  ADD COLUMN scope TEXT NOT NULL DEFAULT 'platform'  -- 'platform' | 'vendor'
    CHECK (scope IN ('platform','vendor')),
  ADD COLUMN vendor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN is_overridable BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN updated_by UUID REFERENCES public.profiles(id);

-- Drop old UNIQUE(setting_key), replace with scoped uniqueness
DROP INDEX IF EXISTS system_settings_setting_key_key;
CREATE UNIQUE INDEX system_settings_scope_key_vendor
  ON public.system_settings (setting_key, scope, COALESCE(vendor_id, '00000000-0000-0000-0000-000000000000'));

-- Guard: vendor rows must have vendor_id, platform rows must not
ALTER TABLE public.system_settings ADD CONSTRAINT chk_scope_vendor
  CHECK ((scope='platform' AND vendor_id IS NULL) OR (scope='vendor' AND vendor_id IS NOT NULL));
```

### 1b. `timeout_rules` — same scoping
Add `scope`, `vendor_id`, adjust UNIQUE(rule_type) → UNIQUE(rule_type, scope, vendor_id).

### 1c. Resolver RPC (security definer)
```
create or replace function public.get_effective_setting(_vendor_id uuid, _key text)
returns jsonb language sql stable security definer set search_path=public as $$
  select setting_value from public.system_settings
   where setting_key = _key
     and ((scope='vendor' and vendor_id = _vendor_id) or scope='platform')
   order by (scope='vendor') desc  -- vendor row wins
   limit 1;
$$;
```
Plus `get_effective_timeout(_vendor_id, _rule_type)` and a batch variant `get_effective_settings(_vendor_id, _keys text[])` for edge functions that need many keys in one round-trip.

### 1d. Settings catalog seed
A JSON manifest (`src/lib/settings-catalog.ts` + seed migration) declaring every key, its type, default, `is_overridable`, min/max bounds, and which module consumes it. This is what the Admin UI renders and what the resolver validates against.

---

## 2. Backend edge function changes

Every function currently reading hardcoded values must call the resolver with the transaction's `seller_id` (vendor). Impacted files and the fix:

| File | Hardcoded today | Fix |
|---|---|---|
| `supabase/functions/_shared/pricing.ts` | `MIN_PLATFORM_FEE=250`, `MAX_TOTAL_FEE=2500`, tier rates | Accept a `PricingConfig` arg; caller loads it via resolver keyed by vendor. Keep constants as fallback defaults only. |
| `supabase/functions/_shared/safedeal-money-policy.ts` | `MAX_TOTAL_SERVICE_FEE=2500`, `PRICING_MODEL_VERSION` | Read from resolver; version stamp still persisted per transaction for immutability. |
| `create-transaction`, `cart-checkout`, `storefront-checkout`, `claim-offer` | call `computePricing` with no vendor config | Load effective pricing config for `seller_id`, pass into `buildPricingSnapshot`. |
| `verify-paystack-payment`, `paystack-webhook` | use persisted snapshot (OK) | No change — snapshot immutability preserved. |
| `retry-payout`, `_shared/release-core.ts` | auto-release window hardcoded / from `timeout_rules` unscoped | Use `get_effective_timeout(seller_id, 'auto_release_hours')`. |
| `admin-escrow-alert-settings` | reads `escrow_alert_thresholds` platform-only | Extend to accept `?vendor_id=` and write vendor-scoped row. |
| `admin-escrow-overview`, `admin-dashboard`, `admin-payouts-*`, `admin-transaction-detail`, `transaction-detail`, `seller-transaction-detail`, `transaction-agreement`, `resolve-share-token`, `initiate-paystack-payment` | any place displaying fee ceiling / SLA / auto-release copy | Read via resolver for the transaction's vendor. |
| **New** `admin-system-settings` | — | CRUD for scoped settings + timeouts, mandatory `reason`, writes to `admin_actions` audit log, supports bulk write ("apply to all vendors" = write platform + `DELETE FROM system_settings WHERE scope='vendor' AND setting_key=$1`). |

---

## 3. Frontend changes

### 3a. `src/pages/AdminSettings.tsx`
- Header adds **Scope selector**: "Platform defaults" | "Specific vendor…" (searchable vendor picker).
- Each field shows a scope badge: `Platform-locked`, `Overridable`, or `Overridden by vendor` (when viewing vendor scope and a vendor value exists).
- For platform view, each overridable field gets an **"Apply to all vendors (reset overrides)"** checkbox next to Save — this triggers the bulk-wipe path.
- Wire to `admin-system-settings` edge function; every save requires a "Reason for change" (already scaffolded).
- Add a **"Vendor overrides"** tab that lists which vendors currently override any key, with jump-to-vendor links.

### 3b. Client pricing mirror `src/lib/pricing.ts`
- Convert to async: `computePricing(itemAmount, currency, vendorConfig)` where `vendorConfig` comes from a new `useEffectivePricingConfig(vendorId)` hook that fetches from a lightweight `pricing-config` edge function.
- All callers must pass vendor context:
  - `src/pages/StorefrontCheckout.tsx` — has `sellerId`.
  - `src/pages/BuyerPaymentSummary.tsx`, `src/pages/BuyerCart.tsx`, `src/pages/CartCheckoutReview.tsx` — cart items already carry `seller_id`; group by vendor and compute per-group.
  - `src/pages/SellerCreateTransaction.tsx` — current user is the vendor.
  - `src/pages/AdminTransactions.tsx`, `src/pages/AdminTransactionDetail.tsx` — read from persisted snapshot; no live recompute.
- `src/services/payment-flow.service.ts` + `src/types/payment-flow.types.ts` — thread `vendorConfig` through.

### 3c. Seller-side surfacing (read-only)
Add a "Your effective settings" panel to `src/pages/SellerProfileSettings.tsx` showing what the vendor's current values resolve to (Platform vs Overridden). Editable subset lives on a future `/seller/settings` page — out of scope here, but the resolver + schema unblock it.

---

## 4. Migration + backfill

1. Migration adds columns, constraints, indexes, resolver functions, and RLS updates:
   - Platform rows: `has_role('admin')` write, `has_role('admin' or 'ops')` read.
   - Vendor rows: admin write always; vendor read for own `vendor_id`.
2. Backfill existing `system_settings` rows with `scope='platform'`.
3. Seed the settings catalog defaults (fees, timeouts, KYC threshold, auto-release, etc.) using existing hardcoded values so behavior does not change on deploy.

---

## 5. Safety / regression guards

- **Persisted snapshots stay authoritative** for any transaction already paid — pricing/timeouts are read from `transaction_pricing` and `transactions.*_at` deadlines, never recomputed. This prevents retroactive drift when a vendor changes settings.
- **Bounds enforcement in the resolver**: vendor overrides are clamped to platform min/max declared in the catalog; out-of-range writes are rejected server-side.
- **Audit trail**: every save writes `admin_actions` with `action_type='update_setting'`, before/after JSONB, scope, vendor_id, and reason.
- **Feature flag**: gate consumer code paths behind `settings.resolver_enabled` so we can roll back to constants without a redeploy.
- **Tests**: unit test `computePricing` with platform-only, vendor-override, and clamped-override configs; integration test that `create-transaction` produces identical snapshot to today when no overrides exist.

---

## 6. Impacted files summary (for review)

**DB / migrations**: new migration for scope columns, resolver functions, RLS, catalog seed.

**Edge functions (edit)**: `_shared/pricing.ts`, `_shared/safedeal-money-policy.ts`, `_shared/release-core.ts`, `create-transaction`, `cart-checkout`, `storefront-checkout`, `claim-offer`, `retry-payout`, `admin-escrow-alert-settings`, `admin-escrow-overview`, `admin-dashboard`, `admin-payouts-list`, `admin-payouts-detail`, `admin-transaction-detail`, `transaction-detail`, `seller-transaction-detail`, `transaction-agreement`, `resolve-share-token`, `initiate-paystack-payment`, `verify-paystack-payment`, `paystack-webhook`.

**Edge functions (new)**: `admin-system-settings` (CRUD + bulk), `pricing-config` (public read for checkout).

**Frontend (edit)**: `src/pages/AdminSettings.tsx`, `src/lib/pricing.ts`, `src/services/payment-flow.service.ts`, `src/types/payment-flow.types.ts`, `src/pages/StorefrontCheckout.tsx`, `src/pages/BuyerCart.tsx`, `src/pages/BuyerPaymentSummary.tsx`, `src/pages/CartCheckoutReview.tsx`, `src/pages/SellerCreateTransaction.tsx`, `src/pages/SellerProfileSettings.tsx`.

**Frontend (new)**: `src/lib/settings-catalog.ts`, `src/hooks/useEffectivePricingConfig.ts`, `src/services/admin-settings.service.ts`, `src/components/admin/settings/VendorScopePicker.tsx`.

**Read-only (verified unchanged)**: `AdminTransactionDetail`, `AdminTransactions`, webhook/verify functions — continue using persisted snapshot.
