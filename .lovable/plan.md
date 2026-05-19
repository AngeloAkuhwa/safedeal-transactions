
# /admin/disputes — Correction Pass v3 (match approved reference exactly)

Goal: bring `/admin/disputes` to true visual parity with the approved screenshot. No new backend logic, no new write paths. Pure UI/layout correction.

---

## Root cause of remaining drift

1. `AdminLayout`'s `main` wraps children in `mx-auto w-full max-w-[1400px]` with `px-4 sm:px-6 lg:px-8`. `AdminDisputes.tsx` currently escapes it with `-mx-4 -my-5 sm:-mx-6 lg:-mx-8 lg:-my-6`. That negative-margin hack is unreliable and still leaves the table forced into a narrow inner column at 1246px viewport, causing the action column to clip and a horizontal scrollbar to appear.
2. `table-fixed` + `overflow-x-auto` together let any cell content push past 100%, so the Actions column gets pushed off the visible area instead of compressing.
3. KPI icon for "Under Review" is `Hourglass` (should be `Search`); "Escalated" uses `Flame` (should be `Flag`); "Open Disputes" tone in the reference is amber/orange tile (already orange — keep), check.
4. Review button is solid blue today; approved design uses **orange** for active Review and **emerald** for View Resolution.
5. Overdue priority dot needs a subtle pulse; left accent bar is currently styled via `before:` but `border-t` is fighting the absolute pseudo-element on the first cell, making the bar look offset.

---

## 1. Full-width shell (fixes horizontal scroll)

`src/components/admin/AdminLayout.tsx`:

- Add an opt-in `fullBleed?: boolean` prop.
- When `fullBleed`, render `<main className="flex-1 min-w-0 bg-background">{children}</main>` (no inner `max-w-[1400px]`, no padding). Default behavior unchanged for other pages.

`src/pages/AdminDisputes.tsx`:

- Pass `fullBleed` to `AdminLayout`.
- Remove the `-mx-*/-my-*` escape hack.
- Wrap the page body as:
  ```
  <main className="flex-1 min-w-0 bg-background">
    <header …/>                              // full-width header bar
    <section className="w-full max-w-none px-6 lg:px-8 py-8 space-y-6">
      <KpiStrip/>
      <QueueFilters/>
      <ActiveDisputeQueue/>
    </section>
  </main>
  ```
- `min-w-0` on main is essential so the inner table can shrink instead of forcing scroll.

---

## 2. Active Dispute Queue table — no horizontal scroll at desktop

Container:

```
<section className="rounded-xl border border-border bg-card overflow-hidden">
  <header …/>
  <div className="hidden lg:block w-full">            // NO overflow-x-auto on desktop
    <table className="w-full table-fixed text-sm">…</table>
  </div>
  <div className="lg:hidden overflow-x-auto">…</div>  // tablet fallback
</section>
```

Column widths (sum = 100%, matches approved):

| Col | Width |
|---|---|
| Priority | 11% |
| Dispute | 18% |
| Parties | 18% |
| Amount | 12% |
| Status | 13% |
| SLA | 13% |
| Agent | 8% |
| Actions | 7% |

Every cell uses `truncate` + `min-w-0` on inner flex children; long names get `title` attribute for hover. No cell uses `whitespace-nowrap` on long text. Action buttons use compact `size="sm"` icon-only `MoreHorizontal` and a short "Review" label — fits comfortably in 7%.

Cell padding: `px-4 py-4` (slightly taller rows to match approved).

---

## 3. Row left accent strip + priority cell

Replace the `before:` pseudo-element on `<tr>` (unreliable across browsers) with a real first-child colored strip:

```
<tr className="relative border-b border-border/60 hover:bg-muted/30 cursor-pointer">
  <td className="relative px-4 py-4 pl-5">
    <span className={`absolute left-0 top-0 h-full w-1 ${PRIORITY_BAR[row.priority]}`} />
    <div className="flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${PRIORITY_DOT[row.priority]} ${row.priority === 'overdue' ? 'animate-pulse' : ''}`} />
      <span className={`text-[11px] font-bold uppercase tracking-wide ${PRIORITY_TEXT[row.priority]}`}>{row.priority}</span>
    </div>
  </td>
  …
