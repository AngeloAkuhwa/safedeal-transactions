# Status: ~80% done. Here's exactly what's left.

## ✅ Already shipped (verified)

- **A. Reason modal** — `window.prompt` in `AdminSettings.handleSave` replaced with a shadcn `Dialog` + `Textarea` (min 3 chars, spinner, Cancel/Confirm). Done.
- **B1. `useCommerceGate` hook** — exists at `src/hooks/useCommerceGate.ts`, hits `commerce-config`, caches, falls back to safe defaults.
- **B2 (partial). Buyer-side gating** — wired in:
  - `PublicProductDetail` (banner + disabled CTA)
  - `BuyerCart` (disabled "Checkout Selected Items" + inline banner)
  - `CartCheckoutReview` (disabled "Confirm & Pay" + banner)
  - `StorefrontCheckout` (banner + disabled pay CTA)
  - Error propagation: `cart.service` and `storefront-checkout.service` now surface the server's `reason` string on 403.
- **B3 (partial). `EffectiveSettingsPanel`** — Commerce rows added (Checkout enabled / Add-to-cart enabled). Missing: the "platform default vs vendor override" badge — currently just Yes/No.
- All backend gating from the original plan.

## ❌ Still missing — this is what this plan will finish

### 1. Extend buyer gating to remaining product-list surfaces
The three checkout entry points are gated, but listing cards still show a live "Add to Cart"/"Buy" affordance when checkout is off. Add gating to:
- `src/components/marketplace/MarketplaceProductCard.tsx` — consumed by `BuyerMarketplace`.
- `src/components/storefront/ProductCard.tsx` — consumed by `PublicStorefront`.
- `src/pages/PublicStorefront.tsx` and `src/pages/BuyerMarketplace.tsx` — any inline CTA on the page shell itself.

Behavior: when `!addToCartEnabled` (or `!checkoutEnabled` for buy-now CTAs), render the button as disabled with `title={disabledReason}`. Card body still clickable to product detail so users can browse.

Use `useCommerceGate(product.seller_id)` per card (hook is cached per key, so no request storm).

### 2. Vendor status banner in seller layout
New component `src/components/seller/VendorStatusBanner.tsx`:
- Queries `profiles.vendor_status`, `vendor_status_reason`, `vendor_status_changed_at` for the current user (via existing profile service or a small query).
- If status is `disabled` or `suspended`, renders a prominent banner at the top: status label, reason, contact-support hint.
- Mounted once in the seller shell — `SellerNav.tsx` is the shared header, so render it just below the nav in each seller page's layout, or (cleaner) inside `SellerNav` itself so all seller pages get it automatically.

### 3. Upgrade the `EffectiveSettingsPanel` Commerce rows with the override badge
Match the pattern already used by the other rows in that panel: when the vendor has an explicit override for `commerce.checkout_enabled` / `commerce.add_to_cart_enabled`, show a small "Vendor override" badge; otherwise show "Platform default". Requires the `pricing-config` (or `commerce-config`) response to indicate source; extend `commerce-config` to include a per-key source map (`{ checkout_enabled: "vendor" | "platform" | "default" }`).

### 4. Marketplace parity check (read-only verification)
Grep-verify `BuyerMarketplace` and `PublicStorefront` go through the `marketplace` / `public-storefront` edge functions (which already filter disabled vendors) and do NOT hit `products` directly from the client. Note anything that bypasses — no code changes unless a gap is found.

### 5. Config-usage sanity sweep (C section)
Grep-verify each admin-writable key has at least one runtime reader. Report unused keys back to you; no code changes unless something admin-writable is silently ignored:
- `security.session_timeout_minutes`, `security.two_factor_admin`
- `notifications.email_enabled`, `notifications.sms_enabled`
- `fees.refund_policy`
- `escrow.auto_release_enabled` (already surfaced in `AdminPayouts` banner; execution intentionally out of scope)

## Out of scope (unchanged)
- Auto-release execution.
- `AdminPayouts` uses `window.confirm` for bulk release — separate concern, not this plan.
- New settings keys or DB migrations (except: `commerce-config` may need to return a source map — that's an edge-function tweak, no schema change).

## Technical notes
- `useCommerceGate` already caches per vendor id — safe to call once per card.
- Vendor status banner should degrade silently if `vendor_status` is null/`active`.
- Source-map addition to `commerce-config`: check whether `system_settings` has a row at vendor scope for the key; if yes → "vendor", else if platform row → "platform", else → "default".

Confirm and I'll implement.
