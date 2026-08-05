# Commerce Flag Semantics + Product Card Sizing

Two independent workstreams. Part 1 makes the two commerce switches behave exactly as the owner specified. Part 2 is a sizing/responsiveness correction on buyer browsing screens. No redesign, no new components, no colour or typography changes.

---

## PART 1 — Commerce flag semantics

### The owner's model

- `checkout_enabled = false` -> cart stays fully usable, the wall is at checkout.
- `add_to_cart_enabled = false` -> no adding to cart anywhere, but buying is still possible.

### What is live right now

Confirmed from the settings table: `add_to_cart_enabled = false`, `checkout_enabled = true`, `disabled_reason` = "Checkout is not yet available. We're preparing the platform...". The cart table has 0 rows, so no buyer is mid-flow.

What a buyer experiences today, end to end:

1. Marketplace card cart button is disabled with a tooltip. Correct.
2. Product detail page: the single CTA is disabled and reads "Currently unavailable". **This is the main defect.** `PublicProductDetail.tsx:83` blocks on `!addToCartEnabled || !checkoutEnabled`, so turning off add-to-cart also kills the only purchase path on the page. Checkout is ON, so the buyer should be able to buy — instead the product page is a dead end.
3. The banner copy says "Checkout is not yet available" while checkout is in fact available. The message is wrong for the live state.
4. Cart page, storefront checkout and cart review all correctly key off `checkoutEnabled` only.

So the live state is **not coherent**: the platform is open for business but no buyer can complete a purchase from a product page.

### Direct purchase when add-to-cart is off

The owner's model implies buy-now stays available. It currently does not. The fix is to split the product detail CTA into two independent controls driven by separate flags:

- Add to Cart -> gated by `addToCartEnabled` only.
- Buy Now (direct purchase, straight to storefront checkout) -> gated by `checkoutEnabled` only.

The server already supports this cleanly: `checkAddToCartAllowed` and `checkCheckoutAllowed` are independent and never consult each other. Only the client conflates them.

### Behaviour matrix

Legend: OK = already correct, CHANGE = needs work.

**A. cart ON / checkout ON (normal trading)**

| Surface | Expected | Status |
|---|---|---|
| Marketplace card | Cart button active | OK |
| Product detail | Add to Cart + Buy Now both active | CHANGE (no Buy Now exists) |
| Nav cart icon + badge | Visible, live count | OK |
| Cart with items | All controls active, no banner | OK |
| Empty cart | Normal empty state | OK |
| Cart review | Pay active | OK |
| Storefront checkout | Active | OK |
| Claim offer | Claim succeeds | OK |
| Server | No gate failures | OK |

**B. cart ON / checkout OFF (wind-down, cart still usable)**

| Surface | Expected | Status |
|---|---|---|
| Marketplace card | Cart button active | OK |
| Product detail | Add to Cart active; Buy Now disabled + checkout banner | CHANGE |
| Nav cart icon + badge | Visible, live count | OK |
| Cart with items | Quantity, remove, select all active. Checkout button disabled with banner at the summary | OK |
| Empty cart | Normal empty state plus a quiet note that checkout is paused | CHANGE (minor) |
| Cart review | Pay disabled + banner | OK |
| Storefront checkout | Blocked + banner | OK |
| Claim offer | Server returns `checkout_disabled`, landing shows the reason | OK |
| Server | `checkout_disabled` 403 on cart-checkout, storefront-checkout, claim-offer, initiate-paystack-payment | OK |

**C. cart OFF / checkout ON (the live state)**

