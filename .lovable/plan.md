## Goal

Make the right-side Resolution Sidebar on the Admin Dispute Detail screen look exactly like the attached design screenshots, and confirm it scrolls independently of the main page.

## Scope

Only `src/pages/AdminDisputeDetail.tsx` (the inline `ResolutionSidebar`, `SidebarBtn`, `SidebarGroup`, `SummaryPartyCard`, and the surrounding `<aside>` wrapper). No data/service changes.

## Visual changes — match screenshots exactly

**1. Section headings**
- `Case Control`, `Resolution Actions`, `Investigation Actions` rendered as small uppercase muted labels (already close, refine size/tracking to match).
- `Resolution Status` and `Resolution Summary` rendered as bold white section titles (text-base, font-semibold).

**2. Resolution Status card**
- Keep colored alert card (escalated = red/rose tint), but switch to the screenshot layout:
  - Red/rose border, dark-red translucent background, red dot + uppercase "ESCALATED" label.
  - One-line message below.
  - Below: three labeled rows — "Current Workflow Stage" (label muted, value = colored dot + label), "Last Activity" (date), "Next Action" (text). Replace current inline "Workflow stage / SLA deadline / Next action" layout with this stacked label-over-value format.

**3. Action buttons (SidebarBtn) — colored icons + filled tones**
Each button: dark rounded card (`bg-background/40`, `border-border`), left colored icon tile (h-7 w-7 rounded-md, tinted bg + colored icon), label text white. Per-button colors:

Case Control:
- Move to Under Review → blue icon
- Request More Evidence → purple icon
- Assign / Reassign Agent → emerald icon
- Escalate Further → orange icon (arrow up)
- Mark High Risk → red icon (triangle)
- Mark Fraud Watch → red icon (shield)

Resolution Actions — these become FILLED solid buttons (not outlined):
- Refund Buyer → solid emerald (`bg-emerald-600 hover:bg-emerald-700 text-white`), white rotate-left icon
- Release Funds to Seller → solid blue (`bg-blue-600 hover:bg-blue-700 text-white`), white icon
- Partial Refund → outlined dark card, neutral icon (percent)
- Partial Release → outlined dark card, neutral icon (pie chart)
- Close Without Resolution → outlined dark card, neutral X icon
- Block Payout → solid red (`bg-red-600 hover:bg-red-700 text-white`), white ban icon
- Resume Payout → solid emerald (`bg-emerald-600 hover:bg-emerald-700 text-white`), white play icon

Investigation Actions (outlined cards, colored icons):
- Add Review Note → yellow note icon
- Add Internal Note → purple edit icon
- Open Investigation → orange magnifier
- View Linked Transaction → blue dollar/card icon
- View Payment Record → emerald credit-card icon
- View Escrow Record → orange/yellow vault icon
- View Payout Record → purple wallet icon

Refactor `SidebarBtn` to accept a `variant: "outline" | "solid"` plus an `iconColor` (tailwind class like `text-emerald-400`, `bg-emerald-500/15`), so solid variants render full-colored buttons and outlined variants render dark cards with tinted icon tiles. Keep `tip` tooltip behavior.

**4. Resolution Summary cards**
- Use slightly larger rounded card (`rounded-lg`, `border-border`, `bg-background/40`, `p-4`).
- Header row: small avatar/icon circle (blue user for buyer, orange store for seller), label "Buyer"/"Seller" in muted small caps above name in white semibold. Status badge on right (green dot + "Refund Requested" / red dot + "Response Missing").
- Body: muted text quote of claim/response, up to 3 lines.

**5. Sidebar container**
- `<aside>` already has `hidden lg:block lg:w-[380px] lg:shrink-0 lg:border-l lg:min-h-0 lg:overflow-y-auto bg-card`. Confirm parent chain (`<AdminLayout fullHeight>` → `lg:h-screen lg:overflow-hidden` → main flex column → wrapper `lg:h-full lg:min-h-0`) so the aside is its own scroll pane independent of the section's scroll. If the aside still scrolls with the page in tests, add `lg:sticky lg:top-0 lg:h-screen` as a fallback.

## Out of scope

- No changes to dialogs, dispute data, services, or the mobile Sheet contents (it reuses the same `ResolutionSidebar`, so it inherits the new look automatically).
- No changes to left sidebar, header, or main case content.

## Files

- `src/pages/AdminDisputeDetail.tsx`
