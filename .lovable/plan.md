# Phase I Audit + Phase I.5 — Buyer Section Gap Closure

## Phase I Audit Result

**~70% complete.** Page-shell goals were hit on every buyer page (sd-page, sd-page-y, sd-page-title, hero strip removal, KPI summary card density). But Phase I only refactored the page wrappers — it did **not** drill into the shared sub-components those pages render. Three of the seven Phase I items are partially or completely unfulfilled.

### Status of each Phase I item

| # | Item | Status | Gap |
|---|---|---|---|
| 1 | Page shell standardization | Done | All 10 buyer pages now use `sd-page` / `sd-page-y` / `sd-page-title` |
| 2 | Remove heavy hero bands (Disputes, Notifications, Profile) | Done on the three pages explicitly listed | **Missed:** `DashboardHero.tsx` still has `bg-primary py-10 sm:py-12` + `text-2xl sm:text-3xl lg:text-4xl` H1 |
| 3 | Buyer KPI / summary cards | Done for `BuyerDisputeSummaryCards`, `BuyerCart`, `BuyerSavedProducts` | **Missed:** `MetricsCards` (still `p-6`, `h-12 w-12`, `text-3xl`, `gap-6`) and `NotificationSummaryCards` (still oversized) |
| 4 | Filters / toolbars to `h-8 text-xs` | **Not done** | `TransactionFilters.tsx`, `BuyerDisputeFilters.tsx`, `NotificationFilters.tsx`, the `BuyerSavedProducts` filter row — all still use default Input/Select sizes (h-10/h-9) |
| 5 | Empty states tightened | Done on page-level empty blocks | `TransactionsEmptyState`, `BuyerDisputeEmptyState`, `NotificationEmptyState` shared components not yet checked/tightened |
| 6 | Buyer Marketplace header strip | Done | OK |
| 7 | Motion parity (`useReducedMotion` + staggered fade-in) | **Not done** | Zero buyer pages or buyer components import `useReducedMotion` or use `sd-fade-in-stagger` |

### Other gaps surfaced during audit

- `RecentPurchases.tsx`, `QuickAccess.tsx`, `RecentNotifications.tsx` still use seller-pre-Phase-H styling (large gap-6, p-6, text-2xl).
- `NotificationList.tsx` items use heavier vertical padding than the seller activity feeds.
- `BuyerDisputeList.tsx` not yet aligned with seller `SellerTransactionsRow` density.
- The `bg-gradient-to-r from-primary to-blue-600` on `BuyerSavedProducts` "Buy" CTA button is acceptable (a button gradient, not a hero band) — leaving as-is.

---

## Phase I.5 — Closure Plan

Goal: finish the three Phase I items that only got partial coverage, so the buyer experience reaches true visual parity with the seller side.

### 1. Buyer DashboardHero rebuild
File: `src/components/dashboard/DashboardHero.tsx`
- Replace full-width `bg-primary py-10 sm:py-12` band + `text-2xl sm:text-3xl lg:text-4xl` H1 with the same compact strip pattern used on `SellerDashboardHero.tsx` (border-b, sd-page, sd-page-y, sd-page-title, primary accent on the left, secondary action chip on the right).
- Keep both CTA buttons but resize to `h-8 text-xs gap-1.5`.

### 2. Buyer MetricsCards rebuild
File: `src/components/dashboard/MetricsCards.tsx`
- Switch grid from `gap-4 sm:gap-6` to `gap-3`.
- Each card: `sd-metric p-3`, icon container `h-8 w-8 rounded-lg`, value `sd-kpi-value tabular-nums`, label `text-xs text-muted-foreground`, status chip to `text-[10px] px-1.5 py-0.5`.
- Mirrors `SellerMetricsCards` styling exactly.

### 3. NotificationSummaryCards tightening
File: `src/components/notifications/NotificationSummaryCards.tsx`
- Same density refit as buyer dispute summary cards (sd-metric grid, sd-kpi-value numbers, gap-3, smaller icon containers).

### 4. Shared filter / toolbar density
Files:
- `src/components/transactions/TransactionFilters.tsx`
- `src/components/disputes/BuyerDisputeFilters.tsx`
- `src/components/notifications/NotificationFilters.tsx`
- `src/pages/BuyerSavedProducts.tsx` filter row
Changes:
- Search Input → `h-8 text-xs` with `pl-8` icon offset.
- SelectTrigger → `h-8 text-xs`.
- Buttons → `size="sm" h-8 text-xs gap-1.5`, lucide icons to `h-3.5 w-3.5`.
- Filter strip wrapper → `gap-2 p-2` instead of `gap-4 p-4`.

### 5. Recent / list components
Files: `RecentPurchases.tsx`, `RecentNotifications.tsx`, `QuickAccess.tsx`, `NotificationList.tsx`, `BuyerDisputeList.tsx`
- Section headers: `text-2xl/3xl` → `text-sm font-semibold uppercase tracking-wide` (matches seller "Recent Activity" header).
- List card padding: `p-6` → `p-3`, gaps `gap-6` → `gap-3`.
- Avatar/icon containers: `h-12 w-12` → `h-9 w-9 rounded-lg`.
- Money values: `text-2xl/xl` → `sd-kpi-value` or `text-base font-bold tabular-nums`.

### 6. Shared empty-state components
Files: `TransactionsEmptyState.tsx`, `BuyerDisputeEmptyState.tsx`, `NotificationEmptyState.tsx`
- Outer padding `py-16/py-20` → `py-10`.
- Illustration/icon `h-16 w-16` → `h-12 w-12`.
- Heading `text-xl font-bold` → `text-base font-semibold`.

### 7. Motion parity
- Confirm `src/hooks/use-reduced-motion.ts` exists (it was extracted in Phase H). If yes, import it in:
  - `src/pages/BuyerTransactions.tsx` → wrap `TransactionTable` rows
  - `src/pages/BuyerDisputes.tsx` → wrap `BuyerDisputeList`
  - `src/pages/BuyerNotifications.tsx` → wrap `NotificationList`
  - `src/pages/Dashboard.tsx` → wrap `MetricsCards` grid + `RecentPurchases` items
- Apply `sd-fade-in-stagger sd-delay-N` (1..6) to the first six visible children when `!prefersReducedMotion`.

## Out of Scope (still)
- Storefront product browsing UX (`BuyerMarketplace` product grid, product detail pages, Storefront pages).
- Deep transactional flows (BuyerTransactionDetail/Agreement/Verify/Tracking/Review, BuyerDisputeDetail, BuyerPaymentSummary, CartCheckoutReview).
- Backend, RLS, edge functions, design tokens — none change.

## Acceptance
- `DashboardHero` no longer has `bg-primary py-10`-class header.
- `MetricsCards`, `NotificationSummaryCards` visually indistinguishable in density from `SellerMetricsCards`.
- All buyer toolbars use `h-8 text-xs`.
- All buyer list rows match seller list-row vertical rhythm (≤56px row height for primary entries).
- Each long buyer list staggers in (or pops in instantly when `prefers-reduced-motion: reduce`).
- No new console errors; no horizontal overflow at 1246px.
