## Goal
Make the desktop `/admin/transactions/:transactionId` view a 1:1 visual match of `Transaction_Detail_2-2.html`. Vertical order, grid split, and right-rail layout are already correct — but several cards still contain extra rows, extra buttons, and extra sections that aren't in the design. This pass is purely a fidelity pass: trim, relabel, and rearrange to match the mockup.

## Diff: design vs current (only what's wrong)

### 1. Sticky page header (top bar)
Design: only two actions on the right — `Export` (slate ghost) and `View Dispute` (orange).
Current: Export + Investigate + Freeze/Unfreeze + Manage Dispute + overflow menu.
Fix: Reduce the desktop header to exactly `Export` and `View Dispute` (orange, navigates to `/admin/disputes/:id` when a dispute exists; hidden otherwise). Move Investigate / Freeze / Unfreeze / Add Note / Flag / View Buyer / View Seller / Copy Code into the existing overflow `MoreHorizontal` menu only — but keep the menu itself out of the visible row to match the design (it can live behind a single icon button only when no dispute exists, so the row matches the mockup when a dispute is active).

### 2. Summary card — top "Last Activity" cell
Matches. No change.

### 3. Summary card — action row (bottom strip)
Design: left side shows `Escalated Dispute` pill + red "Overdue: N days past resolution deadline" text; right side shows `Export Data`, `Open Investigation`, `Freeze Funds`, `Manage Dispute`.
Current: matches, but the overdue copy reads "Dispute response overdue" pill instead of inline red text "Overdue: X days past resolution deadline".
Fix: render the overdue indicator as plain red text with a clock icon and a computed "X days past resolution deadline" string (from `dispute.sellerResponseDueAt`).

### 4. Risk & Investigation card
Design: "Risk Assessment" column starts with a prominent red tile `High Risk Transaction … ESCALATED`, then a flat bullet list of flags (orange flag icon + slate text, no per‑row colored borders).
Current: no prominent header tile; every flag is rendered as its own colored bordered chip, which is too noisy.
Fix:
- Add the leading "High Risk Transaction / ESCALATED" tile when `risk.level` is `high|escalated` OR funds are frozen OR dispute is overdue.
- Render flags below it as a plain list (`flag` icon + text), no per-row colored borders.
- Keep the right column "Investigation Log" and the bottom "Escalation History" as they are.

### 5. Complete Transaction Timeline card
Design: simple icon-on-rail list, no filter chips, no "Newest first" toggle, no "Show full timeline" button (the design just lists the events).
Current: has a filter row (`All · Payment · Escrow · …`), a sort toggle, and a "Show full timeline" CTA.
Fix: hide the filter chip row and the sort toggle on desktop to match the design. Keep "Show full timeline" only when there are >8 events, but render it as a small ghost link under the list rather than a centered outlined button.

### 6. Linked Records card
Design: 6 cards in a 4-col grid — Buyer Profile, Seller Profile, Payment Record, Escrow Record, Payout Record (dimmed when none), Dispute Record.
Current: includes those 6 plus an extra synthesized "Locked Agreement" card.
Fix: remove the synthesized Locked Agreement card from Linked Records (the agreement already has its own dedicated section in the left rail).

### 7. Locked Agreement card (left rail)
Design: header is `Locked Agreement` + subtitle `Original terms when payment was made`. Body is two columns (Item Details / Terms) plus a "Seller Notes" tinted block beneath.
Current: header has a `Preview Agreement` button.
Fix: keep the `Preview Agreement` button in the header as it is — it's a useful affordance for opening the full read-only snapshot dialog. No change to this section.

### 8. Payment & Escrow card — Payment Details column
Design rows: Provider, Reference, Status, Processed (4 rows only).
Current rows: Provider, Status, Amount, Method, Reference, Paid At (6 rows).
Fix: trim to exactly Provider / Reference / Status / Processed in this order to match the mockup. (The full payment data still lives in the supplementary admin block — see §11.)

### 9. Delivery & Fulfillment card — Shipping Details column
Design rows: Carrier, Tracking, Shipped, Expected.
Current rows: Method, Carrier, Tracking, Shipped, Delivered, Expected, plus address line.
Fix: trim to exactly Carrier / Tracking / Shipped / Expected. Move Method, Delivered, and Address into the supplementary admin block.

### 10. Delivery Status column
Design: three solid emerald dots labelled `Package shipped` / `In transit` / `Delivered` with timestamps, then the red "Dispute opened within 24hrs of delivery" alert when applicable.
Current: renders `data.delivery.updates` (variable-length, status-derived labels). Works, but doesn't always render the three canonical milestones the design shows.
Fix: render a fixed three-step milestone list driven by `delivery.shippedAt`, an inferred in-transit timestamp (first update between shipped and delivered, otherwise hidden), and `delivery.deliveredAt`. Keep the red 24-hr alert exactly as today.

### 11. Supplementary admin sections (Pricing & Fees, Payout, Full Escrow Ledger)
Design: not present.
Current: rendered as three full-width cards under the 2/1 grid.
Fix: collapse the three into a single full-width `Card` titled `Admin extras` with a `<details>`-style expander (closed by default), so the visible page matches the design pixel-for-pixel while preserving access to the full pricing breakdown, payout fields, and full ledger table for admins. No data is lost.

### 12. Dispute Evidence (right rail)
Design: a single "Photo Evidence" header inside the card body, then stacked rows of `image icon + filename + date` (no preview eye-icon, no per-row hover border).
Current: flat list of evidence buttons with thumbnail, date, role, and an eye icon.
Fix: keep the buttons functional (clicking still opens `EvidencePreviewDialog`) but match the visual: no role suffix in the meta line, no trailing eye icon, smaller 12×12 icon tile with a generic image glyph for non-image kinds.

## File touched
- `src/pages/AdminTransactionDetail.tsx` — all of the above are edits inside this file. No service or backend changes.

## Acceptance
- Desktop top bar shows only `Export` + `View Dispute` (when dispute exists) plus the overflow menu icon.
- Risk card opens with a prominent "High Risk Transaction / ESCALATED" tile and a clean flag list.
- Timeline has no filter chips or sort toggle on desktop.
- Linked Records contains exactly 6 cards (no agreement card).
- Locked Agreement card retains its `Preview Agreement` header button.
- Payment Details column has exactly Provider / Reference / Status / Processed.
- Shipping Details column has exactly Carrier / Tracking / Shipped / Expected.
- Delivery Status column shows the 3 canonical milestones + the 24-hr red alert when relevant.
- Pricing, Payout, and full Escrow Ledger live behind a single collapsible "Admin extras" card.
- Right-rail Dispute Evidence list matches the design's "Photo Evidence" stacked rows.
- Mobile (<lg) layout unchanged.
