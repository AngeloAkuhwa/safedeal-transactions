## Goal

Bring `src/pages/AdminTransactionDetail.tsx` to 100% visual parity with the two uploaded mockups (`Transaction_Detail-5.html` desktop + `Transaction_Details-5.html` mobile + the two screenshots). Logic, data wiring, RLS, and admin actions are already correct — this pass is purely visual / structural polish. No backend or service changes.

Currency stays NGN (per project memory). Avatars/users come from real data, never hardcoded names.

---

## Gaps vs mockups (what we'll change)

### 1. Status badges — pill shape
Mockup uses `rounded-full px-3 py-1.5 text-xs font-bold` pills. Current `StatusBadge` uses `rounded-md`.
- Update `STATUS_CLS` styling and the wrapper to `rounded-full` with `px-3 py-1`, `font-bold`, slightly larger text.
- Same for the Escalated / Overdue pills inside the summary action row.

### 2. Summary card — gradient + larger primary stats
Mockup: `bg-gradient-to-br from-slate-900 to-slate-900/50`, larger numbers (`text-xl font-bold` for code/amount, `text-lg font-semibold` for activity/provider), and the dispute accent is `border-l-4 border-l-orange-500` already (kept).
- Apply the gradient via theme-aware classes (`from-card to-card/50`).
- Increase Stat sizes for the top primary row only (Transaction code, Total Amount).
- Add a second internal divider so layout matches: Primary row → Parties row → Status grid (6 cols) → Action row. Currently we collapse Status into the first row; split into two rows on `lg:` to mirror the mockup.

### 3. Linked Records — card grid
Mockup renders each record as a card with: top label + external arrow, middle row (avatar/icon + name + sub), bottom row (status pill on left, amount on right). 4-column grid on `xl`.
- Replace current 2-col list with `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4` of cards.
- Each card shows: type label (uppercase, slate-500), `<ExternalLink>` icon, then content area (avatar for buyer/seller, colored icon tile for payment/escrow/payout/dispute), then a `border-t` footer with status badge + amount.
- Hover: `hover:border-blue-500/50`.

### 4. Timeline — connector rail
Mockup has a continuous vertical line `absolute left-4 top-0 bottom-0 w-0.5 bg-slate-800` behind the 8px nodes (32px on desktop, 24px on mobile).
- Wrap the `<ol>` in `relative` and add the rail.
- Keep the existing icon mapping; ensure each item uses `pb-6` spacing on desktop and `pb-4` on mobile.
- Header on the timeline card gains a subtitle "All events, status changes, and interventions".

### 5. Risk & Investigation — split Escalation History out
Mockup shows: 2-col grid (Risk Assessment | Investigation Log) on top, then a divider, then "Escalation History" on its own row underneath with colored dots (red/orange/slate).
- Move `escalationHistory` rendering out of the Investigation Log column and into a new bottom row inside the same card (full width).
- Each row: small colored dot (`w-2 h-2 rounded-full`) + timestamp + label + by-line.

### 6. Mobile — match mockup exactly
- Add a **Dispute Status** collapsible card (mobile only) showing: Dispute Opened (with status pill), Deadline (with OVERDUE flag if applicable), Evidence list. Driven by `data.dispute` and `data.dispute.evidence`.
- Mobile **Quick Actions** card (already a 2x2 grid) — wrap it in a card with heading "Quick Actions" to mirror the mockup.
- Mobile **High Risk card**: keep the existing red-bordered card but tighten copy to mockup ("High Risk - Escalated") and use bullet rows with a flag icon prefix.
- Mobile **sticky bottom bar**: change from "Investigate / More" combo to a single primary blue **Take Action** button + a 3-dot icon button. `Take Action` opens the action sheet; `⋮` also opens the same sheet. This matches the screenshot exactly.
- Mobile **header** keeps the back arrow + shield logo + 3-dot menu (already correct).

### 7. Desktop header
Already correct (Back + title + Export + View Dispute + More menu). Keep as-is. Move all four "Export Data / Open Investigation / Freeze Funds / Manage Dispute" CTAs to the summary card bottom action row only (currently duplicated in header). Header keeps just `Export` and `View Dispute` (when a dispute exists) + the More menu — matching the mockup.

### 8. Spacing + typography
- Cards: `bg-card border border-border rounded-xl` — already correct in dark mode.
- Section headers: `px-6 py-4 border-b border-border` for desktop sections to mirror mockup's heavier section header.
- Stat labels: `text-xs font-semibold uppercase` (already), but bump label color to `text-muted-foreground` and value to larger sizes inside the summary card.

---

## Files touched

1. `src/pages/AdminTransactionDetail.tsx` — all visual changes above. No prop/data shape changes.
2. *(no service or backend changes)*

## Acceptance criteria
- Side-by-side, the page matches the two mockups: pill badges, gradient summary card, two-stat-row + parties + status grid, timeline rail, 4-col Linked Records cards, separate Escalation History block.
- Mobile shows: header, transaction header strip, summary card, High Risk card, Quick Actions card, Dispute Status collapsible, Timeline collapsible, Linked Records, sticky `Take Action` + `⋮` bar.
- All values still render from the backend; no hardcoded amounts/users.
- Currency stays NGN. Empty states preserved.
- No regressions to admin actions, confirmations, or audit logging.
