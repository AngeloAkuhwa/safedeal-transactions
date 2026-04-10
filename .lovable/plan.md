

# Batch 1: Seller Catalog + Storefront Foundation (Final Plan)

## Core Architecture Rules

**Layer separation:**
- **Marketplace/Catalog Layer** = seller-owned listings, public storefronts, discovery, media, categories, visibility
- **Transaction Layer** = protected purchases, payment/escrow, fulfillment, delivery, disputes

**Products are editable and discoverable. Transactions are frozen and enforceable.**

### CRITICAL: Future Transaction Linkage Rule

Although Batch 1 does not implement storefront purchase logic, all future storefront purchases MUST create standard shared transaction records using the existing transaction engine. This means:
- Storefront purchases must NOT create a separate parallel order system
- Storefront-generated transactions must appear on the seller **Transactions** page (`/seller/transactions`)
- Storefront-generated transactions must appear on the buyer **Orders** page (`/dashboard/transactions`)
- Both parties see the same shared transaction status, timeline, payment state, fulfillment state, and dispute state
- The `product_id` column (added to `transactions` in a later batch) will link back to the originating listing, but the transaction itself remains the source of truth

### Page Responsibility Separation

| Page | Shows |
|---|---|
| **Storefront** (`/seller/storefront`) | Seller's product catalog and listing management |
| **Transactions** (`/seller/transactions`) | All actual commercial deals -- both direct protected transactions AND future storefront-generated transactions |

These are never merged. Listings live in Storefront. Active/completed deals live in Transactions.

---

## What This Batch Achieves

- Sellers can create, edit, publish, unpublish, and archive products
- Products support image/video uploads via existing Cloudinary pipeline
- Products are organized by category
- Each seller gets a public storefront URL (`/store/:sellerSlug`)
- Public visitors can browse a seller's storefront and view product details without auth
- The existing "Create Protected Transaction" flow at `/seller/transactions/new` remains completely untouched

## What This Batch Does NOT Do

- No storefront purchase-to-transaction logic (Batch 3)
- No buyer marketplace aggregation across sellers (Batch 2)
- No buyer-specific offer linking/claim flow (Batch 4)
- No reviews or ratings (Batch 5)
- No inventory logs table (Batch 3)
- No delivery confirmation tokens (Batch 6)

---

## Database Changes

### New Enums

```sql
CREATE TYPE product_visibility_type AS ENUM ('public', 'buyer_specific', 'private_draft');
CREATE TYPE product_status AS ENUM ('draft', 'published', 'out_of_stock', 'archived');
```

### New Tables

**1. product_categories**

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| name | text not null | |
| slug | text unique not null | |
| description | text null | |
| icon_name | text null | Lucide icon name |
| is_active | boolean default true | |
| sort_order | integer default 0 | |
| created_at / updated_at | timestamptz | |

RLS: Public SELECT for authenticated users. Admin-only INSERT/UPDATE.

**2. products**

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| seller_id | uuid not null FK -> profiles.id | |
| category_id | uuid null FK -> product_categories.id | |
| title | text not null | |
| slug | text not null | |
| short_description | text null | |
| description | text not null | |
| condition_label | text null | |
| sku / brand / model | text null | |
| currency_code | text not null default 'NGN' | |
| unit_price | numeric(18,2) not null | |
| stock_quantity | integer not null default 0 | |
| reserved_quantity | integer not null default 0 | |
| visibility_type | product_visibility_type not null default 'public' | |
| status | product_status not null default 'draft' | |
| is_active | boolean default true | Soft-delete flag |
| seller_notes / agreement_terms | text null | |
| delivery_method | text null | |
| verification_window_hours | integer null | |
| published_at / archived_at | timestamptz null | |
| created_at / updated_at | timestamptz | |

Constraint: `UNIQUE(seller_id, slug)`. Slug auto-generated from title; collisions resolved by appending `-2`, `-3`, etc.

RLS: Sellers SELECT/INSERT/UPDATE own products. Anon/authenticated can SELECT where `status = 'published' AND visibility_type = 'public' AND is_active = true`. Admins SELECT all.

**3. product_media**

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| product_id | uuid not null FK -> products.id ON DELETE CASCADE | |
| file_id | uuid not null FK -> files.id | |
| media_type | text not null | 'image' or 'video' |
| sort_order | integer default 0 | |
| is_primary | boolean default false | |
| created_at | timestamptz | |

RLS: Follows parent product access.

**4. ALTER profiles ADD COLUMN store_slug text UNIQUE**

Auto-generated from `full_name` on first product creation. Editable later. Reserved words blocked.

**Seed data:** 8 categories: Electronics, Phones & Tablets, Computing, Fashion, Home & Living, Auto & Parts, Services, Other.

### Product Status Semantics

| Status | Meaning |
|---|---|
| `draft` | Not visible publicly. Seller is still editing. |
| `published` | Visible on public storefront if `visibility_type = 'public'`. |
| `out_of_stock` | Derived/managed when `stock_quantity = 0`. Not available for purchase. Still visible but marked as unavailable. |
| `archived` | Removed from active storefront. Seller no longer wants it listed. |

### Buyer-Specific Visibility in Batch 1

