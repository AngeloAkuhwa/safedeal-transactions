# Admin Payout Management — Design Alignment

UI-only correction pass. No payout business logic, no Paystack transfer changes, no edge function changes (one optional cleanup noted at the end).

## 1. Page header (remove duplicates)

Current cause: `AdminPayouts.tsx` lets `AdminLayout` render the default `AdminHeader` (which already shows Reading Mode, ThemeToggle, Filters, Export Report) **and** also renders its own action row below it with Paystack pill + Export Report + Process Batch. That produces the duplicated Export, the stray Filters, the moon icon, and the disconnected second-row controls.

Fix in `src/pages/AdminPayouts.tsx`:
- Pass a custom `headerSlot` to `AdminLayout` so the default `AdminHeader` is replaced for this page only.
- New header layout (desktop, sticky, same border/background as default):
  - Left: `Payout Management` title + `Monitor and manage seller payout processing` subtitle.
  - Right (single row, in order): `AdminReadingModeControl` (kept — global shell), `ThemeToggle` (kept — global shell), `Export Report` (outline), `Process Batch` (emerald primary). 
  - No `Filters` button in the page header.
- Remove the existing in-body action row (the second Export Report + second Process Batch + floating Paystack pill).

## 2. Paystack balance placement

Move the Paystack pill out of the action row and into the title block:
- Render it directly under the subtitle inside `headerSlot`, left-aligned.
- Compact pill: `Paystack Balance · ₦2,865,490.00`. When `bal.ok === false`, show `Paystack Balance · Unavailable`.
- Keep amber state when balance < pending release total.

## 3 + 4. KPI cards consistency and sizing

`PayoutSummaryCards` already renders the 6 expected tiles in the right order. Two corrections:
- Source consistency: the summary endpoint counts *all* payouts (correct for global KPIs), but the user perceives a mismatch because the page lands on `pending_release` while KPIs read globally. Fix perception by:
  - Defaulting the page to `all` tab (matches the "All" KPI scope) so KPI counts and visible rows agree on first load. (`useState<PayoutTab>("all")`.)
  - Leaving per-tab counts on the tab chips themselves (already wired via `summary.tab_counts`).
- Sizing: tighten the grid to match the reference — `grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3`, reduce tile padding to `p-4`, icon block `w-9 h-9`, value `text-xl`, remove the unused top-right spacer row. Keep NGN formatting (already uses `formatMoney(..., "NGN")`).

## 5. Tabs, search, filters row

