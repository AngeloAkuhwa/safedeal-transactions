## Goal
Make the `/admin/payouts` page header match the attached screenshot exactly.

## What the screenshot shows
- Left: `Payout Management` title + `Monitor and manage seller payout processing` subtitle
- Right: only two buttons — `Export Report` (outline) and `Process Batch` (emerald)
- No Reading Mode control, no theme toggle, no Paystack Balance pill in the header

## Changes (UI only)

### `src/pages/AdminPayouts.tsx`
In the `headerSlot` block:
- Remove `<AdminReadingModeControl variant="desktop" />`
- Remove `<ThemeToggle />`
- Keep `Export Report` (outline) and `Process Batch` (emerald, with tooltip + count badge) exactly as-is
- Remove now-unused imports: `AdminReadingModeControl`, `ThemeToggle`

Keep the existing Paystack Balance info strip (it already lives in the page body, below the header — matches screenshot which only shows the header band).

## Out of scope
- No KPI tile changes (already match)
- No table, filters, tabs, or business logic changes
- No sidebar changes
