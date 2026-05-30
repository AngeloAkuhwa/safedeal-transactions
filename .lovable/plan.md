## Goal
Restyle the `LinkedTile` component in `src/pages/AdminDisputeDetail.tsx` so the "Linked Records & Quick Actions" grid matches the screenshot 100%.

## Current vs Target

**Current:** Horizontal layout — icon square on the left, title/subtitle stacked to its right, chevron on the far right (vertically centered). Subtitle uses monospaced font.

**Target (screenshot):** Vertical layout per tile:
- Row 1: small rounded icon badge in the top-left, arrow icon (`ArrowRight`) in the top-right (muted).
- Row 2 (below, with breathing room): title in white, semibold, ~sm/base size.
- Row 3: subtitle in muted slate (code/ID), regular weight, not mono-styled badge.
- Card background slightly lighter than container, rounded-xl, subtle border, hover lift.
- Escrow Record tile shows a small **red notification dot** next to the icon (top area).

## Changes (UI-only)

### A. `LinkedTile` component (~line 2096)
Rewrite to vertical layout:
- Container: `rounded-xl border border-border/60 bg-muted/20 p-4 hover:bg-muted/40 hover:border-blue-500/40 transition` with `flex flex-col gap-3 min-h-[110px]`.
- Top row: `flex items-start justify-between` → icon badge (`h-9 w-9 rounded-lg grid place-items-center` + tone bg/text) on the left + a relative wrapper for the notification dot; `ArrowRight` (h-4 w-4 text-muted-foreground) on the right.
- Bottom: title `text-sm font-semibold text-foreground`, subtitle `text-xs text-muted-foreground mt-0.5` (drop `font-mono`).
- New optional prop `showDot?: boolean` → renders a `h-2 w-2 rounded-full bg-rose-500` absolutely positioned at top-right of the icon badge.
- Keep disabled state (no arrow / reduced opacity / cursor-not-allowed).

### B. Grid usage (~line 758-777)
- Keep the 6 tiles & order. Pass `showDot` on the Escrow Record tile.
- Replace `ChevronRight` with `ArrowRight` import where the tile uses it (chevron stays elsewhere).

### Out of scope
No data/service changes. No other sections touched. Icons, tones, and click handlers preserved.

## Files
- `src/pages/AdminDisputeDetail.tsx` (LinkedTile component + the 6 tile call sites)
