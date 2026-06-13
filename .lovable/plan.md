## Goal

Make the Payout Management screen fully wired: KPI cards reflect real DB counts that stay in sync with the table, every filter actually filters the list (including custom date range), and all CTAs route to real destinations instead of "coming soon" toasts.

---

## 1. KPI cards — real-time, accurate, auto-refreshing

**Backend (`supabase/functions/admin-payouts-summary/index.ts`)**
- Align summary counts with what the tabs actually show so the cards never disagree with the table:
  - `pending_release` → all rows with `status = 'awaiting_release' AND release_blocked = false` (drop the strict `money_status = 'funds_pending_release'` requirement so the card matches the Pending tab).
  - `processing` → `status IN ('pending','processing')`.
  - `failed` → `status = 'failed'` (drop the `retry_allowed` filter so it matches the Failed tab; tabs already use the same definition).
- Add `released_today.count` and `released_week.count` alongside the existing amounts (UI already shows ₦ but the spec is "reflect payout items" — counts help when amount = 0).
- Keep `delta_24h` as-is.

**Frontend (`src/pages/AdminPayouts.tsx`)**
- After any action that mutates payouts (release, retry, unblock, batch, manual refresh, filter change that completes), call both `loadSummary()` and `loadList()` (already partly done — audit each path).
- Add a 60s polling interval for `loadSummary()` while the page is mounted so cards stay "live" without user action.
- Pass the summary's `tab_counts` to `PayoutTabs` and render small count chips next to each tab label (Pending 3, Failed 1, etc.) so the cards and tabs visibly agree.

---

## 2. Make all filters work (incl. custom range)

**Replace static `PayoutAdvancedFilters.tsx` with a controlled component**
- Props: `value: PayoutFilterState`, `onChange(next)`.
- Fields become real `<select>` bound to state:
  - **Status** → maps to existing `PayoutTab` (drives the tab change too; selecting "Pending" switches tab and clears the static "All" pill).
  - **Date Range** → `last_7d | last_30d | last_3m | custom`. When `custom`, show a date-range popover (use existing `react-day-picker` + `Popover` from shadcn) with From/To inputs and an Apply button.
  - **Amount Range** → `any | 0-10k | 10k-100k | 100k-1m | 1m+`.
  - **Bank Verification** → `all | verified | unverified | pending`.
  - **Quick Filters** → `none | failed_only | blocked_only | high_priority` (high_priority = `needs_release_review = true OR refund_in_flight = true`).
- All state lives in `AdminPayouts.tsx` and is serialized into the existing `useSearchParams` so filters survive reload and can be shared via URL.

**Backend (`admin-payouts-list/index.ts`)**
- Accept new query params: `date_from`, `date_to`, `amount_min`, `amount_max`, `bank_status`, `quick`.
- Apply server-side:
  - `created_at >= date_from`, `created_at <= date_to` (date_from defaults derived from `range=last_7d|30d|3m`; custom uses explicit ISO bounds).
  - `amount >= amount_min`, `amount <= amount_max`.
  - `bank_status` filters via the bulk-fetched `payout_accounts` map (post-filter in JS, same way `on_hold` works today).
  - `quick=failed_only` → `status='failed'`; `blocked_only` → `release_blocked=true OR status='blocked'`; `high_priority` → keep rows with `needs_release_review` or `refund_in_flight`.
- Service: extend `listPayouts(params)` signature with the same fields and forward them.

---

## 3. Wire up CTAs

**Header buttons (`AdminPayouts.tsx`)**
- **Export Report** → open a new export dialog (reuse `ExportDisputesDialog` pattern from `src/components/seller-disputes/` as a template): collect date range + status, POST to a new `admin-payouts-export` edge function that returns a signed CSV URL, then trigger download. If the user prefers MVP, do a client-side CSV from current filtered rows + a toast "Exported N rows" — we'll go with the client-side CSV first so the button works immediately, and leave the edge function as a follow-up.
- **Process Batch** → already calls `handleBatchProcess`; when 0 selected, instead of just a toast, auto-select all eligible rows on the current page and open a confirm dialog with the count + total amount, then proceed.

**Row & menu CTAs (`PayoutsTable.tsx` → `RowMenu`)**
- `View Seller Profile` → `navigate('/admin/users/' + row.seller.id)` (route already exists in admin shell).
- `View Transaction` / `View Transaction Details` → already wired via `onOpenTransaction`; ensure all menu variants use it (currently the failed/processing/completed variants do; verify the default branch too).
- `View Failure Details` / `View Block Reason` / `View Processing Status` / `View Completion Details` → open the existing `PayoutDetailDrawer` (`onOpen`) — they already do; confirm.
- `Update Bank Account` → `navigate('/admin/users/' + row.seller.id + '?tab=payout')` (deep-link to seller's payout settings tab).
- `Download Receipt` → call new helper that generates a client-side PDF/CSV receipt from `PayoutDetail` (reuse `TransactionReceipt` rendering approach). MVP: trigger a CSV download with payout + transaction + pricing.
- `Add Internal Note` → open a small `Dialog` with a textarea and call existing `addInternalNote()` service (already implemented).
- `Block Payout` / `Pause Payout` → open a `Dialog` collecting a reason and call `blockPayout()` (Pause maps to block with reason "paused for review").
- Remove all `comingSoon()` toasts.

---

## Out of scope
- No DB schema changes; no new tables or RLS policies.
- No redesign of the drawer or table layout — purely behavior wiring and one new filter component.
- The full server-side CSV export edge function is a follow-up; MVP uses client-side CSV.

## Files touched
- `supabase/functions/admin-payouts-summary/index.ts`
- `supabase/functions/admin-payouts-list/index.ts`
- `src/services/admin-payouts.service.ts`
- `src/pages/AdminPayouts.tsx`
- `src/components/admin/payouts/PayoutAdvancedFilters.tsx` (rewrite as controlled)
- `src/components/admin/payouts/PayoutTabs.tsx` (count chips)
- `src/components/admin/payouts/PayoutsTable.tsx` (replace `comingSoon` calls)
- New: `src/components/admin/payouts/PayoutNoteDialog.tsx`, `PayoutBlockDialog.tsx`, `PayoutExportDialog.tsx`
- Small CSV helper in `src/lib/payout-export.ts`
