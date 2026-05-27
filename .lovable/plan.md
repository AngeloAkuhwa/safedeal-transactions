## Goal

Rebuild `/admin/disputes/:id` end-to-end to match the attached UXPilot HTML + screenshots. The UXPilot reference is the source of truth for layout, scroll behavior, sticky header, summary strip, buyer/seller cards, financial card, locked agreement, buyer claim, seller response, case communication workspace, timeline, internal notes, linked records, and the right resolution sidebar.

This is a UI / layout / data-binding correction. No schema changes, no new edge functions, no changes to the global central admin sidebar, no changes to existing money/state-machine safeguards.

## Files touched

- `src/components/admin/AdminLayout.tsx` — keep the `fullHeight` mode already added; no further changes unless needed for the new shell.
- `src/pages/AdminDisputeDetail.tsx` — full rewrite of the page layout and section composition. Keep existing data hooks, services, dialogs, and gating.
- `src/pages/AdminDisputeDetail/` (new folder) — split the page into focused presentational components:
  - `DisputeHeaderBar.tsx`
  - `DisputeSummaryStrip.tsx`
  - `DisputePartyCard.tsx` (buyer + seller variant)
  - `DisputeFinancialCard.tsx`
  - `DisputeLockedAgreementCard.tsx`
  - `DisputeBuyerClaimCard.tsx`
  - `DisputeSellerResponseCard.tsx`
  - `DisputeCaseCommunication.tsx` (status row + tabs + scrollable thread + quick actions + composer)
  - `DisputeCaseTimeline.tsx`
  - `DisputeInternalNotes.tsx`
  - `DisputeLinkedRecords.tsx`
  - `DisputeResolutionSidebar.tsx` (Resolution Status + Case Control + Resolution Actions + Investigation Actions + Resolution Summary)
- Existing reusable pieces (`ResolveDisputeDialog`, evidence preview dialog, internal note dialog, etc.) stay as-is and are wired in.

No services, edge functions, migrations, types, or the central admin sidebar are touched.

## Layout & scroll architecture

```text
AdminLayout (fullBleed + fullHeight)         h-screen overflow-hidden
└── <main> h-screen min-h-0 overflow-hidden
    └── div flex h-full min-h-0
        ├── section  flex-1 min-w-0 h-full overflow-y-auto    ← LEFT scroll
        │   ├── DisputeHeaderBar                              sticky top-0 z-30
        │   │     bg-card/95 backdrop-blur border-b border-border
        │   ├── DisputeSummaryStrip                           bg-card border-b border-border
        │   └── div p-6 lg:p-8 space-y-8
        │       ├── grid lg:grid-cols-2 gap-6
        │       │     DisputePartyCard buyer
        │       │     DisputePartyCard seller
        │       ├── DisputeFinancialCard
        │       ├── DisputeLockedAgreementCard (if snapshot)
        │       ├── DisputeBuyerClaimCard
        │       ├── DisputeSellerResponseCard
        │       ├── DisputeCaseCommunication (thread scrolls inside, max-h ~600px)
        │       ├── DisputeCaseTimeline
        │       ├── DisputeInternalNotes
        │       └── DisputeLinkedRecords
        └── aside hidden xl:flex flex-col w-96 shrink-0 h-full overflow-y-auto
                  bg-card border-l border-border
            DisputeResolutionSidebar
```

Scroll rules:
- Document/body never scrolls. Only the left `section` and the right `aside` scroll.
- Header is `sticky top-0` inside the left scroll container so summary strip and cards pass under it.
- Case Communication's message thread has its own `max-h-[600px] overflow-y-auto` inner scroll; the rest of the page continues below it.
- At `< xl`, right sidebar is hidden and a mobile action bar / inline resolution panel renders at the bottom of the left scroll area (reuse existing controls).

## Section spec (visual + data binding only)

All data comes from the existing `getAdminDisputeDetail` / `getAdminTransactionDetailFull` payload already loaded in `AdminDisputeDetail.tsx`. No new fetching. Missing values render as `—`. Sample/mock data is never used.

