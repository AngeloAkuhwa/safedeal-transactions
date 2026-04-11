

# Redesign Seller Storefront Page — DB-Driven, Matching Design

## Design Direction

The attached design shows a **clean light theme** (not dark/glassmorphism) with:
- Header: "Storefront" title + subtitle + "Add Product" button
- Trust summary row: 3 icon-led cards (Store Status, Seller Rating, Published Products)
- Storefront share card
- Filters row
- Product grid

All summary data must be **DB-driven**, not hardcoded.

## Changes

### 1. Update `seller-products` Edge Function

Add a `trust_summary` object to the response by querying:
- `account_verifications` for `verification_level` → maps to Store Status label ("Verified Seller", "Basic Verified", "Unverified")
- Published product count from the products query (filtered to `status = 'published'`)
- Seller rating: Since no reviews table exists yet, return `{ rating: null, review_count: 0 }` — the UI will show "No ratings yet" instead of a hardcoded "4.9/5.0"

Response additions:
```json
{
  "trust_summary": {
    "verification_level": "trusted_buyer",
    "published_count": 3,
    "rating": null,
    "review_count": 0
  }
}
```

### 2. Redesign `src/pages/SellerStorefront.tsx`

Replace current layout with the design:

**Header row**: Keep existing title/subtitle/Add Product button layout but style to match design (clean, minimal, no gradient background).

**Trust Summary Section** (NEW): A bordered card with 3 items in a row:
- **Store Status**: Icon with green/yellow/gray ring based on `verification_level` from API. Labels: "Verified Seller" / "Basic Verified" / "Unverified"
- **Seller Rating**: Star icon with amber ring. Shows `rating / 5.0` or "No ratings yet" if null — fully DB-driven
- **Published Products**: Package icon with blue ring. Shows `{published_count} Active` from API

**Storefront Share Card**: Kept as-is (already functional).

**Filters**: Same logic, cleaner styling aligned with design.

**Product Grid**: Switch to `lg:grid-cols-3` (not 4). Use existing `ProductCard` with `showBadges`.

**Remove** `<Footer />` from this page to match the design.

### 3. Update `src/components/storefront/StorefrontShareCard.tsx`

Minor styling refinements to match the clean card look in the design. No functional changes.

### 4. No New Components Needed

The trust summary section is simple enough to inline in the page component. No separate component required.

## What Stays the Same

- All routing, navigation, data flow
- `SellerNav` top bar
- Filter state management
- Product card click → `/seller/storefront/:id`
- All product status/visibility/stock logic

## DB-Driven Guarantees

| UI Element | Data Source |
|---|---|
| Store Status | `account_verifications.verification_level` via edge function |
| Seller Rating | Future reviews table; currently returns `null` → "No ratings yet" |
| Published Products | `COUNT(products WHERE status='published')` via edge function |
| Store URL | `profiles.store_slug` via edge function |
| Product cards | `products` + `product_media` + `files` tables |
| Categories | `product_categories` table |

Zero hardcoded values in the UI.

