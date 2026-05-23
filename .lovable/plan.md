# /admin/disputes — targeted correction pass

Scope: `src/pages/AdminDisputes.tsx` + `supabase/functions/admin-disputes-queue/index.ts`. No other files, no redesign.

## 1. KPI subtitle text (dynamic)

In `KpiStrip` (≈lines 167–205) the API doesn't expose `due_today` or `assigned_to_me`, so derive them from the already-loaded `data.rows` plus the current admin user id.

- Pass two new props into `KpiStrip`: `dueTodayCount: number`, `assignedToMeCount: number`.
- Compute in the page component, just above `<KpiStrip />`:
  ```ts
  const todayLagos = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
  const dueTodayCount = rows.filter(r =>
    r.dispute_status === "seller_response_pending" &&
    r.sla.due_at_iso &&
    new Date(r.sla.due_at_iso).toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" }) === todayLagos
  ).length;
  const assignedToMeCount = rows.filter(r =>
    r.dispute_status === "under_review" && r.agent?.user_id === currentUserId
  ).length;
  ```
- `currentUserId` comes from a one-time `supabase.auth.getUser()` stored in state (already imported via the supabase client; no new deps).
- Replace the two hardcoded `sub` strings on the cards:
  - Awaiting Seller Response: `sub: \`${dueTodayCount} due today\``
  - Under Review: `sub: \`${assignedToMeCount} assigned to you\``
- Keep all other KPI visuals (height, padding, icon, value, label position) unchanged.

## 2. Remove the "All" filter chip

In `QUICK_FILTERS` (line 68) delete the `{ id: "all", label: "All" }` entry. Default `quick` stays `"open"`, so internal behavior is unchanged. Also drop the `f.id === "all"` count branch (≈line 378) since the entry is gone. No replacement chip.

## 3. Fix the Escalated filter API failure

Root cause: the edge function does `q.eq("status", "__never__")` on an enum column — PostgREST rejects this with an enum cast error → 400.

Fix in `supabase/functions/admin-disputes-queue/index.ts` (line 213):

```ts
case "escalated":
  // No escalation flag in current schema — return empty set safely.
  q = q.eq("id", "00000000-0000-0000-0000-000000000000");
  break;
```

This guarantees an empty (but valid) result instead of an enum-cast error. The chip count comes from `data.kpis.escalated` which the function already hardcodes to `0`, so the chip and the result stay consistent (both empty). The frontend still sends `quick=escalated` exactly as today — no client mapping change. Empty-state UI (`No disputes match these filters.`) already handles the zero case.

## 4. Actions column overflow

The Actions `<col>` is currently `150px` but the resolved row needs `"View Resolution"` (≈110px) + gap-2 (8px) + kebab `h-9 w-9` (36px) + cell `px-4` (32px) ≈ **186px**, so the button visibly overflows the cell.

Changes inside the desktop table (≈lines 502–642):

- `colgroup`: bump Actions from `150px` → `200px`; keep Agent `120px`; recompute % cols so they sum to 100% minus 320px fixed. New mix:
  ```
  Priority 10% / Dispute 19% / Parties 18% / Amount 12% / Status 13% / SLA 12% / Agent 120px / Actions 200px
  ```
- Actions `<td>` (line 607): keep `px-4 py-4 text-right`, drop the `min-w-[160px] / min-w-[132px]` wrapper — column width now governs. Inner wrapper becomes:
  ```tsx
  <div className="flex items-center justify-end gap-2">
  ```
- Primary button (line 609): `size="sm"`, classes `h-9 px-4 text-sm font-semibold rounded-lg whitespace-nowrap` plus the existing emerald/orange variant.
- Kebab trigger stays `h-9 w-9 shrink-0`.

No change to mobile cards, sidebar, filters search/select row, header bar, routes, or table data.

## 5. Spacing

Removing the "All" chip naturally tightens the chip row. No other padding changes needed — `section` keeps `p-5 space-y-4`, chip row keeps `gap-2`, control row keeps `h-10`.

## Acceptance

- Awaiting Seller card shows `"<n> due today"`; Under Review shows `"<n> assigned to you"`, both derived from live rows.
- Chip row contains exactly: Overdue, Open, Awaiting Seller, Under Review, Escalated, Resolved.
- Clicking Escalated returns a clean empty state (no API error in network tab, no toast).
- `View Resolution` and `Review` buttons sit fully inside the Actions cell at the current 995px viewport and on wider desktops, with the kebab still visible.
- No horizontal scrollbar on the table card; no other visual regressions.

## Files

- `src/pages/AdminDisputes.tsx` — KpiStrip props + subtitles, remove "all" chip, table colgroup + Actions cell.
- `supabase/functions/admin-disputes-queue/index.ts` — escalated case safe predicate.
