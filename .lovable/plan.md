
# /admin/disputes — Final visual parity pass

Goal: bring the Central Admin Dispute Resolution Queue to pixel-level parity with the approved reference. Sidebar, layout shell, KPI count logic, edge function, and routing are already correct — this pass is **visual + filter wiring only**. No backend changes.

## Scope (files touched)

- `src/pages/AdminDisputes.tsx` — only file edited.
- `.lovable/plan.md` — replace with this plan.

Sidebar, `AdminLayout` `fullBleed` mode, edge function, services, and KPI data are already in place and stay untouched.

---

## 1. KPI strip — fixed 6-up grid, no premature compression

Currently: `grid-cols-2 md:grid-cols-3 xl:grid-cols-6` → drops to 3-up at our 1246px viewport.

Change to a true single-row layout that matches the reference:

```
grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6 lg:gap-5
```

Per card:
- `bg-card border border-border rounded-xl p-5` (already correct)
- Remove `hover:-translate-y-0.5` (too animated vs. approved); keep `hover:border-blue-500/40` only.
- Active card: keep `ring-1 ring-blue-500/30 border-blue-500/50` — but only when the user explicitly selected it. `quick` defaults to `"open"`, so Open Disputes is the only one highlighted on load (matches reference). No change needed to default; just confirm Overdue is NOT pre-selected.
- Icon tile sizes and colors already match.

## 2. Queue Filters chips — palette + width parity

Approved reference shows:
- Overdue → red filled chip (active-looking) **when it has overdue cases**, but only the currently-selected chip uses the solid blue fill.
- Open → orange tinted chip
- Others → neutral slate chips
- Active chip uses the queue's own color, not a generic blue. The reference clearly shows Open as orange filled when selected.

Update chip rendering so:
- Inactive chip colors stay as currently coded (overdue=red tint, open=orange tint, rest=slate).
- Active state uses the chip's own palette at higher saturation instead of `bg-blue-600 text-white`:
  - overdue active → `bg-red-500/20 border-red-500/50 text-red-200`
  - open active → `bg-orange-500/20 border-orange-500/50 text-orange-200`
  - awaiting_seller active → `bg-yellow-500/20 border-yellow-500/50 text-yellow-200`
  - under_review active → `bg-blue-500/20 border-blue-500/50 text-blue-200`
  - escalated active → `bg-purple-500/20 border-purple-500/50 text-purple-200`
  - resolved active → `bg-emerald-500/20 border-emerald-500/50 text-emerald-200`
  - all active → `bg-foreground/10 border-border text-foreground`
- Counts: pull from `data.kpis` for the 5 status chips; for `resolved` show `resolved_today`; for `all` show `data.pagination.total`.

## 3. Select dropdowns — fix bright white focus ring

Currently raw `<select>` with `border-border bg-background`. The browser/native focus outline shows as bright white in dark mode.

Replace the three filter selects with a unified class:

```
appearance-none w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground
focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/60
disabled:opacity-60
```

Add a small chevron via background SVG (or wrap in a relative div with a `ChevronDown` icon positioned absolutely on the right) so the native arrow is hidden. Apply identically to the **Search input** so the input's focus ring also matches (currently uses shadcn defaults — fine, but verify there's no white outline; if needed add `focus-visible:ring-blue-500/40`).

## 4. Wire Agent + Amount Range filters to URL state

`agent` and `amount_bucket` are already read into params for the API call but the chip-state and KPI display ignore them. No change needed in behavior; just ensure:
- `setParam("agent", …)` and `setParam("amount_bucket", …)` are wired (already are).
- Show a `Clear filters` ghost button when any of `q | reason | agent | amount_bucket` is set; resets all four and `quick` to `"open"`.

Add `Clear filters` to the right of the search row (or next to Advanced Filters) — small `variant="ghost"` text-only button, only rendered when at least one of those four is set.

## 5. Active Dispute Queue table — density and alignment

Change in the desktop table only:

- `<thead>` cell padding `px-4 py-3` → `px-6 py-4` to match reference 56px header.
- `<tbody>` row cells (`<td>`) padding `px-4 py-3` → `px-6 py-4` (priority cell keeps `pl-6` and the absolute accent strip).
- Increase `<thead>` background contrast: `bg-muted/30` → `bg-muted/40 border-b border-border`.
- Row hover: `hover:bg-muted/30` → `hover:bg-muted/40` (subtler in dark).
- Adjust column widths slightly per request:
  - Priority 11%, Dispute **19%**, Parties 18%, Amount 12%, Status 13%, SLA 13%, Agent 8%, Actions **6%**.
- Action cell:
  - Use `size="sm"` Review button (already correct), but tighten the kebab spacing: wrapper `inline-flex items-center gap-1.5 justify-end`.
  - Ensure no `whitespace-nowrap` is forcing overflow.
- Card header padding: `px-5 py-4` → `px-6 py-4` to align with header rows.

No `overflow-x-auto` on desktop (already removed).

## 6. Header bar polish

- Header padding: `px-6 py-6 lg:px-8` → `px-8 py-5` to match reference.
- Title: keep `text-2xl font-semibold`.
- Live sync pill: use `bg-muted/40 border-border` instead of `bg-background` so it reads as a subtle pill, matching the approved look.
- Button order is already `Live sync | Export | Open Investigation` — keep.

## 7. Confirm filter behavior

- `quick` chip → updates `params.quick`, edge function re-queries; KPI strip continues to show **global** KPI counts (matches reference behavior — KPIs are global, only the table filters).
- Search submit → updates `params.q`.
- Reason/Agent/Amount → update params.
- Empty state already renders when `rows.length === 0`.
- `Clear filters` resets q, reason, agent, amount_bucket but preserves `quick`.

No backend or edge function changes — the existing `admin-disputes-queue` already handles all these filters.

## 8. Acceptance

1. At 1246×890 viewport: 6 KPI cards on one row, no horizontal scroll, Actions column fully visible.
2. Select dropdowns no longer show a bright white focus outline — they show a soft blue ring instead.
3. Queue Filter chips use queue-specific colors when active (Open=orange, Overdue=red, etc.), not generic blue.
4. Open Disputes KPI is the only highlighted card on first load (because `quick` defaults to `"open"`).
5. Table rows feel 56–60px tall (not cramped), header row is taller, dividers between rows are clean.
6. Clear filters appears only when q/reason/agent/amount are set, and resets them when clicked.
7. Sidebar with active Disputes item is visible at desktop (already working — confirm not regressed).
8. Mobile (<lg) still renders card layout (already working).

## Out of scope

- Edge function logic, data mapping, amount fallback chain (already done in previous pass).
- Sidebar nav items (already correct in `AdminSidebar`).
- New animations beyond existing pulse and refresh-spin.
- Any seller/buyer-facing UI.
