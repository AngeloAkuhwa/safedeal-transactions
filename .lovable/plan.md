## Problem

The dispute header summary strip squeezes 8 fields into a single row at `xl` and 4 columns at `md`, forcing every value to `truncate` with "…" (`#DSP-A01…`, `SD-2026-…`, `₦650,00…`, `Damage…`, `8 Mar 20…`, `10 May 2…`).

The attached design shows the same 8 fields arranged as **4 columns × 2 rows** (paired vertically: Dispute ID + Transaction, Amount in Dispute + Dispute Reason, Created + Last Activity, Status + Assigned Agent) with full values visible — no truncation.

## Fix

Single section: `src/pages/AdminDisputeDetail.tsx`, the "Summary strip" at lines 476–528.

1. Replace the flat 8-cell grid with a 4-column grid of paired cells. Each column contains two stacked field blocks (label + value) with a vertical gap between them:

```text
[Dispute ID]        [Amount in Dispute]   [Created]         [Status]
 #DSP-…              ₦650,000.00           8 Mar 2026        Under Review
 ─                   ─                     ─                 ─
[Transaction]       [Dispute Reason]      [Last Activity]   [Assigned Agent]
 SD-2026-000003      Damage                10 May 2026       Unassigned
```

   - Outer grid: `grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-x-6 md:gap-x-8 gap-y-5 px-6 py-6 lg:px-8`.
   - Each column is a `<div className="flex flex-col gap-5 min-w-0">` containing two field blocks.
   - At `<sm` (mobile) the grid collapses to 2 columns; pairs still stack vertically inside each column.

2. Remove `truncate` from every value node in this strip and replace with full-wrap behavior:
   - Mono code values (Dispute ID, Transaction): `break-all`
   - All other values (Amount, Reason, dates, Agent name): `break-words`
   - Drop `max-w-full truncate` on the Transaction button.

3. Keep current typography:
   - Label: `text-xs text-muted-foreground mb-1`
   - Value: `text-sm font-semibold text-foreground` (Transaction stays `text-blue-400`, Dispute Reason stays `text-orange-400`)
   - Status pill and Assigned Agent avatar+name unchanged.

4. The container row keeps its existing `bg-card border-b border-border` band — no card restyle here.

## Out of scope

- No copy changes, no new/removed fields.
- No changes to the page header above the strip (title, SLA chip, Print button).
- No changes to other cards on the screen.

## Acceptance

- At 875px viewport: 4 columns × 2 rows, every value fully readable, no "…" truncation.
- At ≥1280px: same 4×2 layout (matches the attached design) — not an 8-wide single row.
- At <640px: gracefully collapses to 2 columns × 4 row-pairs.
- No horizontal scroll on the header band.
