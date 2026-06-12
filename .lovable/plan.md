
# Admin Payout — Layout Alignment to Reference Design

UI-only alignment pass. No business logic, edge function, or schema changes. Match the uploaded `Payout Management.html` reference more faithfully.

## Mismatches found vs reference

1. **KPI tiles**
   - Reference: icon block `w-12 h-12` top-left + colored badge chip top-right (+3 / +12 / +5 / Today / Week / Avg), label below, then big `text-2xl` value. Padding `p-6`.
   - Current: icon `w-9 h-9`, no badge chip, `text-lg/xl` value, `p-4`. Looks visibly smaller and missing the chip.

2. **Combined filter card**
   - Reference: Tabs + Search + Filters button on top row, dropdown filters (Status, Date Range, Amount Range, Bank Verification, Quick Filters) inside the same card on the row below.
   - Current: Tabs/search/filters in one card with only the basic search; the dropdown filter row is not rendered. Refresh button currently lives in the filter row but should live in the table header per reference.

3. **Payout Records header**
   - Reference: Table sits in its own card with a sticky header strip: `Payout Records` title (left), `218 payouts found` + `Refresh` button (right).
   - Current: no record-card header.

4. **Table columns / cells**
   - Header `PAYOUT ID` not `PAYOUT`; `INITIATED` not `AGED`.
   - Payout ID cell: small status-color icon block + full payout id (or readable short id) + reason caption underneath. Currently we show just truncated id + tooltip — keep tooltip but render fuller id and icon.
   - Initiated cell: show absolute date (`Jan 19, 2:45 PM`) on top + relative (`2 hours ago`) muted underneath, matching reference. Keep hover tooltip.
   - Amount cell: amount on top, `NGN` muted caption below (replaces `USD` from reference).
   - Status pills: use filled tinted style with leading icon (already mostly in `PayoutStatusPill`; verify Failed/Processing/Completed look like reference).
   - Action column: solid colored primary CTA (`Retry` emerald-tinted, `Release` emerald, `View`) + outline `Details` (eye icon) + kebab. Currently the primary CTA is unstyled outline in some cases.

5. **Pagination row**
   - Reference: `Showing 1-10 of 218 payouts` left, numbered pagination right, inside the records card footer.
   - Current: no pagination UI. Add a static pagination footer wired to current `rows.length` / `summary.tab_counts` (real paging stays single-page for now; just render the footer scaffold so layout matches).

6. **Header action row**
   - Reference: header keeps only `Export Report` (outline) + `Process Batch` (emerald). No Reading Mode / Theme / Paystack pill in the header row (those don't exist in the reference).
   - Current: we added Reading Mode, ThemeToggle, and a Paystack Balance pill into the header. Per the user's directive to match the reference exactly, move the Paystack Balance pill out of the header into the summary cards area as a 7th compact strip above the KPI grid, and keep Reading Mode + ThemeToggle as small icon-only buttons grouped left of `Export Report` (cannot be dropped — they're required global shell controls).

## Files to edit

- `src/components/admin/payouts/PayoutSummaryCards.tsx`
  - Tile: padding `p-6`, icon block `w-12 h-12`, value `text-2xl font-bold`, label `text-xs mb-1`, add top-right badge chip prop (`+N` for deltas, `Today`/`Week`/`Avg` for time tiles). Match colors per reference (orange/blue/red/emerald/purple/cyan).
  - Add an optional `badge?: { label: string; tone: "orange"|"blue"|"red"|"emerald"|"purple"|"cyan" }` prop.

- `src/components/admin/payouts/PayoutFilters.tsx`
  - Drop `Refresh` button (moves to table card).
  - Keep search + `Filters` button; ensure search `w-72` and inline with tabs.

- New small component `src/components/admin/payouts/PayoutAdvancedFilters.tsx`
  - Renders the 5 dropdowns (Status, Date Range, Amount Range, Bank Verification, Quick Filters) as a `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4` row. Controlled state lives in `AdminPayouts` but for this pass these are visual selects wired to existing list params where applicable (status → tab; others are no-op placeholders that match the reference layout — server filters not yet implemented and out of scope).

- `src/components/admin/payouts/PayoutsTable.tsx`
  - Wrap table in a card with a sticky header: title + count + Refresh.
  - Rename column labels: `PAYOUT ID`, `INITIATED`.
  - Payout ID cell: small tinted icon square (red for failed/blocked, blue for processing, emerald for completed, orange/gray default) + full short id + caption (block reason / failure reason / "Completed successfully").
  - Initiated cell: absolute date line + relative line muted.
  - Amount cell: amount + `NGN` muted caption.
  - Action cell: solid Retry/Release/Unblock primary + outline `Details` (eye + label on `md+`) + kebab.
  - Footer: pagination scaffold (`Showing X-Y of Z` + numbered buttons, current page highlighted emerald). Disabled prev/next when only one page.

- `src/components/admin/payouts/PayoutMobileCards.tsx`
  - Mirror amount-with-NGN caption and initiated date + relative.
  - No advanced filter row on mobile (keep collapsed inside Filters button).

- `src/pages/AdminPayouts.tsx`
  - Header: keep `Export Report` + `Process Batch` only on the action side; group `AdminReadingModeControl` + `ThemeToggle` as small icon buttons to the left of `Export Report` (compact, no extra rows).
  - Move Paystack Balance pill: render it as a thin strip directly above the KPI grid (full width, dismissible-style info card) instead of inside the title block.
  - Pass badge props into `PayoutSummaryCards` (deltas come from `summary.summary.*.delta_today` if present, else hidden gracefully).
  - Insert `PayoutAdvancedFilters` row inside the existing filter card under the tabs/search row.
  - Pass `total`, `page`, `limit` to `PayoutsTable` for the footer.

## Out of scope

- No new edge functions, no server-side advanced filter params wiring (UI only).
- No change to release/retry/block logic, eligibility, batch worker, or detail drawer.
- No new tabs or KPIs beyond what the reference shows.

## Acceptance

- KPI tiles visually match reference (large icon left, badge chip right, big value).
- Filter card contains tabs + search + Filters button + dropdown filter row, all inside one card.
- Payout Records sits in its own card with its own header (title + count + Refresh) and pagination footer.
- Table columns labelled `PAYOUT ID` and `INITIATED`; cells render icon + id + reason / amount + NGN / date + relative.
- Header row shows: title + subtitle (left); Reading Mode + Theme (icons) + Export Report + Process Batch (right). Paystack balance moves to an info strip above KPI grid.
- Mobile cards keep parity (no advanced filter row, but amount caption + date layout match).