1. **Header bar** — back arrow, `Dispute #<code>`, subtitle `<item title> · <transaction_code>`, red overdue SLA badge with pulsing dot (from `seller_response_due_at`), Print button (existing handler).
2. **Summary strip** — 4 columns: (Dispute ID + Transaction link), (Amount in Dispute + Reason), (Created + Last Activity), (Status pill + Assigned Agent or `Unassigned`).
3. **Party cards** — buyer (blue) and seller (orange) variants. Avatar, name, user id, verified/seller-tier chip, 2×2 details grid (Email, Phone, Prior Disputes, Account/Payout Status), primary Call/Email/profile-icon row, secondary View Profile / Dispute History / Transactions row. Routes use existing admin routes where they exist; otherwise the button is disabled with a tooltip.
4. **Financial Overview & Controls** — one wide card. Row 1 (4 cols): Total Transaction, Amount in Dispute (orange), Protection Fee, Funds Status (yellow dot). Divider. Row 2 (3 cols): Eligible Refund (green), Eligible Release (blue), Payout Status (red dot when blocked). Values from `pricing`, `escrow`, `payout`.
5. **Locked Agreement** — only if `lockedAgreement` exists. Title + subtitle + `View full agreement` button that opens the existing read-only agreement preview (no download / print).
6. **Buyer Claim** — reason chip, description, evidence grid (buyer-uploaded only) with rich preview cards. Click opens existing `EvidencePreviewDialog`.
7. **Seller Response** — response count, response card(s) with timestamp/text/seller evidence, or pending/overdue empty state using `seller_response_due_at`.
8. **Case Communication** — Communication Status row of chips (Buyer Responded, Seller Response Overdue, Evidence Requested, Reminder Sent, Deadline Notice Sent — derived from existing message/timeline data). Tabs: Buyer Messages / Seller Messages / Internal Notes with the per-tab accent colors. Scrollable message thread (`max-h-[600px]`) using existing message data. Quick Actions row (Request Clarification, Request Evidence, Send Reminder, Send Deadline Notice). Composer at the bottom with recipient-aware label, attach, type dropdown, Send button (accent matches active tab). Actions wire to existing services; unsupported ones are disabled with tooltip — no fake state transitions.
9. **Case Timeline** — vertical timeline from existing `timeline` array, color-coded for escalated/overdue, icons mapped from `type`.
10. **Internal Notes & Investigation** — existing notes list with `Add Note` opening the existing internal note dialog (`addInternalNoteDetailed`). Per-note avatar, type badge (ESCALATION / INVESTIGATION / AGENT NOTE), body.
11. **Linked Records & Quick Actions** — 3-col grid: Transaction Detail, Buyer Profile, Seller Profile, Payment Record, Escrow Record, Payout Record, Audit Trail. Routes wired only when an existing admin route exists; otherwise disabled with "Coming soon" tooltip.
12. **Right Resolution Sidebar** — Resolution Status card (color-coded by status, Current Workflow Stage, Last Activity, Next Action). Resolution Actions grouped as `CASE CONTROL` (Move to Under Review, Request More Evidence, Assign / Reassign Agent, Escalate Further, Mark High Risk, Mark Fraud Watch) and `RESOLUTION ACTIONS` (Refund Buyer green, Release Funds to Seller blue, Partial Refund, Partial Release, Close Without Resolution, Block Payout red, Resume Payout green). `INVESTIGATION ACTIONS` group (Add Review Note, Add Internal Note, Open Investigation, View Linked Transaction, View Payment / Escrow / Payout Record). Resolution Summary cards for buyer + seller. Every action is gated by `adminActionsAvailable` from the existing payload; disabled buttons show a tooltip explaining why.

## Visual system

- Dark theme using existing semantic tokens (`bg-background`, `bg-card`, `border-border`, `text-foreground`, `text-muted-foreground`). No raw color classes.
- Accent semantics: blue = buyer/links, orange = seller/warning, red = danger/overdue, green = refund/resume, purple = investigation/internal notes, yellow = funds held. Use existing token variants; introduce subtle utility wrappers only when needed.
- Icons: lucide equivalents of the FontAwesome icons in the reference, consistent sizing (`h-4 w-4` inside buttons, `h-5 w-5` for section headers).
- Spacing: `p-6` inside cards, `space-y-8` between major sections, `gap-6` inside grids.

## Action wiring

- All buttons call existing service functions (`resolveDispute`, `escalateDispute`, `addInternalNoteDetailed`, etc.) and existing dialogs already imported in the current page.
- For actions without backend support today: button renders disabled with a tooltip ("Not available for this case" / "Coming soon"). No silent state mutation, no fake transitions, no money movement from the UI alone.
- Routing for linked records uses only existing routes; missing routes → disabled card with tooltip.

## Responsiveness

- Desktop (`xl+`): two-column shell as above.
- `< xl`: right sidebar hidden; a compact mobile action bar at the bottom of the left scroll area surfaces the most critical actions (Refund Buyer, Release Funds, Escalate, Add Internal Note) — reusing existing handlers.
- Party cards stack on `md` and below. Summary strip collapses to 2 columns then 1.

## Out of scope

- No database schema changes, no new migrations, no new edge functions.
- No changes to the central admin sidebar or `AdminLayout` beyond what's already in place.
- No changes to money/state-machine logic, RLS, or backend safeguards.
- No download/print on the locked agreement preview.
- No "creative improvements" beyond matching the reference; refinement comes after the layout is correct.

## Acceptance

1. Central admin sidebar unchanged.
2. Document/body does not scroll on `/admin/disputes/:id`.
3. Sticky header stays pinned; summary strip and cards scroll under it.
4. Right resolution sidebar is full-height, fixed width, scrolls independently at `xl+`, hidden at `< xl` with a mobile fallback.
5. All 12 sections above render and match the reference structure, spacing, colors, and grouping.
6. Case Communication's message thread scrolls inside its card; the rest of the page continues below.
7. All buttons either invoke an existing service/dialog or are visibly disabled with a tooltip. No fake transitions.
8. All displayed data comes from the existing backend payload; missing values render `—`. No hardcoded sample values.
