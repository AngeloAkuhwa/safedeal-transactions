# Fixes: Reason modal + Complete Checkout Gating rollout

## A. Replace `window.prompt` audit-reason with a proper Dialog

**Where:** `src/pages/AdminSettings.tsx` (line ~331, `handleSave`).

Today, clicking **Approve & Save Changes** triggers the browser's native JS alert (`window.prompt`) to collect the audit reason. Replace it with a small shadcn `Dialog` matching the app's design language.

- Add local state: `reasonModal: { open, pendingSave }` + `reasonText`.
- `handleSave` opens the modal instead of prompting; on confirm it runs the existing save pipeline (`saveSettingsWithAudit`) with `reasonText`.
- Modal contents: title "Confirm changes", short description ("This reason is recorded in the audit log"), `Textarea` (min 3 chars, required), Cancel + Confirm buttons. Confirm is disabled until the textarea has content; shows a spinner while saving.
- Reuse the same modal for the Auto-Release toggle audit if any other call sites still use `window.prompt`.

## B. Plan implementation audit — what's done vs still missing

Backend gating is fully wired. The remaining gaps are all on the frontend/UX layer.

**Done (verified in code):**
- Migration: `commerce.*` keys seeded, `profiles.vendor_status` columns, `set_vendor_status` enum value.
- `_shared/commerce-gate.ts` with `loadCommerceConfig`, `checkVendorActive`, `checkAddToCartAllowed`, `checkCheckoutAllowed`.
- Gates wired into `buyer-cart`, `cart-checkout`, `storefront-checkout`, `claim-offer`, `initiate-paystack-payment`.
- `marketplace` and `public-storefront` filter/block disabled vendors.
- Public `commerce-config` edge function exists.
- `admin-vendor-status` edge function + `AdminUserDetail` Vendor Commerce Status card with reason dialog.
- `AdminSettings` Commerce Availability section with the three keys.
- Settings catalog (FE + BE) updated.

**Missing / to build now:**

1. **`src/hooks/useCommerceGate.ts`** — new hook that hits `commerce-config?vendor_id=…` (falls back to platform when omitted) and returns `{ checkoutEnabled, addToCartEnabled, disabledReason, vendorStatus, loading }`. Cached with React Query.

2. **Buyer-side button gating** (proactive UX; server-side 403 already exists as backstop):
   - `PublicProductDetail`, `PublicStorefront` product cards, `BuyerMarketplace` cards, `src/components/storefront/ProductCard.tsx` / `MarketplaceProductCard.tsx`: when `!addToCartEnabled` or `!checkoutEnabled`, replace "Buy now"/"Add to cart" with a disabled button + tooltip showing `disabledReason`.
   - `BuyerCart` and `CartCheckoutReview`: keep items visible, disable "Proceed to checkout" with the same message shown as an inline banner.
   - `StorefrontCheckout`: on load, if gate is off, render the banner and hide the pay CTA.
   - Handle new 403 error codes (`checkout_disabled`, `add_to_cart_disabled`, `vendor_disabled`) in the existing toast/error paths so users get the reason string, not a generic error.

3. **Seller-side visibility** (`src/components/profile/EffectiveSettingsPanel.tsx`): add a "Commerce" row showing `checkout_enabled` + `add_to_cart_enabled` effective values with the standard override badge (platform default vs vendor override).

4. **Vendor status banner:** small component rendered at the top of every seller page (mount inside the seller layout — likely `src/pages/Seller*` shared shell or `SellerStorefrontSidebar` host) when `profiles.vendor_status !== 'active'`, showing status + reason. Reads from a lightweight query on the current user's profile.

5. **Marketplace/product listing hide-when-disabled parity check:** confirm `BuyerMarketplace` and any other product-list surfaces respect the `vendor_status` filter that `marketplace` already applies (should be automatic since it consumes that endpoint — verify no direct-to-DB reads bypass it).

## C. Config-usage sanity sweep (answer to "are the config settings all used where needed?")

Not covered by the checkout gating plan but worth confirming while we're in this area — I will grep-verify these once in build mode and note anything unused; no code changes proposed here unless a gap is found:

- `pricing.min_platform_fee_ngn`, `pricing.max_total_service_fee_ngn`, `pricing.tier_rates` → consumed by `_shared/pricing.ts` (verified previously).
- `security.id_verification_threshold`, `security.require_id_verification` → wired via `_shared/security-resolver.ts` in checkout paths.
- `risk.high_value_alert_ngn` → wired in Paystack webhook + verify.
- `escrow.auto_release_enabled` → surfaced in `AdminPayouts` banner (auto-release execution itself is out of scope per prior decision).
- `security.session_timeout_minutes`, `security.two_factor_admin`, `notifications.email_enabled`, `notifications.sms_enabled`, `fees.refund_policy` → confirm each has at least one runtime reader; flag any that are admin-writable but not enforced anywhere.

## Technical notes

- Reason modal uses the existing `Dialog`/`Textarea`/`Button` primitives already imported in `AdminSettings.tsx`.
- `useCommerceGate` accepts optional `vendorId` so buyer surfaces can resolve per-vendor state; when unknown, it uses platform defaults.
- Error handling: extend the shared fetch helper in the affected pages to detect the three 403 error codes and surface the returned `reason` string directly (no generic "Something went wrong").
- No DB migrations. No new edge functions. No changes to admin gating logic.

## Out of scope
- Auto-release execution logic.
- Any new setting keys.
- Redesign of AdminSettings layout beyond swapping the prompt for a modal.
