# Phase H — Seller Tabs Polish Parity (match SellerAnalytics)

Bring the other seller pages up to the same visual density, polish, and motion language already proven on **Seller Analytics**. Storefront and storefront sub-views are explicitly out of scope.

## Pages affected
- `SellerDashboard.tsx`
- `SellerTransactions.tsx`
- `SellerPayouts.tsx`
- `SellerDisputes.tsx`
- `SellerPrivateOffers.tsx`
- `SellerProfileSettings.tsx`

Plus shared components used by these pages:
- `components/seller/SellerMetricsCards.tsx`
- `components/seller/SellerQuickActions.tsx`
- `components/seller/SellerAlertBanners.tsx`
- `components/seller/SellerRecentActivity.tsx`
- `components/seller-disputes/SellerDisputeSummaryCards.tsx`

Excluded: `SellerStorefront.tsx`, `SellerProductCreate.tsx`, `SellerProductDetail.tsx`, `SellerProductPreview.tsx`, `PublicStorefront.tsx`, `PublicProductDetail.tsx`.

## The "Analytics language" we are propagating

1. **Container & rhythm**
   - `max-w-[1400px]` (not `max-w-7xl`)
   - `px-4 sm:px-6 lg:px-8`
   - `py-3 sm:py-4` page padding (down from `py-8`)
   - `space-y-3 sm:space-y-3.5` section spacing

2. **Headers**
   - Title: `text-lg sm:text-xl font-bold tracking-tight`
   - Subtitle: `text-xs text-muted-foreground` with `Last updated` chip + `Clock` icon when relevant
   - Right-side controls: 32px high (`h-8 text-xs`) selects/buttons

3. **KPI cards** (reusable pattern from Analytics `KpiCard`)
   - `rounded-lg`, `p-2.5 sm:p-3`
   - Title: `text-[10px] uppercase tracking-wide font-semibold text-muted-foreground`
   - Value: `text-base sm:text-lg lg:text-xl font-bold tabular-nums`
   - Right-aligned `Info` tooltip (12px) + hover `ChevronRight` affordance
   - Whole card is a `Link` with hover lift (`-translate-y-0.5`) and ring focus
   - Optional `TrendChip` (success/warning/danger/info/muted tones) under value

4. **Tonal chip system** (export the `chipToneClass` map from a shared util)
   - Add `src/lib/seller-ui.ts` exporting `chipToneClass`, `TrendChip`, `ChipTone` so all pages share one source

5. **Tables → mobile card stacks**
   - On `< sm`, replace `<Table>` with stacked compact cards (already partly done in `SellerRecentActivity`); apply same to `SellerTransactions` and `SellerPayouts` history table

6. **Motion**
   - `animate-fade-in` on header
   - Staggered `animationDelay: index * 50–70ms` on KPI grids and list rows
   - Respect `prefers-reduced-motion` via the same `useReducedMotion` hook (extract to `src/hooks/use-reduced-motion.ts`)

7. **Footer / Nav** — already updated in Phase G; no further changes.

## Per-page changes

### SellerDashboard
- Wrap all `<section>`s in single `max-w-[1400px]` container with `space-y-3.5`
- `SellerMetricsCards`: drop oversized hero variants, switch to the compact `KpiCard` (Info tooltip + ChevronRight). Keep the existing 6-col responsive grid but with the analytics density.
- `SellerQuickActions`: tighten to `p-2.5`, add hover-lift + `ChevronRight`.
- `SellerAlertBanners`: 12px icons, `text-xs`, denser padding `p-2.5`.
- `SellerRecentActivity`: align row chrome (badges, hover ring) with analytics `ReleaseRow`.

### SellerTransactions
- Header row matches analytics (title `text-xl`, period/filter selects `h-8 text-xs`).
- Move existing 4 KPIs into the analytics `KpiCard` shell.
- Filter chip rail: convert to `TrendChip` tones from the shared util.
- Table: `text-xs` headers (already), but tighten cell padding `py-2.5`; mobile breakpoint shows stacked cards (status/amount/buyer/CTA).
- Pagination footer: 32px controls.

### SellerPayouts
- Header and metric strip use `KpiCard` (Net released, Awaiting release, Held in escrow, Failed payouts).
- "Auto-release queue" + "Failed payouts" cards: rebuild rows with `ReleaseRow` pattern (tonal background + ChevronRight).
- Payout History table: tighter cells, mobile card stack. Status pill uses tonal chip.
- Right rail: payout destination card uses analytics's compact `Card` with `p-3` and `text-[13px]` rows.

### SellerDisputes
- Header `text-xl`, container `max-w-[1400px]`, `py-4`.
- `SellerDisputeSummaryCards`: replace with analytics `KpiCard` (Total, Open, Awaiting Buyer, Resolved) + Info tooltips.
- Trust banner: 3 mini cards using `HealthCard` pattern (icon + value + 1px progress bar).
- Dispute table: same density treatment as transactions.

### SellerPrivateOffers
- Header `text-xl` + `Last updated` chip.
- Three summary KPIs (Total / Claimed / Expired) as `KpiCard`s with tonal chips (success / muted / warning).
- Table rows: tighter `py-2.5`, status badge from shared chip tones (`claimed → success`, `expired → muted`, `pending → info`).
- Mobile: stacked cards.

### SellerProfileSettings
- Drop the gradient hero (`py-8`) → compact header strip `py-4` matching analytics.
- Container `max-w-[1400px]`, `py-4`.
- Right rail sticky cards: `rounded-lg`, `p-3`, denser typography.
- Section cards (`SellerVerificationSection`, payout destinations, notification toggles): use `text-[13px]` row labels and 32px-high controls.

## Shared utilities to add

```
src/hooks/use-reduced-motion.ts        // extracted from SellerAnalytics
src/lib/seller-ui.ts                   // ChipTone, chipToneClass, TrendChip,
                                       // KpiCard, HealthCard, ReleaseRow
```

All six pages then import from `@/lib/seller-ui` to guarantee parity. SellerAnalytics is refactored to consume the same shared exports (drop its local copies) so future drift is impossible.

## Out of scope
- No business-logic changes, no new edge functions, no DB migrations.
- No copy changes beyond what's needed to fit the denser layout.
- Storefront and product-builder pages remain untouched.

## Acceptance criteria
- All six listed pages share the analytics container width, header sizing, KPI card density, tonal chip palette, and stagger animations.
- No `max-w-7xl` or `py-8` hero patterns remain on these six pages.
- `text-2xl`/`text-3xl` H1s on these pages are gone.
- KPI cards across pages are visually identical in size, padding, and hover behavior.
- Mobile (≤ sm) shows card stacks instead of horizontally-overflowing tables on Transactions, Payouts, Disputes, Private Offers.
- Storefront pages untouched (`git diff` shows no changes under Storefront/Product files).
- Reduced-motion users see no fade-in/stagger animations.