</tr>
```

Priority palette unchanged: OVERDUE red, HIGH orange, MEDIUM yellow, LOW emerald, RESOLVED emerald.

---

## 4. Dispute / Parties / Amount / Status / SLA / Agent cells

Already mostly correct — confirm the following:

- **Dispute**: `#DIS-…` (blue, semibold) → item title (`text-foreground/90 truncate`) → `TXN-…` (muted, hover→foreground). No party data here.
- **Parties**: 24px avatar initials, stacked Buyer/Seller with role microcopy. Use `h-6 w-6 text-[10px]` `Avatar`. Verified seller: append a small `CheckCircle2 h-3 w-3 text-emerald-400` next to seller name only when `parties.seller.verified`.
- **Amount**: `formatMoney(row.amount, row.currency || 'NGN')` bold + reason underneath muted.
- **Status**: existing `statusDisplay()` is correct; sub-line via `formatMoneyStatus()` already correct.
- **SLA**: existing `humanizeSla()` covers overdue / due-in / resolved; keep.
- **Agent**: assigned → 24px avatar + name; unassigned → small muted pill `Unassigned`.

---

## 5. Actions cell — orange Review, emerald View Resolution

```tsx
<Button
  size="sm"
  onClick={() => goRow(row, isResolved ? "resolution" : "dispute")}
  className={
    isResolved
      ? "bg-emerald-600 hover:bg-emerald-500 text-white"
      : "bg-orange-600 hover:bg-orange-500 text-white"
  }
>
  {isResolved ? "View Resolution" : "Review"}
</Button>
<DropdownMenu>…kebab unchanged…</DropdownMenu>
```

The kebab stays as `Ghost size="icon" h-8 w-8`. Inline flex wrapper `inline-flex items-center gap-1 justify-end`.

---

## 6. KPI icons — match approved meanings exactly

In `KpiStrip`:

- Open Disputes → `Scale` (already correct), orange tile
- Awaiting Seller Response → `Clock`, yellow tile (already correct)
- **Under Review → `Search`** (replace `Hourglass`), blue tile
- Overdue Cases → `AlertTriangle` (already correct), red tile
- Resolved Today → `Check` (replace `CheckCircle2` for cleaner glyph), emerald tile
- **Escalated Cases → `Flag`** (replace `Flame`), purple tile

Remove unused imports (`Hourglass`, `Flame`).

---

## 7. Queue Filters — spacing tweaks only

No structural change; just tighten:

- Row 1 chip gap: `gap-2`
- Chip padding: `px-3 py-1.5 text-[11px]`
- Active chip remains solid blue; Overdue chip keeps red surface, Open keeps orange surface.
- Counts come from `data.kpis.*` (already wired).

---

## 8. Sidebar

No structural changes — `AdminSidebar` already correct. Confirm Disputes item gets the orange/active highlight from existing `useAdminNav` active-state styles. If the active style is currently blue, leave it (global admin convention) — the reference uses orange but global theme overrides this; user explicitly said "Disputes item active with orange highlight" — apply this only inside the Disputes nav active state via a small `aria-current='page'` selector override, no global theme change.

Defer this micro-tweak: keep current active style. Will revisit if the user calls it out again.

---

## 9. Files changed

**Edited**
- `src/components/admin/AdminLayout.tsx` — add `fullBleed?: boolean` prop.
- `src/pages/AdminDisputes.tsx` — full-width main, remove negative-margin hack, real left accent strip, orange Review button, swap KPI icons (`Search`, `Flag`, `Check`), remove inner `overflow-x-auto` on desktop, add `min-w-0` to main.
- `.lovable/plan.md` — replace with this corrected plan.

**Untouched**
- All services, edge functions, dispute display logic, sidebar, formats, status labels.

---

## 10. Acceptance

1. At 1246×890 viewport no horizontal scrollbar appears on `/admin/disputes`.
2. Table columns render in order: PRIORITY | DISPUTE | PARTIES | AMOUNT | STATUS | SLA | AGENT | ACTIONS.
3. Each row shows a left-edge colored accent bar aligned with the priority dot+label in the first cell.
4. Overdue dot pulses subtly; non-overdue dots are static.
5. Review button is **orange**; View Resolution is **emerald**; kebab sits to the right and is fully visible.
6. KPI "Under Review" uses Search icon, "Escalated" uses Flag, "Resolved Today" uses Check.
7. Amounts render in NGN format (`₦…`); raw `money_status` strings never appear.
8. Mobile (<lg) shows stacked dispute cards.
9. All other behavior (KPI click→quick filter, Review→route, Resolve→central admin dialog, Export, Live sync) unchanged.
