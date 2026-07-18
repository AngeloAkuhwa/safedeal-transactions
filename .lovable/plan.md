Short answer: **~95% done.** Everything you flagged in section A and most of B is shipped. A few small items remain — none block use.

## Verified done
- **A. Reason modal** — `AdminSettings.tsx` uses a shadcn `Dialog` (`reasonModalOpen`, `savingWithReason`), no `window.prompt` remains.
- **B1. `useCommerceGate`** — hook exists, accepts optional `vendorId`, exposes `checkoutEnabled / addToCartEnabled / disabledReason / scope / sources / loading`.
- **B2. Buyer-side gating** wired in: `PublicProductDetail`, `MarketplaceProductCard`, `BuyerCart`, `CartCheckoutReview`, `StorefrontCheckout`.
- **B3. `EffectiveSettingsPanel`** — Commerce rows with "Vendor override / Platform default" badges.
- **B4. Vendor status banner** — `VendorStatusBanner` mounted in `SellerNav`, which every `Seller*.tsx` page renders, so coverage is universal.
- **C. Sanity sweep** — email kill switch wired into delivery worker; session-timeout hook + `security-config` endpoint added; unused settings called out (only `fees.refund_policy` still has no runtime consumer).

## Remaining gaps to close

1. **`storefront/ProductCard.tsx`** listed in the plan has no add-to-cart CTA (display-only card that navigates). Nothing to gate — mark as N/A in the plan.
2. **`useCommerceGate` uses an in-memory `Map` cache, not React Query.** Functional but deviates from the plan. Refactor to `useQuery(["commerce-gate", vendorId ?? "platform"], …, { staleTime: 60_000 })` so cache invalidation and devtools work uniformly.
3. **403 reason propagation coverage** — done in `cart.service.ts` and `storefront-checkout.service.ts`. Still to verify/patch: `services/offer.service.ts` (claim-offer) and `services/payment.service.ts` / `initiate-paystack-payment` caller so the three codes (`checkout_disabled`, `add_to_cart_disabled`, `vendor_disabled`) surface the server `reason` string instead of a generic toast.
4. **B5 parity check** — grep every product-list surface (`BuyerMarketplace`, `PublicStorefront`, saved-products, search results) to confirm they consume the `marketplace` / `public-storefront` endpoints (which already filter disabled vendors) and don't read `products` directly, then document the finding. No code change expected unless a bypass is found.
5. **Vendor-scope commerce gate on `MarketplaceProductCard`** — currently uses platform-scope only because `MarketplaceProduct` doesn't expose `seller.id`. Server 403 still enforces the vendor rule, but the UI won't proactively disable per-vendor. Fix by adding `seller_id: string` to the `MarketplaceSeller`/`MarketplaceProduct` type + the `marketplace` edge-function projection, then pass it into `useCommerceGate(product.seller_id)`.

## Out of scope (unchanged)
Auto-release execution, new setting keys, `AdminSettings` redesign, `fees.refund_policy` enforcement (needs product decision on partial/full/window semantics).
