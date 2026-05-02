# Phase I — Buyer Section Polish Parity

## Audit Findings

The seller polish (Phase G + Phase H) introduced a shared design language via `sd-*` tokens in `src/index.css` (sd-page = `max-w-[1400px]`, sd-page-y = `py-3 sm:py-4`, sd-metric min-height 96px, sd-kpi-value text-base→xl, etc.). Every seller page now uses these tokens.

**Buyer pages use ZERO of these tokens.** They still carry the old, looser style:

| Page | Current State | Problem |
|---|---|---|
| `Dashboard.tsx` (buyer home) | `max-w-7xl`, big section gaps `mb-12` | Looser than seller dashboard |
| `BuyerTransactions.tsx` | `max-w-7xl`, `py-6 sm:py-8`, `text-2xl sm:text-3xl` H1 | Oversized header, narrower than seller |
| `BuyerDisputes.tsx` | Full-width `bg-destructive py-10 sm:py-12` hero, `text-3xl lg:text-4xl` H1 | Gigantic red hero — much heavier than seller equivalent |
| `BuyerNotifications.tsx` | Same heavy `bg-primary py-10 sm:py-12` hero pattern | Same bloat |
| `BuyerPrivateOffers.tsx` | `max-w-6xl`, `py-8`, `text-3xl` H1 | Inconsistent width + oversized title |
| `BuyerProfileSettings.tsx` | `bg-gradient-to-r ... py-8` hero, `max-w-7xl py-8` body | Same gradient hero already removed on seller side |
| `BuyerCart.tsx` | `max-w-5xl`, `text-2xl lg:text-3xl` H1, `text-2xl` KPI values | Narrow + KPI font too large vs sd-kpi-value |
| `BuyerSavedProducts.tsx` | Already `max-w-[1400px]` ✓ but `text-2xl md:text-3xl lg:text-4xl` H1 + `text-2xl` price | Header & prices oversized |
| `BuyerDisputeSummaryCards` | `text-3xl` numbers, `px-3 py-1` chips | Heavier than `SellerDisputeSummaryCards` (which now uses sd-metric grid) |
| `BuyerMarketplace.tsx` | needs verification | likely same pattern |

## Scope

Apply identical polish to buyer-facing pages **only**. Storefront-facing pages (`SellerStorefront`, `BuyerMarketplace` product browsing experience) are excluded from density tightening — they're consumer browsing surfaces, not dashboards. We will only touch the dashboard chrome of `BuyerMarketplace` (header strip), not the product grid.

## Changes

### 1. Page Shell Standardization
Replace in every buyer dashboard page:
- `mx-auto max-w-7xl px-4 sm:px-6 lg:px-8` → `sd-page`
- `py-6 sm:py-8` / `py-8` → `sd-page-y`
- `text-2xl sm:text-3xl font-bold` H1 → `sd-page-title`
- Subtitle paragraph → `sd-page-sub`

Affected: `Dashboard.tsx`, `BuyerTransactions.tsx`, `BuyerDisputes.tsx`, `BuyerNotifications.tsx`, `BuyerPrivateOffers.tsx`, `BuyerProfileSettings.tsx`, `BuyerCart.tsx`, `BuyerSavedProducts.tsx`, `BuyerVerification.tsx`.

### 2. Remove Heavy Hero Bands
- `BuyerDisputes.tsx`: replace full-width `bg-destructive py-10 sm:py-12` hero with compact title strip + a slim `border-l-4 border-destructive` accent bar (mirrors the pattern used in `SellerDisputes.tsx`).
- `BuyerNotifications.tsx`: same — replace `bg-primary py-10 sm:py-12` hero with compact header.
- `BuyerProfileSettings.tsx`: remove `bg-gradient-to-r from-primary/10 ...` hero (matches seller change).

### 3. Buyer KPI / Summary Cards
- `BuyerDisputeSummaryCards.tsx`: rebuild with `sd-metric` grid, `sd-kpi-label` for label, `sd-kpi-value` for number, replace bespoke chip padding with the standard chip tone classes already in use on seller side.
- `BuyerCart.tsx` summary tiles (items / selected / needs attention): drop `text-2xl` → `sd-kpi-value`, tighten card padding to `p-3`.
- `BuyerSavedProducts.tsx` price `text-2xl` → `text-lg font-bold tabular-nums` to align with seller listings.

### 4. Filters / Toolbars
- Standardize search inputs and select triggers to `h-8 text-xs` (matches `SellerTransactions` toolbar).
- Affected: `BuyerTransactions.tsx`, `BuyerDisputes.tsx`, `BuyerNotifications.tsx`, `BuyerSavedProducts.tsx`.

### 5. Empty States
- Reduce `py-16` / `py-20` → `py-10`.
- H2 in empty state `text-xl font-bold` → `text-base font-semibold`.
- Body copy already `text-sm` ✓.

### 6. Buyer Marketplace (dashboard chrome only)
- Update only the page header / KPI strip area to `sd-page` + `sd-page-title`.
- **Do not touch** product grid, search bar styling, category pills, or product cards — those are storefront UX.

### 7. Motion Parity
- Reuse `useReducedMotion` hook + the staggered fade-in pattern already imported on seller pages for the buyer transaction list, dispute list, and notification list.

## Files to Edit (all reads only — no token additions needed; sd-* already exist in `src/index.css`)
- `src/pages/Dashboard.tsx`
- `src/pages/BuyerTransactions.tsx`
- `src/pages/BuyerDisputes.tsx`
- `src/pages/BuyerNotifications.tsx`
- `src/pages/BuyerPrivateOffers.tsx`
- `src/pages/BuyerProfileSettings.tsx`
- `src/pages/BuyerCart.tsx`
- `src/pages/BuyerSavedProducts.tsx`
- `src/pages/BuyerVerification.tsx`
- `src/pages/BuyerMarketplace.tsx` (header strip only)
- `src/components/disputes/BuyerDisputeSummaryCards.tsx`
- (possibly) `src/components/disputes/BuyerDisputeFilters.tsx`, `BuyerDisputeList.tsx`, `BuyerDisputeEmptyState.tsx` for empty-state + filter-control alignment

## Out of Scope
- Storefront product grid & product detail pages.
- `BuyerTransactionDetail`, `BuyerTransactionAgreement`, `BuyerTransactionVerify`, `BuyerTransactionTracking`, `BuyerTransactionReview`, `BuyerDisputeDetail`, `BuyerPaymentSummary` — these are deep transactional flows; density polish would risk breaking signed-agreement layouts. Can be a follow-up Phase J if you want.
- No backend / RLS / edge-function changes.
- No new design tokens — reusing the ones Phase H already shipped.

## Acceptance
- Every buyer dashboard page uses `sd-page` + `sd-page-y` (1400px container, py-3/4).
- No `bg-gradient-to-r` or `bg-destructive py-10+` heroes remain on buyer dashboard pages.
- Buyer KPI cards visually match seller KPI cards in size, font weight, and chip tone.
- Toolbars at `h-8 text-xs`.
- No horizontal overflow at 1246px viewport (current user viewport).
- Storefront and deep transactional flows untouched.
