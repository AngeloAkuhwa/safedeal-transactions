# Fix right-side clipping in `/admin/disputes` table

Scope: only the desktop table in `src/pages/AdminDisputes.tsx` (lines ~506–640). No backend, no edge function, no other pages.

## Root cause

- `colgroup` allocates only **6%** to Actions and **8%** to Agent. At ~1100–1300px container widths that's ~66–78px for Actions, which cannot hold `Review` (orange button) + kebab (~120px) → button overflows and kebab gets pushed past the card edge.
- `px-6` (24px L+R = 48px) inside a 6% cell consumes all of it before the button renders.
- Agent column also uses `px-6` and the avatar+name has no `truncate`/`min-w-0`, so long names expand the row content.

## Fix

### 1. `colgroup` widths
Switch Actions and Agent to fixed pixel widths; redistribute the rest:

```tsx
<colgroup>
  <col style={{ width: "11%" }} />    {/* Priority */}
  <col style={{ width: "20%" }} />    {/* Dispute */}
  <col style={{ width: "19%" }} />    {/* Parties */}
  <col style={{ width: "12%" }} />    {/* Amount */}
  <col style={{ width: "13%" }} />    {/* Status */}
  <col style={{ width: "12%" }} />    {/* SLA */}
  <col style={{ width: "120px" }} />  {/* Agent */}
  <col style={{ width: "150px" }} />  {/* Actions */}
</colgroup>
```

### 2. Actions cell
- Reduce padding: `px-4 py-4` (not `px-6`) so the 150px col fits `Review` + kebab.
- Wrap inner row in `flex items-center justify-end gap-2 min-w-[132px]` (active) / `min-w-[160px]` (resolved → "View Resolution").
- Button: keep existing colors but add `whitespace-nowrap h-9 px-4` to prevent wrap.
- Kebab trigger: `h-9 w-9` square; keep `e.stopPropagation()` on `<td>` (already present) and add it to the trigger button as well so menu items don't bubble to row click.
- Header `<th>Actions</th>` → `px-4 py-4 text-right`.

### 3. Agent cell
- Padding `px-4 py-4`.
- Assigned: `<div className="flex items-center gap-2 min-w-0">` with `<span className="truncate text-xs">{name}</span>`; avatar gets `shrink-0`.
- Unassigned pill unchanged (already compact).
- Header `<th>Agent</th>` → `px-4 py-4`.

### 4. Truncation in earlier cells (so `table-fixed` doesn't push content)
- Dispute cell: wrap children in `min-w-0`; add `truncate` to `#code`, item title, and tx code lines (remove `max-w-[260px]` — col width handles it).
- Parties cell: existing `min-w-0` stays; ensure both name divs keep `truncate`.
- Amount: add `whitespace-nowrap` to the amount line.
- SLA: add `whitespace-nowrap` to the label line.

### 5. Container
- Desktop wrapper stays `hidden lg:block w-full` with **no** `overflow-x-auto` (already removed). Mobile cards path is unchanged.

## Acceptance

- At 1280–1536px viewport: no horizontal scrollbar; Actions column fully inside card; `Review` button and kebab both visible on every active row; `View Resolution` + kebab on resolved rows; ACTIONS header right-aligned and not clipped.
- Agent column compact; long admin names truncate with ellipsis.
- Row click still navigates; kebab click does not navigate; menu items work as before.
- Mobile card layout (`lg:hidden`) untouched.

## Files

- `src/pages/AdminDisputes.tsx` — only the desktop `<table>` block (lines ~505–640).
