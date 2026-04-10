# Batch 1: Seller Catalog + Storefront Foundation — COMPLETED

## What Was Built

### Database
- New enums: `product_visibility_type`, `product_status`
- New tables: `product_categories`, `products`, `product_media`
- Added `store_slug` column to `profiles`
- Seeded 8 product categories
- Full RLS policies for seller ownership, public access, admin access

### Edge Functions (5 new)
- `seller-products` — POST create, GET list with filters
- `seller-product-detail` — GET, PATCH, DELETE (soft)
- `product-categories` — public GET
- `public-storefront` — public GET with search/filter
- `public-product-detail` — public GET with full media

### Frontend
- **Pages**: SellerStorefront, SellerProductCreate (4-step wizard), SellerProductDetail, PublicStorefront, PublicProductDetail
- **Components**: ProductStatusBadge, ProductVisibilityBadge, ProductCard, StorefrontShareCard, PublicStorefrontHeader
- **Services**: seller-storefront.service.ts, public-storefront.service.ts
- **Nav**: Added "Storefront" tab to SellerNav
- **Quick Actions**: Added "Add Product" to SellerQuickActions
- **Routes**: `/seller/storefront/*`, `/store/:sellerSlug/*`

## CRITICAL: Future Transaction Linkage Rule

All future storefront purchases MUST create standard shared transaction records using the existing transaction engine:
- Storefront purchases must NOT create a separate parallel order system
- Storefront-generated transactions must appear on seller Transactions page
- Storefront-generated transactions must appear on buyer Orders page
- The `product_id` column (added to `transactions` in a later batch) will link back to the originating listing

## Page Responsibility
- **Storefront** = product catalog/listing management
- **Transactions** = all commercial deals (direct + future storefront-generated)

## What Was NOT Changed
- SellerCreateTransaction page and `/seller/transactions/new` route — untouched
- create-transaction edge function — untouched
- All transaction, payment, escrow, delivery, dispute tables — untouched
