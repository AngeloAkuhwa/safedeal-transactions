# Batch 1: Seller Storefront + Product Catalog (Scope Clarifications)

## What Batch 1 Covers

- Seller-owned products (CRUD, media, categories)
- Product categories
- Product media (images + video)
- Seller storefront management dashboard (premium dark theme)
- Public seller storefront (`/store/:sellerSlug`)
- **Public Product Detail page** (`/store/:sellerSlug/:productSlug`) — named deliverable
- No purchase-to-transaction logic

## Clarification 1: Public Product Detail Is a Named Batch 1 Deliverable

The Public Product Detail page at `/store/:sellerSlug/:productSlug` is a first-class Batch 1 screen, not implied. It is shared by:
- Seller public storefront flow (visitor clicks product from `/store/:sellerSlug`)
- Later buyer marketplace / public discovery flow (Batch 2+)
- Any direct product link shared externally

One screen, one data shape, one route — reused everywhere.

## Clarification 2: Public Storefront Screens Are Reusable Public Commerce Surfaces

The routes `/store/:sellerSlug` and `/store/:sellerSlug/:productSlug` are **public commerce surfaces**, not seller dashboard extensions. They are:
- Accessible without authentication
- Auth-aware (show different header for logged-in buyers vs anonymous visitors)
- Reused by buyer marketplace and purchase flows in later batches
- The canonical way to view any product on SafeDeal

## Clarification 3: Empty Storefront State

Batch 1 includes a dedicated seller empty storefront state:
- Shown when the seller has zero products
- Contains onboarding messaging explaining what the storefront does
- Prominent "Add Product" CTA
- Explanation that published products appear on their public store URL

## Clarification 4: Product Status Definitions

| Status | Public Visibility | Purchasable (later) |
|--------|-------------------|---------------------|
| `draft` | Not visible publicly | No |
| `published` | Visible if `visibility_type = 'public'` | Yes (when purchase flow exists) |
| `out_of_stock` | Still visible publicly if public | No — shown but marked unavailable |
| `archived` | Removed from active storefront | No |

## Clarification 5: Buyer-Specific Products in Batch 1

- Buyer-specific visibility exists in the schema in Batch 1
- Buyer-linking and private-offer flows are **deferred to a later batch**
- In Batch 1, buyer-specific products remain non-public, seller-managed listings only
- They appear in the seller's storefront management dashboard but are never surfaced publicly

---

# Batch 2: Public Marketplace Aggregation + Discovery (Revised)

## Architecture

```text
┌─────────────────────────────────┐
│  marketplace edge function      │  Public-safe data, service role
│  (aggregates across sellers)    │  for backend convenience only
└──────────┬──────────────────────┘
           │
┌──────────▼──────────────────────┐
│  /dashboard/marketplace         │  Buyer-auth protected route
│  search + category + sort       │
└──────────┬──────────────────────┘
           │ click product
           ▼
┌─────────────────────────────────┐
│  /store/:sellerSlug/:productSlug│  Existing PublicProductDetail
└─────────────────────────────────┘
```

## Auth vs Data Visibility

- `/dashboard/marketplace` is buyer-auth protected via `ProtectedRoute requireRole="buyer"`
- The marketplace edge function uses service role **only** for backend aggregation convenience — it queries across sellers in a single pass
- The response shape is **public-safe**: it returns only data that is already visible on public storefronts (published, public, active products + seller display names and verification levels)
- No private, draft, archived, buyer-specific, or inactive product data is ever returned

## Product Inclusion Rules

The marketplace query applies **all four** filters:
- `status = 'published'`
- `visibility_type = 'public'`
- `is_active = true`
- Products with any other status/visibility combination are excluded — this covers draft, archived, buyer_specific, and private_draft

## Changes

### 1. New Edge Function: `supabase/functions/marketplace/index.ts`

No JWT verification needed (public-safe data). Uses service role for cross-seller aggregation.

**Query params:** `search`, `category`, `page`, `sort` (newest | price_asc | price_desc)

**Pagination rules:**
- Default page size: 20
- Max page size: 40 (clamped server-side)
- Returns `total`, `page`, `page_size` for client-side pagination

**Per-product response shape:**
```typescript
{
  id, title, slug, short_description,
  unit_price, currency_code, stock_quantity,
  condition_label, primary_image_url,
  seller: {
    full_name, store_slug, avatar_url,
    trust_summary: {
      verification_level,    // "unverified" | "basic_verified" | "trusted_buyer"
      email_verified,        // boolean
      phone_verified,        // boolean
      identity_verified      // boolean
    }
  }
}
```

The `trust_summary` object lets ProductCard render trust signals consistently without ad-hoc interpretation.

**Category list:** Returns active categories alongside products so the client can populate the filter dropdown without a separate call. Empty categories (zero matching products) are **excluded** from the returned list.

### 2. New Service: `src/services/marketplace.service.ts`

Calls marketplace edge function. Typed response interface.

### 3. New Page: `src/pages/BuyerMarketplace.tsx`

Buyer-protected route. Contains:
- Search input
- Category dropdown (active categories only, empty categories hidden)
- Sort dropdown (Newest, Price Low→High, Price High→Low)
- Product grid using updated `ProductCard`
- Empty state for no results
- Pagination controls

**Pagination resets to page 1** whenever search, category, or sort changes.

**Stock display states on cards:**
- **In Stock** — `stock_quantity > 5`: no special indicator
- **Low Stock** — `stock_quantity` 1–5: amber "Low Stock" badge
- **Out of Stock** — `stock_quantity = 0`: overlay with "Out of Stock" label, card still visible but visually muted (public products remain discoverable; purchase CTA is disabled on detail page)

### 4. Updated `ProductCard` Component

Add optional props:
- `sellerName?: string`
- `sellerStoreSlug?: string`
- `sellerTrustSummary?: { verification_level, email_verified, phone_verified, identity_verified }`

When provided, render seller name + trust signal icon below the price. Existing storefront usage is unaffected (props are optional).

Add stock badge logic: "Low Stock" amber badge when `stock_quantity` is 1–5.

### 5. Route: Non-negotiable link pattern

Every marketplace product card links to:
```
/store/:sellerSlug/:productSlug
```
This reuses the existing `PublicProductDetail` page. No alternative route patterns.

### 6. Route Registration: `src/App.tsx`

```
<Route path="/dashboard/marketplace" element={<BuyerMarketplace />} />
```
Under buyer-protected routes.

### 7. Buyer Navigation: `src/components/dashboard/BuyerNav.tsx`

Add "Marketplace" link with `ShoppingBag` icon between Dashboard and Transactions.

### 8. No Database Changes

All data from existing tables: `products`, `product_media`, `files`, `profiles`, `account_verifications`, `product_categories`.

## What Is NOT In This Batch
- Price range filter
- Seller filter
- Ratings/reviews
- Purchase flow

## Success Criteria

1. Buyers can browse all public, published, active products across all sellers at `/dashboard/marketplace`
2. Product inclusion strictly enforces published + public + active filters
3. Category filter works using active categories; empty categories are hidden
4. Search by title/description works
5. Sort by date and price works
6. Pagination resets on filter change; respects default/max page size
7. Seller trust signal/summary renders consistently on marketplace cards
8. Stock states (In Stock, Low Stock, Out of Stock) display correctly on cards
9. Product cards link exclusively to `/store/:sellerSlug/:productSlug`
10. Page is buyer-auth protected; underlying data shape is public-safe
