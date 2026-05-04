# Admin Transaction Monitor — Production Polish

Scope: refinements only. No data-shape changes, no new endpoints. Touches `src/pages/AdminTransactions.tsx` plus 3 small new presentation components. All data continues to flow from `admin-transactions-monitor` and `admin-transaction-actions` edge functions.

## 1. Desktop polish

**Summary cards (`summaryTiles`)**
- Reduce padding `p-4 → p-3.5`, icon tile `h-10 w-10 → h-8 w-8`, value `text-2xl → text-xl`, fixed min height so all 6 align.
- Skeleton bar styled to match final value height to prevent jump.
- Hover lift kept but lowered to `-translate-y-px` for less bounce.

**Table density & sticky header**
- Wrap `<table>` in `max-h-[calc(100vh-380px)] overflow-auto` so the header is sticky inside the table area: `<thead className="sticky top-0 z-10 bg-card">`.
- Standardize row height: `py-2.5` cells, `align-middle`, line-clamp item title to 1 line (with `title` attr).
- Action column collapses to: `View`, `Notes`, `More` (move Ledger into the More menu — `RowActionsMenu` already supports it).
- Action cell `w-[120px]` so icons stay aligned across rows.

**Row highlighting (state-driven, color-blind safe)**
- Frozen → `bg-cyan-500/[0.04]` + 2px left border `border-l-cyan-500/60`.
- Disputed → `border-l-orange-500/60` + subtle bg.
- High risk / fraud watch → `border-l-red-500/60`.
- Default rows keep `border-l-transparent` for layout parity.
- Snowflake / shield icons remain so color isn't the only signal.

**Badges**
- Show **one** primary badge per cell. Status column: only Tx status badge (money status stays as small caption beneath — already done).
- Flags column: render badge only when `riskLevel !== "clean"`; show `—` otherwise to reduce noise.
- Escrow column: hide pill when state is `pending` / `released`; replace with muted text label.

**Overflow**
- Move horizontal scroll to inner table wrapper only; outer card stays at full width (already mostly done — just confirm `overflow-hidden` on outer card so border-radius clips correctly).

## 2. Mobile polish

**Cards**
- Reorder card body to: header (code/date + status badge) → item title → amount + protection (right-aligned) → buyer/seller compact line → escrow/risk badges row (only when non-default) → footer with primary action (`View`) + More menu.
- Drop the explicit "Buyer/Seller" two-column block; replace with single line `Buyer • Seller` truncated.
- Hide `Last activity` line unless tone is `warn` or `danger`.
- Reduce vertical paddings: `p-3 → p-2.5`, separators `border-t` → `mt-2 pt-2 border-t border-border/60`.

**Filter chips**
- Already horizontally scrollable; add `snap-x snap-mandatory` and `scrollbar-none` utility (Tailwind `[scrollbar-width:none] [&::-webkit-scrollbar]:none`).

**Search**
- Pull search bar **above** quick chips on mobile (`flex-col` stacking with search first), keeping it prominent and always visible. Filters chip row stays beneath.

**Bottom nav**
- Add `pb-[calc(64px+env(safe-area-inset-bottom))]` to the page wrapper so cards / pagination aren't hidden behind nav. Currently only the mobile card list has `pb-20` — apply at page level.

## 3. Empty states (new component `TransactionsEmptyState`)

One presentational component, variant-driven, used in both desktop table tbody and mobile list:

| Variant | When |
|---|---|
| `no-data` | API returned 0 rows AND no filters active |
| `no-search` | `debouncedSearch` non-empty AND 0 results |
| `no-filtered` | Any filter active AND 0 results |
| `no-disputes` | `activeQuick === "in_dispute"` AND 0 results |
| `no-flagged` | `activeQuick === "flagged"` AND 0 results |

Each has icon + heading + 1-line hint + "Clear filters" CTA where appropriate.

## 4. Loading states

- **Summary skeletons**: 6 shimmer tiles matching final card dimensions (only on `initialLoad`).
- **Filter panel**: render as-is even on first load (controls are static). No skeleton needed.
- **Table/cards**: existing skeletons retained, refined to match new row height (desktop) and new card layout (mobile).
- **Subtle inline loading on filter changes**: dim `tbody` / mobile list with `opacity-60 pointer-events-none transition-opacity` while `isFetching && !initialLoad`. Already partly present via the search spinner — extend to the whole list.

## 5. Error states

- Existing error banner kept; copy adjusted: "Failed to load Transaction Monitor".
- Add toast via `sonnerToast.error` on refresh failure with **Retry** action button (not just banner).
- Action failures already use `sonnerToast.error` — add an explicit "Retry" affordance in the toast for `freeze/flag/escalate`.

## 6. Animations

- Header: wrap title block in `animate-fade-in` (already on subsections).
- Summary cards: keep existing `sd-fade-in-stagger` (already in place).
- Filter panel: `animate-fade-in` (already in place).
- Table rows: keep stagger only for **first 6 rows**, no stagger on subsequent fetches (avoid re-animating on realtime). Detect via `initialLoad` flag.
- Badges: remove any `animate-pulse` from badges (none currently — confirm).
- Live indicator pulse: keep but wrap in `motion-safe:animate-pulse`.
- Add `motion-reduce:transition-none motion-reduce:animate-none` to row hover/lift effects globally on this page (utility class on wrapper).

## 7. Accessibility

- All `IconBtn` already has `aria-label`. Wrap each in `<Tooltip>` for hover hint (use existing `TooltipProvider`).
- Add `aria-label` to refresh, export, sort, and filters buttons.
- Add `<caption className="sr-only">Platform transactions, sortable, filterable</caption>` on the table.
- Filter `<label>` wrapping is in place — confirm `htmlFor`/id pairing for inputs.
- Status, escrow, risk: each badge already pairs an icon with text; confirm icon has `aria-hidden`.
- Keyboard: ensure quick filter chips are real `<button>` (already), focus-visible ring `focus-visible:ring-2 focus-visible:ring-blue-500/60` added to chips, IconBtn, BottomNav, and PaginationBar buttons.

## 8. Files touched

```text
src/pages/AdminTransactions.tsx                              (refinements)
src/components/admin/transactions/TransactionsEmptyState.tsx (new)
src/components/admin/transactions/StateRowDecoration.ts      (new — small helper returning row className per row state)
```

No DB migrations. No edge function changes. No service-layer changes. No new dependencies.

## 9. Acceptance check

- 1366×768 desktop: 6 KPI cards on one row, table header sticky inside scrollable area, action column never wraps, frozen/disputed/high-risk rows visually distinct via border + subtle bg + icon.
- 390×844 mobile: search prominent at top, chips scroll horizontally with snap, cards compact (~140–160 px tall), bottom nav doesn't cover last card.
- All five empty-state variants render with correct copy.
- `prefers-reduced-motion: reduce` disables stagger, hover lift, and live-pulse.
- Lighthouse a11y for the page ≥ 95 (manual smoke check).
- No hardcoded counts/money/names anywhere — only the static enum option labels and visual tokens.
