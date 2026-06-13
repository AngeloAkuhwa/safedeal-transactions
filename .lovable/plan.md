## Goal

Bring the Admin → Escrow Overview screen to 100% parity with the reference HTML / screenshot. Visual/presentation-only changes — no business logic, services, or edge functions touched.

## Changes

### 1. Merged single header (matches reference exactly)

Currently the page renders **two stacked header strips**: the shared `AdminHeader` (Reading Mode / theme toggle / Filters / Export Report) and below it the page-local Live / Last updated / Export Report / Refresh Data strip. Reference shows **one** header containing: title + subtitle on the left, with the "Live" pill and "Last updated: HH:MM" pill inline to the right of the subtitle block, then "Export Report" + "Refresh Data" buttons on the far right.

In `src/pages/AdminEscrow.tsx`:
- Pass `hideDefaultHeaders` and a custom `headerSlot` to `AdminLayout`.
- `headerSlot` renders the merged header on desktop using the reference markup (sticky, `bg-slate-900`, `border-b border-slate-800`, `px-4 md:px-8 py-5`):
  - Left cluster: `<h2>Escrow Overview</h2>` + subtitle, then inline Live pill (emerald, pulsing dot) and "Last updated: 12:34 PM" pill (slate, hidden `<lg`).
  - Right cluster: Export Report (slate, disabled placeholder) and Refresh Data (emerald) buttons, both with `RefreshCw` / `Download` lucide icons and labels hidden `<sm`.
- For mobile, pass `mobileHeaderSlot` that renders `AdminMobileHeader` (keep current behavior, so the hamburger still works) — Live/Refresh strip stays inside the main content on mobile via the existing component, or render a compact version inside the header.
- Remove the duplicate Live/Updated/Export/Refresh row that currently sits at the top of the page body since it's now in the header.

### 2. KPI cards — icons, labels, sub-copy match reference

In `src/components/admin/escrow/EscrowKpiCards.tsx`:
- Total Held → label "**Total Held in Escrow**", icon `Vault` (lucide) with **blue** palette (`bg-blue-500/10 border-blue-500/30 text-blue-400`), sub "Across {n} transactions".
- Total Frozen → keep `Lock` red, sub "{n} frozen transactions".
- Pending Release → keep `Hourglass` orange, sub "{n} pending releases".
- Total Refunded → keep `RotateCcw` purple, sub "{n} refunded today".
- Released Today → keep `CheckCircle2` emerald, sub "{n} transactions".
- Released This Week → keep `CalendarDays` cyan, sub "7 days total" (drop the "in 7 days" suffix; reference uses static "7 days total").

### 3. Hide scrollbars (keep scroll behavior)

In `src/index.css`, add a global rule that hides WebKit + Firefox scrollbars while preserving scrolling, mirroring the reference's `::-webkit-scrollbar { display: none; }`:

```css
* { scrollbar-width: none; -ms-overflow-style: none; }
*::-webkit-scrollbar { display: none; }
```

This removes the visible vertical scrollbars on the sidebar and main column (the two strips visible in the user's screenshot) without changing scroll behavior.

## Files touched

- `src/pages/AdminEscrow.tsx` — switch to `hideDefaultHeaders` + custom `headerSlot`/`mobileHeaderSlot`; remove the inline header row from body.
- `src/components/admin/escrow/EscrowKpiCards.tsx` — icon swap (Vault/blue) and label/sub-copy tweaks.
- `src/index.css` — global scrollbar-hide rule.

## Out of scope

- No changes to `admin-escrow-overview` edge function or `admin-escrow.service.ts`.
- No changes to charts, alerts panel, filters, or records table (already aligned in the prior pass).
- Other admin pages keep their existing `AdminHeader` — this change is opt-in via `hideDefaultHeaders` only on the Escrow page.