| Surface | Expected | Status |
|---|---|---|
| Marketplace card | Cart button hidden, replaced by a Buy chevron routing to the product page | CHANGE (currently a dead disabled button) |
| Product detail | Add to Cart hidden; Buy Now active and primary; short note that cart is paused | CHANGE |
| Nav cart icon + badge | Stays visible if the buyer has items, hidden at zero | CHANGE (minor) |
| Cart with items | Quantity locked, remove active, checkout active, "adding is paused" banner | OK |
| Empty cart | Empty state pointing at the marketplace, no cart-paused alarm | OK |
| Cart review | Fully active | OK |
| Storefront checkout | Fully active | OK |
| Claim offer | Works | OK |
| Server | `add_to_cart_disabled` 403 on buyer-cart add and update_quantity only | OK |

**D. cart OFF / checkout OFF (fully paused)**

| Surface | Expected | Status |
|---|---|---|
| Marketplace card | No purchase control; card still opens the product | CHANGE |
| Product detail | Both CTAs hidden, single combined banner, Save for Later still active | CHANGE |
| Nav cart icon + badge | Visible only with existing items | CHANGE (minor) |
| Cart with items | Only remove active, single combined banner | OK |
| Empty cart | Empty state + paused note | CHANGE (minor) |
| Cart review | Blocked + banner | OK |
| Storefront checkout | Blocked + banner | OK |
| Claim offer | Blocked with reason | OK |
| Server | Both gates fire | OK |

### Banner copy

`commerce.disabled_reason` is one shared string used for both switches, which is why the live state shows checkout-flavoured copy while checkout is on. Two additions to the settings catalog, both optional with fallbacks:

- `commerce.cart_disabled_reason` — fallback: "Adding to cart is paused right now. You can still buy items directly, and everything already in your cart is safe."
- `commerce.checkout_disabled_reason` — fallback: "Checkout is temporarily paused. Your cart is saved and nothing has been lost — please check back shortly."

`commerce.disabled_reason` stays as the override for both when set, so existing admin behaviour is unchanged. Every disabled control gets a visible banner or inline note; no control is ever both dead and silent.

### Loading state

`useCommerceGate` exposes `loading`, but callers compute `!gate.loading && ...`, which renders an enabled control during the fetch and then flips it off — a visible wrong state. Instead, while `loading` is true, purchase controls render as a skeleton of the same size. Fail-closed defaults still apply once the fetch resolves or errors.

### Files, Part 1

- `src/lib/settings-catalog.ts` and the server mirror — two new optional reason keys.
- `src/hooks/useCommerceGate.ts` — expose `cartReason` and `checkoutReason` resolved with fallbacks; keep existing fields.
- `supabase/functions/_shared/commerce-gate.ts` — return the matching reason per gate.
- `src/components/marketplace/MarketplaceProductCard.tsx` — hide, not disable, the cart button when cart is off; skeleton while loading.
- `src/pages/PublicProductDetail.tsx` — split CTA into Add to Cart and Buy Now with independent gates.
- `src/pages/BuyerCart.tsx` — per-flag banner copy; empty-state note.
- `src/pages/CartCheckoutReview.tsx`, `src/pages/StorefrontCheckout.tsx` — use `checkoutReason`.
- `src/components/dashboard/BuyerNav.tsx` — hide the cart entry at zero items when cart is off.

Edge functions touched (`commerce-config` and every function importing the shared gate) get redeployed.

---

## PART 2 — Product card sizing and mobile responsiveness

### Surfaces and current state

| Surface | Grid | Media well | Notes |
|---|---|---|---|
| Buyer marketplace `BuyerMarketplace.tsx:237` | `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4` | `aspect-square object-cover` | Good baseline |
| Landing preview `MarketplacePreview.tsx:133` | same | same card | Good |
| Public storefront `PublicStorefront.tsx:117` | same | `ProductCard` `aspect-square object-cover` | Grid good, card differs |
| Saved products `BuyerSavedProducts.tsx:164` | `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6` | `aspect-square` | **1 card per row on phones — defect** |
| Seller storefront `SellerStorefront.tsx:323` | `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5` | — | Seller side, same 1-col defect |
| Landing featured `FeaturedDealsSection.tsx:149` | `sm:grid-cols-2 lg:grid-cols-3` | `object-contain p-3` | 1 col on phone; demo data only |
| Cart line items | List rows, not a grid | — | Out of scope |

