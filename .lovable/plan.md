## Goal

Make the mobile and tablet view of `/admin/payouts` (everything below the `lg` breakpoint) render exactly as the attached `Payout Management 2.html` reference. Desktop (`lg+`) layout and all business logic stay unchanged.

The screenshots show three remaining gaps vs the reference:

1. **Summary cards still stack to 1 column** on the screenshotted widths even though the file says `grid-cols-2`. The cards also still use desktop typography because the responsive split is gated on `sm:` and the user is testing inside a narrower preview frame.
2. **Advanced filters panel is always visible** (Date Range / Amount Range / Bank Verification / Quick Filters), instead of being collapsed behind the sliders button.
3. **Payout cards don't match the reference card** — they show the payout UUID as the header, the seller name as the headline, and stack the bank + amount + item + CTAs vertically. The reference card has: status‑icon square + payout code + reason on row 1, status pill top-right, seller avatar + name on row 2, amount + transaction code/item on left and bank `****1234` + green VERIFIED chip on right on row 3, time on left + small action buttons on right on row 4.

## Changes

All changes are frontend/presentation only, scoped to mobile+tablet. The `lg:` desktop branch in `AdminPayouts.tsx` is not touched.

### `src/components/admin/payouts/PayoutSummaryCards.tsx`
- Force 2 columns from the smallest width: `grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 lg:gap-4` (drop the `sm:` split).
- Tile: use compact sizing unconditionally below `lg` — `p-4 lg:p-6`, icon box `w-9 h-9 lg:w-12 lg:h-12`, value `text-xl lg:text-2xl`, badge `text-[10px] lg:text-xs px-1.5 py-0.5`. This guarantees the reference's tight tiles on every mobile + tablet width regardless of preview frame.

### `src/components/admin/payouts/PayoutAdvancedFilters.tsx`
- Accept a new optional `variant?: "desktop" | "mobile"` prop (default `desktop`).
- When `variant="mobile"`, render the four selects as a single-column stack with `space-y-3`, smaller labels (`text-xs`), `bg-slate-800 border-slate-700` inputs, matching the reference filter panel. Quick Filters select moves inside this same panel.
- Desktop branch keeps the existing grid layout untouched.

### `src/pages/AdminPayouts.tsx` (mobile branch only)
- Keep the existing mobile search input.
- Replace the current tab row + sliders button with a 1:1 port of the reference:
  - `overflow-x-auto` row of pill buttons sourced from `PayoutTabs` (already updated to pill style). Active tab `bg-emerald-500 text-white`, inactive `bg-slate-800 text-slate-400`.
  - Right-aligned 44×44 `bg-slate-900 border border-slate-800 rounded-xl` sliders button toggling `mobileFiltersOpen`.
- Remove the mobile Export icon button from this row (the reference doesn't expose Export here; Export stays available via the header download icon in `AdminMobileHeader`).
- Render `<PayoutAdvancedFilters variant="mobile" />` only when `mobileFiltersOpen`.
- Add the "Payout Records {n} / Refresh" subhead from the reference above the mobile card list.
- Keep `pb-20` on the mobile list container.

### `src/components/admin/payouts/PayoutMobileCards.tsx` (full rewrite to match reference)
Card outer: `bg-slate-900 border border-slate-800 rounded-xl p-4`.
Internal layout `flex items-start gap-3`:
- Checkbox column: `mt-1` shadcn `Checkbox` (disabled tooltip stays).
- Main column `flex-1 min-w-0 space-y-3`:
  - **Row 1** — `flex items-start justify-between gap-2`:
    - Left cluster: status-icon square (`w-8 h-8 rounded-lg border` colored per status — red for blocked/failed, blue for processing, orange for awaiting_release, emerald for released) with the matching FA-equivalent lucide icon, then a tight 2-line block: `text-white font-semibold text-xs font-mono` payout code (`r.transaction.code || PAY-{r.id.slice(0,8)}`) and a one-line `text-{tone}-400 text-xs` reason (blocked reason / failure reason / status label).
    - Right: existing `<PayoutStatusPill>` already styled `bg-{tone}-500/20 border border-{tone}-500/30 text-{tone}-400 text-xs font-semibold px-2 py-0.5 rounded-lg`.
  - **Row 2** — `flex items-center gap-2`: 8×8 `Avatar`, seller name `text-white text-sm font-medium truncate`, optional small slate chip for `New Seller` (skip when not available).
  - **Row 3** — `flex items-center justify-between gap-2`:
    - Left: `text-white font-bold text-base` formatted amount, then `text-slate-400 text-xs truncate` showing `{transaction.code} • {item_title}`.
    - Right: `text-slate-400 text-xs truncate` bank line `{bank_name} ****{last4}`, then `inline-flex … bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded text-[10px] font-bold` "VERIFIED" chip when `payout_account.verification_status === 'verified'`, otherwise red "UNVERIFIED".
  - **Row 4** — `flex items-center justify-between gap-2`:
    - Left: `text-slate-500 text-xs` relative time (`formatRelative(entered_queue_at)`).
    - Right: action buttons `h-8 px-3 text-xs` — Release (emerald) when `awaiting_release`, Retry when `failed && retry_allowed`, Unblock when `release_blocked`, plus `View` outline button with `Eye` icon. Buttons go through the same handlers passed from `AdminPayouts`.

Empty / loading states keep the existing skeleton + empty card with the new rounded-xl size.

### `src/components/admin/payouts/PayoutTabs.tsx`
- Verify the mobile pill row matches the reference exactly: `flex gap-1.5 overflow-x-auto`, pills `px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap`, active `bg-emerald-500 text-white`, inactive `bg-slate-800 text-slate-400`. Adjust if any segmented-bg styling lingers.

### `src/components/admin/payouts/PayoutBatchBar.tsx`
- Confirm mobile compact variant matches reference (`bg-gradient-to-r from-emerald-500/10 to-blue-500/10 border-emerald-500/30 rounded-xl p-3`, three equal CTAs Process/Retry/Export, close X). Wire Retry to a new optional `onRetry` prop (no-op pass-through to `handleBatchRetry` in AdminPayouts that retries all selected failed payouts via `payoutsApi.retryPayout`), and Export to `handleExport` already in the page.

## Out of scope

- Desktop layout, desktop table, desktop header CTAs.
- API / service / drawer behavior.
- Sidebar navigation, accessibility audit, analytics events.

## Verification

1. Preview at 360×800, 390×844, 414×896, 768×1024 (tablet): summary cards render as 2 columns with compact tiles; search above tabs; tabs scroll horizontally as pills with emerald active; sliders button toggles the filter panel; advanced filters hidden by default.
2. At ≥1024px: desktop slate panel, table, and header CTAs render identically to before.
3. Each mobile payout card matches the reference: status icon square + payout code + reason, top-right status pill, seller row, amount + bank with VERIFIED chip, time + action buttons.
4. Selecting cards surfaces the batch bar with Process / Retry / Export. Process and Retry call the same handlers used today; Export downloads the same CSV as the header action.
5. Click a card → existing detail drawer opens; Release/Retry/Unblock still call the existing handlers.
