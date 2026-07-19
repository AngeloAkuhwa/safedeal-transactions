## Goal
Bring `AdminAuditLogs` visual language in line with `AdminDashboard` (and the rest of the admin surface) so cards, typography, spacing, and header treatment feel like one system — without changing any data flow, filters, drawer behaviour, or export logic.

## What's off today (verified against `AdminDashboard.tsx` + `KpiCards.tsx`)
- Uses hardcoded `bg-slate-950 / bg-slate-900 / text-white / text-slate-400` instead of semantic tokens (`bg-background`, `bg-card`, `border-border`, `text-foreground`, `text-muted-foreground`). Breaks the shared dark/light theming.
- KPI cards are `p-5`, `h-36`, value `text-3xl font-bold`, label `text-sm` — dashboard KPIs use `p-4`, ~`h-[110px]`, value `text-2xl font-semibold tracking-tight`, label `text-xs`, icon tile `h-10 w-10 rounded-lg bg-{color}-500/15 text-{color}-400` (no border ring), grid gap `gap-3`.
- Custom sticky `HeaderBar` duplicates what `AdminLayout` already renders. Title is `text-xl`, dashboard standard is the layout's built-in header (`text-base`-ish, subtitle `text-sm text-muted-foreground`). Export/Compliance buttons use raw slate/emerald classes instead of the shared `Button` component variants.
- Filters card is `p-6` with `text-lg` heading and emerald focus rings — inconsistent with dashboard cards (`p-4`, `text-sm` headings, primary/ring tokens).
- Table container, row hover, chips, and drawer all use `slate-*` literals; row severity tints are fine conceptually but should read from tokens where possible.
- Outer wrapper forces `bg-slate-950 min-h-full` and `fullBleed` + `hideDefaultHeaders`, bypassing the standard `AdminLayout` chrome used by every other admin page.

## Plan (UI-only, no behaviour changes)

1. **Adopt standard AdminLayout chrome**
   - Remove `hideDefaultHeaders` and `fullBleed`. Pass `title="Audit Logs"` and `subtitle="Immutable compliance and forensic audit trail"` to `AdminLayout` like `AdminDashboard` does.
   - Delete the custom `HeaderBar` component. Move the two action buttons (Export Logs, Compliance Report) and the Immutable / Last-entry pills into a right-aligned toolbar row rendered as the first child inside the layout (a compact `flex items-center justify-between` bar above the KPI grid), so the sticky page header stays the shared one.
   - Replace raw `<button>`s with `<Button variant="outline" size="sm">` (Export) and `<Button size="sm" className="bg-emerald-600 hover:bg-emerald-500">` (Compliance) — matching dashboard's button treatment.

2. **Rebuild `StatCard` to mirror `KpiCards`**
   - Container: `rounded-xl border border-border bg-card p-4` (was `bg-slate-900 border-slate-800 p-5`).
   - Icon tile: `h-10 w-10 rounded-lg` with `bg-{color}-500/15 text-{color}-400` (drop the extra border ring).
   - Label: `text-xs text-muted-foreground` (was `text-sm text-slate-400`).
   - Value: `text-2xl font-semibold tracking-tight text-foreground` (was `text-3xl font-bold text-white`); keep the colored variant for High Severity / Storage by swapping `text-foreground` for `text-red-400` etc.
   - Sub line: `text-xs text-muted-foreground`.
   - Grid: `grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4` (was `gap-4`).
   - Skeleton height drops from `h-36` to `h-[110px] rounded-xl bg-card`.

3. **Filters card**
   - Wrapper: `rounded-xl border border-border bg-card`.
   - Header row: `p-4 border-b border-border`, title `text-sm font-semibold text-foreground` with `Filter` icon in `text-primary`, helper `text-xs text-muted-foreground`.
   - Body: `p-4`, inputs use `bg-background border-border text-foreground` and the shared `Input`/`select` styling with `focus-visible:ring-ring` (drop emerald-500 focus overrides).
   - Field labels: `text-xs font-medium text-muted-foreground`.
   - Buttons row uses shared `Button` variants (`variant="default"` for Search, `variant="ghost"` for Clear).

4. **Results table + row chrome**
   - Card wrapper: `rounded-xl border border-border bg-card overflow-hidden`.
   - Column header row: `bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground`.
   - Row hover: `hover:bg-muted/40`.
   - Severity left-border tints stay (`border-l-4 border-{sev}-500` + faint tint) but body text uses `text-foreground` / `text-muted-foreground`.
   - Actor cells: name `text-sm font-medium text-foreground`, meta `text-xs text-muted-foreground`.
   - Pills (severity, TXN, Dispute) keep colored `bg-{c}-500/15 border-{c}-500/30 text-{c}-400` scheme, drop `/20` heavy fills so they match dashboard chip weight.
   - Pagination footer: `border-t border-border p-3 text-sm text-muted-foreground`; page buttons use `Button variant="outline" size="sm"`.

5. **Drawer**
   - Panel: `bg-card border-l border-border`.
   - Section labels: `text-xs uppercase tracking-wider text-muted-foreground`.
   - Values: `text-sm text-foreground` / `font-mono` where applicable.
   - JSON block: `bg-muted border border-border text-foreground/90`.
   - Close and Copy buttons: `Button variant="ghost" size="icon"` / `Button variant="outline" size="sm"`.

6. **Skeletons & loading**
   - All skeletons switch to `bg-card` heights that match final cards (`h-[110px]` for KPI, `h-[68px]` per row for the table body).

7. **Cleanup**
   - Remove now-unused imports (`Bookmark`, `CalendarDays`, custom color helpers no longer needed).
   - Keep every hook, query, filter state, export handler, drawer state, and row-click behaviour exactly as-is.

## Out of scope
- No changes to `admin-audit-logs` edge function, service layer, filter semantics, exports, or realtime.
- No changes to what data is shown or how severity is derived — only how it looks.

## Verification
- Compare KPI row against `AdminDashboard` KPI row at the same viewport — card height, padding, icon tile, and typography should match pixel-for-pixel.
- Toggle light/dark (if enabled) to confirm no hardcoded slate leaks remain.
- Sticky page header behaviour matches other admin pages (no double header).
- Filters, table interactions, drawer open/close, and export still work end-to-end.