### Defects

1. **Saved products renders one card per row on a phone.** Wrong for a shopping grid and inconsistent with marketplace.
2. **Skeletons do not match the real card.** `BuyerMarketplace.tsx:225` and `MarketplacePreview.tsx:118` use `aspect-[3/4]`, but a real card is a square image plus roughly 110px of content. Every grid load causes a visible jump.
3. **Landing featured cards** are single-column on phones and use `object-contain p-3` while every other surface uses `object-cover`, so the same kind of product looks letterboxed there and filled elsewhere.
4. **Storefront `ProductCard` heights vary within a row** — the `Card` has no `h-full flex flex-col` and the price is not pushed down with `mt-auto`, so a product with a short description sits with its price floating mid-card next to a neighbour whose price is at the bottom.
5. **Tap targets under 44px.** Marketplace card cart button `h-8 w-8`, wishlist heart `h-8 w-8`, cart quantity buttons `h-8 w-8`.
6. **Gap too wide on phones.** `gap-4` at 320-360px leaves cards cramped; `gap-3` on mobile stepping up to `gap-4` reads better.
7. No horizontal overflow found at 320px, and there is **no bottom nav** — `BuyerNav` is a sticky top header (`BuyerNav.tsx:87`), so no safe-area clearance work is needed. Reported for accuracy.

### Media well vs the normalised images

Images now normalise to 1:1 with white padding. Marketplace, storefront and saved cards all use `aspect-square` with `object-cover`, so a 1:1 source fills exactly with no second crop and no double padding — **already correct**. The one mismatch is `FeaturedDealsSection`'s `object-contain p-3`, which pads an already-padded image; aligning it to `object-cover` removes the double padding.

### Proposed class changes

- `BuyerSavedProducts.tsx:164` -> `grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4`
- `SellerStorefront.tsx:323` -> `grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5`
- `BuyerMarketplace.tsx:223,237` and `MarketplacePreview.tsx:114,133` -> `gap-3 sm:gap-4`; skeleton becomes a square media block plus two content bars matching the real card
- `PublicStorefront.tsx:117` -> `gap-3 sm:gap-4`
- `FeaturedDealsSection.tsx:149` -> `grid-cols-2 lg:grid-cols-3`; image `object-cover`, padding removed
- `storefront/ProductCard.tsx:49` -> add `h-full flex flex-col`; `CardContent` gets `flex-1 flex flex-col`; price wrapper gets `mt-auto`
- `MarketplaceProductCard.tsx:112,182` -> buttons to `h-9 w-9` with an invisible padded hit area so the visual size is unchanged
- `BuyerCart.tsx:640,650` -> quantity buttons `h-9 w-9`

All changes are class-level. No component is rewritten, no colour or font changes.

### Tests

- `src/__tests__/commerce-flag-matrix.contract.test.tsx` — renders the product card and detail CTAs against all four flag combinations and asserts which controls are present, disabled or hidden, plus that a banner is rendered for every blocked control.
- `src/__tests__/product-grid-responsive.test.tsx` — asserts each grid container's class string yields 2 columns at mobile and the expected columns at `sm`/`lg`, and that skeleton and real card share the same media aspect.

### Risks and rollback

- Adding a Buy Now button introduces a second purchase entry point on the product page. It reuses the existing storefront-checkout route, so no new server surface.
- The new reason keys are optional; if unset, behaviour matches today's copy.
- Grid changes are cosmetic and revert by restoring the class strings.
- Admin is untouched; the 47/47 smoke suite and all existing tests must stay green.

### Sequence

1. Reason keys + `useCommerceGate` split reasons.
2. Product detail CTA split (fixes the live dead end).
3. Card, nav, cart and empty-state states across the matrix.
4. Grid and sizing corrections.
5. Both new test files, full suite, deploy touched edge functions.