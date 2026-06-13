## Goal

Bring the mobile view of `/admin/payouts` in line with the attached reference HTML. Desktop layout stays untouched. No business‑logic changes — purely presentational.

## Gaps found (current vs reference)

1. **Mobile header has no page title.** `AdminMobileHeader` only shows the SafeDeal logo. The "Payout Management / Monitor and manage seller payouts" block lives in `headerSlot`, which is `hidden lg:block`, so mobile users see no screen title.
2. **Summary cards are too large and stack to 1 column on phones.** `PayoutSummaryCards` uses `grid-cols-1 sm:grid-cols-2 …`, `p-6`, icon `w-12 h-12`, value `text-2xl`. Reference is **2 columns from the smallest size**, `p-4`, icon `w-9 h-9`, value `text-xl`, with the +delta chip styled smaller.
3. **Tabs + filters wrapper is a heavy slate panel on mobile.** `AdminPayouts.tsx` wraps `PayoutTabs`/`PayoutFilters`/`PayoutAdvancedFilters`/`PayoutBatchBar` in `bg-slate-900 border rounded-xl p-6`. Reference has no panel on mobile — search, scrollable tab pills, and a square sliders button sit directly on the page background, and advanced filters are collapsed into a togglable panel opened by that sliders button.
4. **Tab styling differs.** `PayoutTabs` uses a segmented `bg-slate-800 p-1` container. Reference uses individual pill buttons (`bg-slate-800` inactive / `bg-emerald-500` active) in a horizontally scrollable row, with a 44×44 sliders icon button to its right.
5. **Advanced filters are always visible.** On mobile they should be hidden behind the sliders button (collapsible panel matching the reference).
6. **Search input position/styling.** Reference puts a full‑width rounded search input *above* the tabs row; current `PayoutFilters` sits to the right of the tabs in a flex row.
7. **Mobile payout cards don't match.** `PayoutMobileCards` is missing: the status‑icon square + payout code + reason mini‑header, the top‑right colored status badge, the bottom row with `time · ago` on the left and the primary CTA(s) on the right, and the "VERIFIED" green chip beside the masked bank account.
8. **Batch bar styling differs slightly.** Reference uses a compact gradient card with three equal CTAs (Process / Retry / Export) and a small × close button. Current bar is OK but oversized for mobile and only exposes Process.
9. **No mobile access to Export Report / Process Batch.** The header‑slot CTAs only render `lg:block`, leaving mobile with no way to trigger export or batch process from the page chrome. Reference keeps "Process" inside the batch bar; we just need to ensure that's reachable and add a small mobile Export option (icon button) in the screen subtitle area.
10. **Bottom padding for mobile bottom‑nav.** Reference uses `pb-24`; current main has none, so the last card can collide with any bottom nav.

## Changes

Frontend / presentation only. Files to touch:

- `src/components/admin/AdminMobileHeader.tsx` — accept optional `title` + `subtitle` props and render them below the top bar (mirrors the reference's two‑line header block). Wire from `AdminLayout` so each admin page can pass its own.
- `src/components/admin/AdminLayout.tsx` — forward `title`/`subtitle` props to `AdminMobileHeader`.
- `src/components/admin/payouts/PayoutSummaryCards.tsx` — switch outer grid to `grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6`; reduce tile padding and typography on `<sm` (`p-4`, icon `w-9 h-9`, value `text-xl`, label `text-xs`). Desktop sizes preserved via responsive classes.
- `src/components/admin/payouts/PayoutTabs.tsx` — restyle as a horizontally scrollable pill row (no segmented background). Active pill `bg-emerald-500 text-white`, inactive `bg-slate-800 text-slate-400`. Container becomes `flex gap-1.5 overflow-x-auto`.
- `src/components/admin/payouts/PayoutAdvancedFilters.tsx` — accept a `collapsed` prop (or expose a `MobileFilters` wrapper). When collapsed on mobile, render nothing; render only when toggled open. Keep the existing grid for desktop (`md:grid` always visible).
- `src/components/admin/payouts/PayoutMobileCards.tsx` — rebuild card to match the reference structure:
  - Row 1: checkbox + colored status‑icon square + (payout code, one‑line reason) on the left, status pill on the right.
  - Row 2: seller avatar + name + small badge ("New Seller" etc. when available).
  - Row 3: amount + `TXN‑CODE • item title` on the left, `bank ****1234` + green VERIFIED chip on the right.
  - Row 4: `entered_queue_at` formatted as `Mon d, h:mm aa • Xh ago` on the left, action buttons on the right (Release/Retry/Unblock as primary + View).
- `src/components/admin/payouts/PayoutBatchBar.tsx` — compact mobile variant: 8×8 icon square, "{n} selected / Total: ₦X" text block, × close, and a row of equal‑width buttons. Keep current desktop variant via `sm:`/`md:` classes.
- `src/pages/AdminPayouts.tsx` —
  - Pass `title`/`subtitle` to `AdminLayout` so they reach the mobile header.
  - Restructure mobile layout: remove the `bg-slate-900 border … p-6` wrapper on `<lg`; render search, tab row + sliders toggle, optional filter panel, batch bar, list.
  - Add a small mobile sliders toggle button next to the tabs that shows/hides `PayoutAdvancedFilters`.
  - Add a tiny mobile Export icon button in the subtitle row (re‑uses `handleExport`).
  - Add `pb-24` (or `pb-16`) on the mobile main column so the last card clears any bottom UI.

## Out of scope

- No edits to API, services, or detail drawer behavior.
- No change to desktop table or desktop header CTAs.
- No accessibility or analytics rework beyond what the visual changes already imply.

## Verification

1. Resize preview to 375×812 and 414×896; confirm:
   - Mobile header shows "Payout Management" + subtitle.
   - Summary cards render as 2 columns with compact tiles.
   - Search bar sits above tabs; tabs scroll horizontally; sliders button toggles a filter panel.
   - Payout cards match reference: status icon block, top‑right status pill, seller row, amount + bank row with VERIFIED chip, time + actions footer.
   - Selecting a card surfaces the batch bar with Process/Retry/Export.
2. Resize to ≥1024px; confirm desktop layout and table look unchanged.
3. Click a card → detail drawer opens; release/retry/unblock buttons still call the same handlers.
