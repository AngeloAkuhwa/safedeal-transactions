## Goals
1. On the **Dispute Detail** page, render the hamburger menu **inline** inside the page's sticky header on mobile/tablet (<lg), matching how AdminMobileHeader places it on other pages. Drop the floating overlay button for this page.
2. Give mobile/tablet (<lg) users **proper access to the right Resolution Sidebar** via a slide-in Sheet drawer, opened from the existing "Take Action · Review Case" button. Keep the inline (stacked) sidebar at lg+.
3. Apply the same inline-hamburger treatment to the **Dispute Queue** page header so it matches.

## Implementation

### A. Expose `onOpenMenu` from `AdminLayout`
- `AdminLayout` already accepts `mobileHeaderSlot` as a render-prop `({ onOpenMenu }) => ReactNode`. We will reuse the same pattern for `headerSlot` so pages with custom sticky headers can receive `onOpenMenu` too.
- Change `headerSlot?: ReactNode` → `headerSlot?: ReactNode | ((opts: { onOpenMenu: () => void }) => ReactNode)` and call it accordingly.
- Suppress the floating fallback hamburger when `headerSlot` is a function (it owns the trigger).

### B. `src/pages/AdminDisputeDetail.tsx`
- Convert the `header` constant into a function that receives `onOpenMenu` and renders a `<Menu>` icon button at the far left on `<lg` (right next to the existing back arrow). Remove the temporary `pl-16` padding.
- Pass it via `headerSlot={(opts) => header(opts)}` and stop rendering `header` inside `children`. (Keep summary strip and rest of content in children.)
- **Right sidebar Sheet on <lg:**
  - Wrap the existing right `<aside>` in a `<div className="hidden lg:block">` so it only renders at lg+.
  - Add a `Sheet` whose `SheetContent side="right"` renders the same `<ResolutionSidebar>` props on `<lg`. Trigger via the "Take Action · Review Case" button (replace its current `onClick` to open the sheet instead of the resolve dialog directly). Add local `useState` `sidebarOpen`.

### C. `src/pages/AdminDisputes.tsx` (queue)
- Same treatment: convert the `<header>` block to consume `onOpenMenu` via `headerSlot` render-prop and place a `<Menu>` icon button on the left at `<lg`. Drop the temporary `pl-16` padding.

### D. Cleanup in `AdminLayout`
- Keep the floating fallback hamburger only as a safety net for pages that pass `hideDefaultHeaders` AND neither `mobileHeaderSlot` nor a function-style `headerSlot`. So once Disputes and Dispute Detail adopt the render-prop, the overlay disappears for them.

## Out of scope
- No service/data changes.
- No styling change to the ResolutionSidebar internals.

## Files
- `src/components/admin/AdminLayout.tsx`
- `src/pages/AdminDisputeDetail.tsx`
- `src/pages/AdminDisputes.tsx`
