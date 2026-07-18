# Checkout Gating & Vendor Enable/Disable — Plan

Goal: Ship a config-controlled kill switch so we can deploy live in "browse/onboard only" mode, then flip checkout on when ready — globally, or per vendor. Also add an explicit vendor active/disabled flag so we can suspend a single vendor without touching pricing.

## 1. New settings (added to the manifest)

Both scoped `platform | vendor`, resolved via existing `get_effective_settings` (vendor > platform > default).

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `commerce.checkout_enabled` | boolean | `false` (safe default at launch) | Master switch. When false: no cart-add, no checkout, no payment initiation. |
| `commerce.add_to_cart_enabled` | boolean | `true` | Lets us allow browsing + cart building even while checkout is off. |
| `commerce.disabled_reason` | string (enum-ish) | `"launch_pending"` | Shown to users in the blocked-state banner/modal. |

Vendor overrides let a specific vendor be turned off (or on early during pilot) independent of the platform default.

## 2. Vendor active/disabled flag

Separate from the setting above — this is a hard admin action, not a config preference.

- Add `profiles.vendor_status` enum (`active | disabled | suspended`) with `active` default, plus `vendor_status_reason` and `vendor_status_changed_at/by`.
- Admin action `set_vendor_status` (added to `admin_action_type` enum) writes to `admin_actions` for audit.
- A disabled vendor: products hidden from marketplace/storefront listings, existing product pages show "Currently unavailable", all checkout/cart-add for that vendor blocked regardless of `commerce.checkout_enabled`.
- Existing in-flight transactions for that vendor are NOT cancelled — they continue through fulfillment/release.

## 3. Runtime enforcement (where the gate actually fires)

New shared helper `supabase/functions/_shared/commerce-gate.ts` with:
- `loadCommerceConfig(vendorId)` — reads the three keys via resolver.
- `assertCheckoutAllowed(vendorId)` → 403 `{ error: "checkout_disabled", reason }` when off.
- `assertAddToCartAllowed(vendorId)` → 403 `{ error: "add_to_cart_disabled" }`.
- `assertVendorActive(vendorId)` → 403 `{ error: "vendor_disabled" }`.

Wired into these edge functions (all existing):
- `cart-add` / cart mutation endpoints → `assertAddToCartAllowed` + `assertVendorActive`.
- `storefront-checkout`, `cart-checkout`, `create-transaction`, `claim-offer` → both gates.
- `initiate-paystack-payment` → both gates (last line of defence against stale client state).
- `marketplace` and `public-storefront` list endpoints → filter out products whose seller is `disabled`/`suspended`.

## 4. Admin UI (`/admin/settings`)

New "Commerce" section on the platform settings page:
- Toggle: **Enable checkout platform-wide** (`commerce.checkout_enabled`).
- Toggle: **Allow adding to cart while checkout is disabled**.
- Text field: **Message shown to users when checkout is off**.
- Scope selector already handles vendor overrides — same three fields render under Vendor scope with the standard "Overridden by vendor" badges.

Vendor status lives on the User Investigation Hub (`/admin/users/:id/profile`) for vendors:
- New "Vendor status" card with `Active | Disabled | Suspended` control, mandatory reason, writes to `admin_actions`.

## 5. Vendor-side visibility (`/seller/settings`)

- `EffectiveSettingsPanel` gains a "Commerce" row showing whether checkout is on for this vendor and where the value comes from (platform default vs vendor override).
- If the vendor is `disabled`/`suspended`, show a prominent banner explaining status + reason at the top of every seller page.

## 6. Buyer-side UX

- Product cards / product detail: when the effective gate is off (or vendor disabled), the "Buy now"/"Add to cart" button is replaced with a disabled state + tooltip carrying `commerce.disabled_reason`.
- Cart page: keep items visible but disable "Proceed to checkout" with the same message.
- A small `useCommerceGate(vendorId?)` hook in `src/hooks/` reads a new public `commerce-config` edge function (mirrors `pricing-config`) so the UI reflects live values without leaking admin endpoints.

## 7. Migration + seeding

- Migration: add the three keys to `system_settings` at platform scope with the defaults above; extend the settings catalog (both `src/lib/settings-catalog.ts` and `supabase/functions/_shared/settings-catalog.ts`); add `vendor_status` columns to `profiles`; add `set_vendor_status` to `admin_action_type`.
- At deploy time, `commerce.checkout_enabled=false` — the system ships in "onboard only" mode by default. We flip it on when we're ready.

## 8. Impacted files (audit-ready list)

- Migrations: new file for the three settings keys, `profiles.vendor_status` columns, enum extension.
- Backend shared: `_shared/settings-catalog.ts`, new `_shared/commerce-gate.ts`.
- Edge functions edited: `cart-add`, `cart-checkout`, `storefront-checkout`, `create-transaction`, `claim-offer`, `initiate-paystack-payment`, `marketplace`, `public-storefront`, `admin-system-settings` (accept new keys), new `commerce-config` (public read), `admin-user-actions` (or equivalent) for `set_vendor_status`.
- Frontend: `src/lib/settings-catalog.ts`, `src/pages/AdminSettings.tsx` (new Commerce section), `src/pages/AdminUserDetail.tsx` (vendor status card), `src/components/profile/EffectiveSettingsPanel.tsx`, new `src/hooks/useCommerceGate.ts`, buy/cart buttons in `PublicProductDetail`, `PublicStorefront`, `BuyerMarketplace`, `BuyerCart`, `CartCheckoutReview`, `StorefrontCheckout`.

## 9. Out of scope for this phase

- Scheduled auto-flip ("enable checkout on date X") — manual toggle only for now.
- Region-scoped gating (already handled by `serviceable_regions`).
- Refunding or auto-cancelling in-flight transactions when a vendor is disabled.

Confirm and I'll implement.
