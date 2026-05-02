## Goal

Three things in one pass:

1. **Fix the broken product image fetch** in the `seller-analytics` edge function (the SQL select uses non-existent columns).
2. **Density / spacing pass** on the Seller Analytics page so it feels like a real desktop SaaS dashboard, not a stretched mobile layout.
3. **Phase E end-to-end test report** — confirm the cron jobs, secret, and atomic timeout RPC are wired correctly and producing the expected side effects.

## 1. Backend fix — product images on Top Products

The bug is in `supabase/functions/seller-analytics/index.ts` line 273-285. It selects `product_media(file_url, is_primary, position)` but those columns don't exist on `product_media`. Real schema: `product_media(file_id, sort_order, is_primary, …)` and `files(secure_url, file_url, …)`.

Patch the query and resolver:

```ts
.select(`
  id,title,stock_quantity,reserved_quantity,
  product_media(is_primary,sort_order,files(secure_url,file_url))
`)
…
const media = (p?.product_media ?? []) as any[];
const primary = media.find(m => m.is_primary)
  ?? [...media].sort((x,y) => (x.sort_order??0) - (y.sort_order??0))[0];
const f = primary?.files;
const image_url = f?.secure_url ?? f?.file_url ?? null;
```

No migration needed.

## 2. Density pass — `src/pages/SellerAnalytics.tsx` only

Keep all existing structure, copy, tooltips, hover, animations, click-throughs, and the chart-bucket fix. Tighten visuals only.

### Container & rhythm
- Section spacing: `space-y-6 sm:space-y-8` → `space-y-4 sm:space-y-5` to compress vertical rhythm.
- Page top padding: `py-6 sm:py-8` → `py-4 sm:py-6`.
- Header bottom margin handled by section gap (no extra spacer).

### KPI cards (compact)
- Grid breakpoints retuned: `grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6`. (3-up at laptop ≥768, 6-up at ≥1280.)
- Card body padding: `p-4 sm:p-5` → `p-3 sm:p-3.5`.
- Title: `text-[10px]` uppercase; value: `text-lg sm:text-xl` (down from `text-xl sm:text-2xl`); helper: `text-[10.5px]`; chip: `text-[10px]` with `py-0.5`.
- Card height naturally lands ~130–145px. Removed forced `h-full` shrinkage; chips render inline next to helper to save a row when both fit (`flex items-center justify-between gap-2 mt-1.5`).

### Revenue Trend
- Card padding `p-4 sm:p-5`.
- Chart height: `h-56 sm:h-64 md:h-72` (from `h-64/72/80`).
- New polished empty-state inside the chart area when `data.revenue_trend.data.length === 0`:
  - small `LineChart` icon (lucide), 28px
  - title: "No released revenue in this window yet."
  - helper: "Completed payouts will appear here once funds are released."
  - secondary button: `View transactions` → `/seller/transactions`
  - container height capped at `h-44 sm:h-52` (no giant blank).

### Transaction Health (compact)
- Card padding: `p-3.5 sm:p-4`.
- Title row: `text-xs font-semibold` + icon at top-right (already correct).
- Value: `text-2xl sm:text-3xl` (down from `text-3xl sm:text-4xl`).
- Bar: `h-1` (down from `h-1.5`); spacing `mt-2`.
- Grid: `grid-cols-2 lg:grid-cols-4 gap-3`.

### Top Products
- Replace the "No image" text-only fallback with a real placeholder: a centered `Package` icon (lucide) at `h-5 w-5 text-muted-foreground/60` inside the existing thumbnail box.
- Compact rows: padding `p-2.5`, gap `gap-2.5`, thumb `w-12 h-12 sm:w-14 sm:h-14`.
- Layout inside row: name (truncate, `text-sm font-semibold`) + stock chip on the right; line 2 `Completed: N`; line 3 grid 2-col on `sm` showing `Gross` (muted) and `Net Released` (sky-600 bold). Drop the persistent "View product analytics →" footer text — keep the affordance via the existing chevron and hover background. Saves vertical space.
- Link target fixed: `/seller/storefront/${p.product_id}` (the actual product detail route — `/seller/products/...` doesn't exist).

### Release Performance
- Row padding: `py-2.5 px-3` (down from `py-3`).
- Info banner padding: `px-3 py-2`.
- Note copy already updated previously: "Releases are processed only after buyer and seller confirmation, or after SafeDeal completes a review." ✓
- Card padding `p-4 sm:p-5`.

### Seller Trust Performance (compact + premium)
- Card padding: `p-4 sm:p-5`.
- Left column rows: `py-2` (down from `py-3`), font sizes unchanged.
- Right column trust ring: `w-28 h-28 sm:w-32 sm:h-32` (down from 32/36), border `border-[3px]`.
- **No-data state**: when `seller_rating === null` AND `completed_deals < 1`, render a smaller neutral pill instead of the dashed circle:
  ```
  ┌──────────────┐
  │  Trust Score │
  │  Not enough  │
  │   data yet   │
  └──────────────┘
  ```
  Plain card-style block (`rounded-xl border bg-muted/30 px-5 py-4 text-center`), no large empty circle.

### Header / Export CSV
- Reorder: button always uses `variant="default"` (sky primary). When `!data` → `disabled` + tooltip wrapper:
  ```
  Export becomes available when analytics data exists.
  ```
- Wrap with `TooltipProvider` so the disabled button still triggers the tooltip via a wrapping `span`.

## 3. Phase E end-to-end test (read-only verification)

Already confirmed via DB introspection:

- **Cron jobs registered & active**:
  - `auto-timeout-payments` — `*/15 * * * *` ✓ active
  - `flag-stuck-confirmations` — `0 3 * * *` ✓ active
  - `auto-escalate-silent-disputes` — `0 * * * *` ✓ active
- **Vault**: `cron_secret` present (created 2026-05-01).
- **Most recent runs at 2026-05-02 00:00**: `auto-timeout-payments` and `auto-escalate-silent-disputes` both **succeeded** (status returned 1 row). `flag-stuck-confirmations` only fires at 03:00 UTC daily — not yet today.

Additional checks the test will perform:

1. Confirm `timeout_transaction_atomic` RPC exists and is `SECURITY DEFINER` with `search_path` locked.
2. Confirm `system_logs`, `release_review_queue`, `product_inventory_logs` tables exist with RLS.
3. Curl each edge function with the `CRON_SECRET` header to confirm 200 / structured JSON response.
4. Tail `function_edge_logs` for the three job names — confirm no 500s in the last 24h.
5. Confirm zero unintended fund releases: query `escrow_ledger_entries` for any entries authored by the cron job names — there must be none.

Test results delivered as a summary block.

## Out of scope

- Service layer / type changes.
- New tables or migrations.
- Visual redesign of unrelated pages.
- Auto-release of funds (must remain manual / SafeDeal-reviewed).

## Files touched

- `supabase/functions/seller-analytics/index.ts` — fix product image join.
- `src/pages/SellerAnalytics.tsx` — density pass + product image fallback + Trust no-data state + Export tooltip.
