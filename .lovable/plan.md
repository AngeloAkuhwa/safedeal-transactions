## Scope
Right sidebar of the Admin Dispute Detail page only (`src/pages/AdminDisputeDetail.tsx`, plus the existing `.no-scrollbar` utility in `src/index.css`). No business logic, no other pages.

## Problem (from screenshot)
- The page header (Back / "Dispute Details" / "2 Days Overdue" / Print) currently spans the **entire width**, so the right sidebar starts **below** the header.
- In the target design, the right sidebar is its own full-height column starting at the very top — the header only spans the **main content** column.
- A visible vertical scrollbar shows at the boundary between the main content and the sidebar (the divider line in the screenshot).

## Changes

### 1. Restructure the page shell so the sidebar is full-height
In `AdminDisputeDetail.tsx`:
- Stop passing the dispute header through `AdminLayout`'s `headerSlot`. Keep `hideDefaultHeaders` + `fullBleed` + `fullHeight`.
- Inside the page body, render a two-column flex row that fills the full main area:

```text
<div flex-col lg:flex-row lg:h-full>
  <section main column, flex-1, min-w-0, own scroll>
    renderHeader(...)        <-- header now lives ONLY above main column
    Summary strip
    Tabs + content
  </section>
  <aside right sidebar, full height of row, own scroll>
    ...existing sidebar content...
  </aside>
</div>
```

- The mobile header trigger (hamburger) currently inside `renderHeader` keeps working since it's rendered inside the main column on mobile; on `lg+` the aside sits beside it.
- Result: the sidebar's top edge aligns with the very top of the workspace (same line as the header), matching the design.

### 2. Remove the divider scrollbar
- Add `no-scrollbar` to the main `<section>` (it already has `lg:overflow-y-auto`) so the vertical scrollbar that sits right next to the sidebar border is hidden.
- Keep `no-scrollbar` on the `<aside>` (already present).
- `.no-scrollbar` utility in `src/index.css` already exists — no CSS change needed.

### 3. Leave the rest alone
- No changes to header content, sidebar content, colors, action buttons, summary cards, data, or services.
- Mobile layout (stacked) and the mobile Sheet sidebar are untouched.

## Out of scope
Left admin sidebar, AdminLayout itself, main cards, tabs, dialogs, services, business logic.