The `buyer_specific` visibility type exists in the schema, but the actual buyer-linking, claim, and private-offer workflow is NOT implemented in this batch. For now:
- `buyer_specific` products remain non-public (not shown on public storefront)
- They are seller-managed only (visible in seller's storefront management page)
- The linking/claim flow is deferred to Batch 4

---

## Edge Functions (5 new)

**`seller-products`** (POST create, GET list)
- Validate seller role
- Auto-generate product slug from title (handle collisions)
- Auto-generate `store_slug` on profiles if missing
- Insert product + link file_ids via product_media
- GET: list with filters (status, visibility, category), pagination, primary media URL

**`seller-product-detail`** (GET, PATCH, DELETE)
- GET: single product with all media
- PATCH: update fields, handle slug changes, status transitions, set `published_at` on first publish
- DELETE: soft-delete (`is_active = false`, `status = 'archived'`)

**`product-categories`** (GET)
- Public, no auth. List active categories by sort_order.

**`public-storefront`** (GET)
- No auth required. Takes `seller_slug` param.
- Returns seller public profile (name, avatar, verification level) + paginated published public products with primary media
- Supports search query and category filter

**`public-product-detail`** (GET)
- No auth required. Takes `seller_slug` + `product_slug`.
- Returns full product detail with all media + seller trust signals
- No sensitive seller data exposed

---

## Frontend Changes

### Navigation

**SellerNav** -- add "Storefront" tab with `Store` icon between Dashboard and Transactions:
```
Dashboard | Storefront | Transactions | Payouts | Disputes | Profile
```

**SellerQuickActions** -- add "Add Product" card alongside existing "Create Transaction" card. Both remain visible as separate actions.

### New Routes in App.tsx

```
// Seller protected routes (inside existing seller route group)
/seller/storefront
/seller/storefront/new
/seller/storefront/:productId

// Public routes (no auth required, alongside existing public routes)
/store/:sellerSlug
/store/:sellerSlug/:productSlug
```

### New Pages

**SellerStorefront** (`/seller/storefront`)
- Public storefront URL with copy-to-clipboard button
- "Add Product" CTA
- Product grid: thumbnail, title, price, stock, status badge, visibility badge
- Filters: status, visibility, category
- Empty state

**SellerProductCreate** (`/seller/storefront/new`)
- 4-step wizard (adapted from transaction create structure, but writing to `products` table):
  1. Product Details -- title, category, description, condition, brand, model, SKU
  2. Media -- photos + video upload (reuses existing Cloudinary pipeline)
  3. Pricing & Stock -- price, currency, stock quantity, agreement terms
  4. Delivery & Settings -- delivery method, verification window, seller notes, visibility type
- Actions: Save as Draft / Publish

**SellerProductDetail** (`/seller/storefront/:productId`)
- View/edit (same form, pre-populated)
- Actions: Publish/Unpublish, Archive, Update Stock

**PublicStorefront** (`/store/:sellerSlug`) -- public, no auth
- Seller header (name, avatar, trust badges)
- Product grid with search + category filter
- Each card: image, title, price, stock indicator

**PublicProductDetail** (`/store/:sellerSlug/:productSlug`) -- public, no auth
- Image gallery, full description, price, condition, stock, agreement terms
- Seller trust card
- "Buy with SafeDeal Protection" CTA button -- **placeholder only in Batch 1**. Clicking shows a toast or inline message: "Purchase flow coming soon. Contact seller directly for now." This button must NOT trigger any transaction creation or checkout logic.

### Purchase CTA Rule for Batch 1

The public product detail page shows a "Buy with SafeDeal Protection" button as a visual placeholder. In Batch 1 it must NOT:
- Create any transaction
- Open any checkout flow
- Redirect to any payment page

It simply shows a brief message that purchase is coming soon. Full purchase logic is Batch 3.

### New Services
- `seller-storefront.service.ts` -- CRUD for seller products
- `public-storefront.service.ts` -- public storefront + product detail fetchers

### New Components
- `ProductStatusBadge` -- draft / published / out_of_stock / archived
- `ProductVisibilityBadge` -- public / buyer_specific / private_draft
- `ProductCard` -- reusable for seller list and public storefront
- `StorefrontShareCard` -- copy URL button
- `PublicStorefrontHeader` -- seller branding for public page

---

## What Stays Untouched

- `SellerCreateTransaction` page and its `/seller/transactions/new` route
- `create-transaction` edge function
- `seller-drafts` edge function
- `create-transaction.service.ts`
- All transaction, payment, escrow, delivery, dispute tables and flows
- All existing routes and pages

---

## Files Summary

| Type | Files |
|---|---|
| Migration | 1 migration: enums, product_categories, products, product_media, alter profiles add store_slug, seed categories, RLS policies |
| Edge Functions | New: seller-products, seller-product-detail, product-categories, public-storefront, public-product-detail |
| Services | New: seller-storefront.service.ts, public-storefront.service.ts |
| Pages | New: SellerStorefront, SellerProductCreate, SellerProductDetail, PublicStorefront, PublicProductDetail |
| Components | New: ProductStatusBadge, ProductVisibilityBadge, ProductCard, StorefrontShareCard, PublicStorefrontHeader |
| Edit | SellerNav.tsx (add Storefront tab), SellerQuickActions.tsx (add Add Product action), App.tsx (add routes) |

---

## Success Criteria

- Seller can create products with images/videos via multi-step form
- Seller can save drafts and publish products
- Seller can edit, unpublish, and archive products
- Published public products appear on public storefront at `/store/:sellerSlug`
- Private and buyer-specific products do NOT show on public storefront
- Public storefront URL works without auth
- Public product detail shows full listing with placeholder buy CTA
- Existing "Create Protected Transaction" flow works exactly as before
- Both "Create Transaction" and "Add Product" appear as separate quick actions on seller dashboard

