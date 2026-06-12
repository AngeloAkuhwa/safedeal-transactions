Match `PayoutsTable.tsx` to the reference HTML exactly — visual only, no business logic or data changes.

## Changes (single file: `src/components/admin/payouts/PayoutsTable.tsx`)

### 1. Card shell
- Container: `bg-slate-900 border border-slate-800 rounded-xl overflow-hidden` (replace `border-border bg-card`).
- Header strip (`Payout Records` + count + Refresh): `p-6 border-b border-slate-800`, title `text-white text-lg font-semibold`, count `text-slate-400 text-sm`, Refresh as raw `<button class="px-3 py-1.5 bg-slate-800 text-slate-300 rounded text-sm hover:bg-slate-700">` with `fa-arrows-rotate` icon (react-icons/fa6 `FaArrowsRotate`) — drop the shadcn `Button variant=outline`.

### 2. Table head
- `<tr class="bg-slate-800 border-b border-slate-700">`, each `<th>`: `text-left p-4 text-slate-400 font-medium text-xs uppercase tracking-wider`.
- Checkbox styled as native `rounded border-slate-600 bg-slate-700 text-emerald-500 focus:ring-emerald-500` (keep shadcn Checkbox but wrap with matching classes).
- All columns left-aligned (Amount + Actions currently right-aligned — switch to left to match ref).

### 3. Rows
- Row: `border-b border-slate-800 hover:bg-slate-800/50 transition-all`.
- Cells: `p-4`.

### 4. Payout ID cell
- Keep `PayoutIdIcon` (already uses correct tone boxes), but swap Lucide icons → react-icons/fa6 (`FaTriangleExclamation`, `FaArrowsRotate`, `FaCheck`, `FaClock`, `FaBan`) with `text-xs` size, matching ref exactly.
- Text block: ID `text-white font-medium text-sm` (drop the truncated mono `id.slice(0,14)…` styling — use a normal `text-white font-medium text-sm` with truncate). Caption uses tone classes already present.

### 5. Seller cell
- Avatar `w-8 h-8 rounded-full`, name `text-white font-medium text-sm`, sub `text-slate-400 text-xs`.

### 6. Transaction cell
- Row 1: `text-slate-300 hover:text-emerald-400 font-medium text-sm` + `FaArrowUpRightFromSquare text-slate-500 text-xs`.
- Row 2: `text-slate-400 text-xs`.

### 7. Amount cell
- `text-white font-semibold text-sm` + `text-slate-400 text-xs` for NGN — left-aligned.

### 8. Payout Account cell
- Verified badge: `inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded text-[10px] font-bold` with `FaCheck text-[8px]`.
- Invalid badge: same shape, red tones, with `FaXmark`.
- Bank name `text-slate-300 text-sm font-medium`, masked account `text-slate-400 text-xs`.
- "No verified payout account" → `text-red-400 text-xs font-medium` (keep behavior, just match tone).

### 9. Status cell
- Update `PayoutStatusPill` invocation only if needed; if the pill already renders tone pills, leave it. (Out of scope to redesign pill — only confirm it visually aligns. No changes if it already uses tone-500/20 + border tone-500/30 + tone-400.)

### 10. Initiated cell
- Absolute `text-slate-300 text-sm`, relative `text-slate-400 text-xs`.

### 11. Actions cell
- Primary CTA buttons re-skinned to match ref:
  - Release/Retry: `px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold` with `FaRotateRight` icon for Retry.
  - Details/View: `px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium` with `FaEye`.
  - Unblock: same slate-800 style.
- Kebab: `w-8 h-8 bg-slate-800 hover:bg-slate-700 rounded-lg flex items-center justify-center text-slate-300 hover:text-white` with `FaEllipsisVertical text-xs`. Keep shadcn DropdownMenu but restyle trigger.

### 12. Footer / Pagination
- Wrapper: `p-4 border-t border-slate-800`.
- "Showing …" text: `text-slate-400 text-xs`.
- Page buttons: `w-9 h-9 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg` for inactive, `bg-emerald-500 text-white` for active, ellipsis as plain slate-400.
- Prev/Next: same slate-800 square buttons with `FaChevronLeft`/`FaChevronRight`.

### 13. Loading skeleton
- Wrap in matching `bg-slate-900 border-slate-800 rounded-xl` shell.

## Out of scope
- No changes to `PayoutStatusPill`, `PayoutMobileCards`, eligibility logic, primary-CTA decision tree, data fetching, formatters, dropdown menu items, or any service/API code.
- No new dependencies (react-icons/fa6 already installed).
