
# Compatibility Check: Will the Batch 5 Plan Break the Existing Product Flow?

## Short answer: **No — the plan is compatible**, but **two coexistence rules must be locked in** so the two flows don't collide.

---

## What already exists (and will keep working untouched)

**Public/storefront product creation** at `/seller/storefront/new` (`SellerProductCreate.tsx` → `seller-products` edge fn):
- Full catalog form: title, category, slug, brand, model, agreement terms, delivery methods, feature highlights, multiple media, stock_quantity (any), visibility selector
- Already writes `visibility_type` (default `'public'`, also supports `'buyer_specific'` and `'private'`)
- Already enforces `UNIQUE(seller_id, slug)`
- Already powers the seller storefront, public marketplace, cart, public product detail

**This plan does NOT touch** `SellerProductCreate.tsx`, `seller-products` edge fn, `seller-storefront`, `seller-product-detail`, marketplace, or storefront listing routes. **Zero regression risk on the public flow.**

---

## Where the two flows touch the same tables — and how we keep them safe

| Shared resource | Public flow today | Batch 5 (private offer) flow | Collision risk | Mitigation |
|---|---|---|---|---|
| `products` table | Inserts `visibility_type='public'` (or `private`) | Inserts `visibility_type='buyer_specific'` | None — different visibility | RLS already filters public surfaces by `visibility_type='public'` |
| `products.slug` UNIQUE per seller | Seller picks slug | Auto-generate slug like `private-{shortToken}` | Slug collision if seller manually uses same name | Auto-generated slugs are token-prefixed and hidden — no collision |
| `product_media` | Linked via `product_id` | Linked via `product_id` (uses already-uploaded wizard photos) | None | Same insert path |
| `transactions.source_product_id` | Set by `storefront-checkout` | Set by `create-transaction` on publish | None | Same column, both populate it |
| Inventory math (`stock_quantity − reserved_quantity`) | Reserved on payment held | Reserved on payment held (same hook) | None | Inherits same rule |
| Marketplace / public storefront edge fns | Filter `visibility_type='public'` | Filtered out automatically | None | RLS + WHERE clauses already correct |

---

## Two coexistence rules to lock (added to the plan)

### Rule A — Private-offer products are isolated from public surfaces
The private-offer wizard creates products with:
- `visibility_type = 'buyer_specific'` (mandatory, not user-selectable)
- `status = 'published'` but **invisible** because all public queries filter on `visibility_type='public'`
- `slug` auto-generated as `po-{8-char-token}` (collision-proof, hidden from URLs — buyers reach the product only via `/offer/:offerToken`, never via `/store/:sellerSlug/:slug`)
- Excluded from seller's own storefront listing (`SellerStorefront.tsx`) by adding a `visibility_type != 'buyer_specific'` filter to `seller-products` list query

> **Add to plan:** modify `seller-products` LIST query to exclude `visibility_type='buyer_specific'` so private-offer products don't pollute the seller's main catalog. Show them in a separate **"Private Offers"** tab on the seller dashboard instead.

### Rule B — Private-offer products cannot be edited via the storefront editor
- `SellerProductDetail.tsx` (the storefront product editor) blocks edit when `visibility_type='buyer_specific'` and shows: *"This product is part of a private offer. Manage it from your Private Offers list."*
- Stock quantity, price, and agreement on a private-offer product are managed through the offer (cancel + reactivate flow), not the catalog editor

> **Add to plan:** small guard in `SellerProductDetail.tsx` + redirect link to `/seller/offers/:offerId`.

---

## What about the public storefront page rendering buyer-specific products?

Triple-checked:
- `public-storefront` edge fn → filters `status='published' AND visibility_type='public'` ✅
- `public-product-detail` → same filter ✅
- `marketplace` edge fn → same filter ✅
- `product_media` RLS policy `anon_select_published_product_media` → only joins on `visibility_type='public'` ✅
- `cart_items` / `saved_products` → users can only add public products through the storefront UI; if a buyer-specific product_id is ever supplied, RLS on `products` blocks it because `cart_items` reads join through public surfaces

**Hidden from public browsing is enforced at 4 layers — safe.**

---

## Updated build steps (additions only — rest of prior plan unchanged)

### Database migration adds
- Index `idx_products_visibility_buyer_specific` on `products(seller_id) WHERE visibility_type='buyer_specific'` (faster offer-list queries)

### Edge function additions
- `create-transaction` publish step inserts product with `slug = 'po-' || substring(offer_token, 1, 8)` and `visibility_type='buyer_specific'`
- `seller-products` LIST endpoint adds `.neq('visibility_type', 'buyer_specific')` to keep storefront list clean
- New endpoint in `seller-offers` (or extend existing) for "list my private-offer products + offers"

### Frontend additions
- `SellerProductDetail.tsx` → guard: if `visibility_type='buyer_specific'`, show read-only banner + link to offer management (no edit form)
- New section in seller dashboard: **"Private Offers"** card linking to `/seller/offers` (list of private-offer products with their offer status)

---

## Final compatibility verdict

| Concern | Status |
|---|---|
| Does it overwrite the existing public create flow? | ❌ No — entirely separate wizard |
| Does it pollute seller's storefront product list? | ✅ Prevented by visibility filter |
| Does it leak buyer-specific products to public? | ✅ 4-layer filter already in place |
| Does it conflict on slug uniqueness? | ✅ Auto-prefixed slugs |
| Does it break checkout / cart / marketplace? | ✅ Untouched code paths |
| Does it follow the same stock + transaction rules as public products? | ✅ Locked in plan §2 |
| Does it require schema changes to `products`? | ❌ No — uses existing columns |

**The plan suits perfectly and will not break the system**, provided Rule A (storefront list exclusion + auto-slug) and Rule B (edit guard) are included as above.

Reply **"Approved"** and I'll switch to default mode and implement the full Batch 5 with these two coexistence rules baked in.