In the filter card:
- Keep tab order: All, Pending Release, Blocked, Processing, Completed, Failed, Reversed, `Disputed / On Hold`.
- Fix the "Disputed / On Hold" rendering: the current label string is fine; the visual "dot" in the screenshot is the count badge appearing when there are 0 rows. Change `PayoutTabs` to only render the badge when `count > 0` (already coded — verify the `summary.tab_counts.on_hold` value isn't unexpectedly non-zero; add `&& count > 0` guard explicitly).
- Active tab style: switch from generic `bg-primary` to the SafeDeal blue/emerald active pill (`bg-blue-600 text-white`) used elsewhere in admin.
- Search input: 
  - Placeholder → `Search seller, transaction, payout ID...`.
  - On desktop sits to the right of the tabs (already does via `lg:flex-row`); ensure it doesn't squeeze the tabs by giving the tab strip `flex-1 min-w-0 overflow-x-auto` and search `w-72 shrink-0`.
  - On `<lg`, search wraps below tabs (already does).
- Filters button: lives only inside `PayoutFilters` (no header duplicate). Verify the dropdown opens the filter panel.

## 6. Table columns

`PayoutsTable` already matches the column list. Adjustments:
- Header label `Payout` (already capitalised by the `uppercase` class; keep as-is — reads `PAYOUT`).
- Payout cell: show first 10 chars of `r.id` + ellipsis, wrap in a `Tooltip` showing full id; reason text under it for blocked/failed (already present).
- Transaction cell: if `item_title` is null, show `No item snapshot` muted instead of `—`.
- Payout Account cell: when `r.payout_account` is null OR `verification_status !== 'verified'`, render `No verified payout account` in red-400 text instead of `—`.
- Aged: keep `formatRelative`; add `title={new Date(r.entered_queue_at).toLocaleString()}` for hover exact timestamp.
- Status pill: already correct via `PayoutStatusPill`.
- Actions: keep eye + kebab, primary action contextual (already wired).

## 7 + 8. Row action and batch button logic

`eligibleForRelease` is already strict. Make it visibly enforced:
- In `PayoutsTable`, disable the row checkbox for any non-`awaiting_release` status (released/processing/reversed/completed never selectable). Current code disables based on `eligibleForRelease(r).ok`, which already covers this — keep, but add explicit short reasons in the tooltip for processing/released/reversed cases.
- Header `Process Batch` button:
  - `disabled` when `selectedRows.filter(eligible).length === 0`.
  - Tooltip: `Select eligible pending payouts to process` when disabled.
- Failed-tab Retry: keep current behaviour; do not allow Retry in Process Batch (batch is release-only this pass).

## 9. Currency

Audit `AdminPayouts.tsx`, `PayoutSummaryCards`, `PayoutsTable`, `PayoutMobileCards`, `PayoutBatchBar`, `PayoutDetailDrawer` — every `formatMoney(...)` call already passes a currency from the server (`NGN`). Replace any fallback `r.currency` usage where currency could be missing with explicit `"NGN"` default. Remove any `$`/`USD` literals if present (grep confirms none in payout components, but add a guard in `formatMoney` callsite defaults).

## 10 + 11. Empty / zero state and tab filtering

- `PayoutsTable` and `PayoutMobileCards` already render an empty card. Update copy to:
  - Title: `No payouts found`
  - Body: `There are no payouts for the selected filter.`
- Tab filtering is server-side via `tab` query; trust it. Add a client-side double check: when `tab !== 'all'`, defensively filter `rows` to the expected statuses before render (guards against stale fetches).

## 12 + 13. Desktop / tablet / mobile

- Desktop: keep `AdminLayout` sidebar, sticky custom header, summary cards, filter card, table, right-side detail drawer. All preserved.
- Tablet: KPI grid `md:grid-cols-3`; tabs horizontally scroll; search wraps below.
- Mobile: `PayoutMobileCards` already handles cards + full-screen drawer + batch bar — no changes beyond empty-state copy and currency defaults.

## 14. Out of scope (explicit)

- No edge function logic changes.
- No fee math, escrow, refund, or Paystack transfer changes.
- No new sections, drawers, or buttons.
- No change to `release-payout` / `retry-payout` behaviour.

## Files to edit

- `src/pages/AdminPayouts.tsx` — replace default header with `headerSlot`, move Paystack pill, default tab → `all`, batch button tooltip/disabled state.
- `src/components/admin/payouts/PayoutSummaryCards.tsx` — tighter sizing.
- `src/components/admin/payouts/PayoutTabs.tsx` — active style, guard badge on `> 0`, flex sizing.
- `src/components/admin/payouts/PayoutFilters.tsx` — placeholder text, width.
- `src/components/admin/payouts/PayoutsTable.tsx` — empty-state copy, Payout id tooltip, item-title and payout-account fallbacks, aged tooltip, processing/released tooltip reasons.
- `src/components/admin/payouts/PayoutMobileCards.tsx` — empty-state copy, currency default, payout-account fallback.

No files created, deleted, or renamed. No backend or migration changes.

## Acceptance check

- Header shows only: title/subtitle (+ balance pill) on the left, Reading Mode + Theme + Export Report + Process Batch on the right. No Filters button. No duplicated rows.
- Paystack pill sits cleanly in the title block.
- Landing on `/admin/payouts` shows `All` tab; KPI totals match what the table can display.
- Tabs render `Disputed / On Hold` with no stray dot/badge when count is 0; active tab uses blue active style.
- Search placeholder reads `Search seller, transaction, payout ID...`; tabs do not get squeezed.
- Table shows readable payout id with hover-full id, item fallback copy, account fallback in red when missing, aged hover timestamp.
- Process Batch disabled unless ≥1 eligible row selected; tooltip explains why.
- All currency in NGN; no `$`.
- Empty tab renders the new empty state.
- Mobile/tablet layouts unchanged structurally; only copy/currency/fallback fixes carry through.
