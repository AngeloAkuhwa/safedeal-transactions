## Problem
The floating hamburger button I added at `fixed left-3 top-3` overlaps the page-level headers on `AdminDisputes` and `AdminDisputeDetail` because those pages render their own sticky headers with content starting at the very left edge (`px-6`). On the Disputes Queue screenshot, the H1 "Dispute Resolution Queue" is partially hidden behind the menu icon.

The Transaction Monitor screen looks fine because it uses the default `AdminMobileHeader` (no `hideDefaultHeaders`), which is laid out as a real flex row with the menu on the left and refresh on the right.

## Fix (UI only)

### A. `src/pages/AdminDisputes.tsx` — sticky page header
- Reserve space for the floating hamburger on viewports below `lg` by adding `pl-14 lg:pl-6` (or `pl-16 lg:pl-8` to keep the wider lg padding) to the inner header container at line 354 — currently `px-6 py-5 lg:px-8`.
- Keep the title/subtitle and right-side action cluster otherwise unchanged.

### B. `src/pages/AdminDisputeDetail.tsx` — sticky case header (line 431)
- Add the same `pl-14 lg:pl-6` (and adjust the lg variant so the original `lg:px-8` left padding is preserved) to the header bar so the back arrow / breadcrumb chips aren't hidden under the hamburger.

### C. `src/components/admin/AdminLayout.tsx` — refine the floating button
- Bump `z-index` to `z-50` (already set) — keep.
- Slightly smaller (`h-9 w-9`) and softer styling so it visually matches the existing `AdminMobileHeader` menu button rather than competing with page chrome.
- No change to placement or visibility logic.

### Out of scope
- No changes to other admin pages or to default mobile header.
- No data or service changes.

## Files
- `src/pages/AdminDisputes.tsx`
- `src/pages/AdminDisputeDetail.tsx`
- `src/components/admin/AdminLayout.tsx`
