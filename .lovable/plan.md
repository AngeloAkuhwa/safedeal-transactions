## Problem
At the user's viewport (875px), the admin left sidebar is hidden because `AdminLayout` only shows it at `lg` and above (`hidden lg:block`). `AdminDisputes` and `AdminDisputeDetail` both pass `hideDefaultHeaders`, which suppresses `AdminMobileHeader` — the component that normally renders the hamburger that opens the mobile drawer. Result: no left sidebar, no way to reopen it. On `AdminDisputeDetail`, the right resolution sidebar additionally uses `xl:` breakpoints, so it's also hidden between `lg` and `xl` — same root cause: missing access affordance.

## Fix (UI only)

### A. `src/components/admin/AdminLayout.tsx`
Always expose a mobile menu trigger when below `lg`, even if `hideDefaultHeaders` is true.

- Add a fixed-position hamburger button (top-left, `lg:hidden`, `z-40`, small icon button styled like other admin floaters) that calls `setMobileOpen(true)`. Render it only when `hideDefaultHeaders` is true (so it doesn't double up with `AdminMobileHeader`).
- Keeps the existing mobile `Sheet` drawer wiring intact — clicking it opens the same left `AdminSidebar`.

### B. `src/pages/AdminDisputeDetail.tsx` — right sidebar visibility
Lower the right resolution sidebar's breakpoint from `xl:` to `lg:` so it appears at the same point the main app sidebar becomes available, matching the dual-pane intent.

- The `<aside>` currently `xl:w-[380px] xl:shrink-0 xl:border-l xl:min-h-0 xl:overflow-y-auto` → switch the `xl:` prefixes used purely for layout (width, border-l, sticky/overflow) to `lg:`.
- The container `flex` wrapper that currently activates `xl:` row layout → also `lg:`.
- Update the "Mobile action bar" toggle from `xl:hidden` → `lg:hidden` so the inline CTA only appears when the sidebar is collapsed.

### Out of scope
- No changes to data, services, or other pages.
- `AdminDisputes` (queue) has no right sidebar — only fix A applies there.

## Files
- `src/components/admin/AdminLayout.tsx`
- `src/pages/AdminDisputeDetail.tsx`
