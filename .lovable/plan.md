

# Fix: Seller Information — Show Real Verification Status & "Trusted Since" Year

## Problem

The Seller Information card on the preview page shows incorrect data because:
- The `seller-dashboard` edge function only fetches `full_name, avatar_url` from `profiles`
- `verification_level`, `created_at`, and `store_slug` are never returned, so they're always `undefined`
- The "Verified" badge and "Trusted seller since" text show fallback values

## Solution

### 1. Update `seller-dashboard` edge function

Expand the profile select to include the missing fields:

```sql
-- Change from:
.select("full_name, avatar_url")
-- To:
.select("full_name, avatar_url, store_slug, created_at")
```

Also fetch `verification_level` from `account_verifications` table and include it in the `seller` response object.

### 2. Update `src/pages/SellerProductPreview.tsx` — Seller Information card

- Show verification status dynamically based on actual `verification_level`:
  - `trusted_buyer` / `high_trust_buyer` → green "Verified" pill badge
  - `basic_verified` → blue "Basic Verified" pill badge  
  - `unverified` → amber "Unverified" text (no green badge)
- "Trusted seller since" shows the year from `created_at` (e.g., "Trusted seller since 2024")
- If unverified, show "Member since 2024" instead of "Trusted seller since"

### Files Changed

1. `supabase/functions/seller-dashboard/index.ts` — expand profile query + add verification_level fetch
2. `src/pages/SellerProductPreview.tsx` — update Seller Information card to use real data with proper fallbacks

