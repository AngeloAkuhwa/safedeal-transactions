## Goal

Make the desktop `/admin/transactions/:transactionId` page a 100% structural replica of the approved design (`Transaction_Detail_2.html`). Mobile already follows the mockup; desktop has the right cards but wrong order and is missing the 2/1 column split at the bottom.

## Gap analysis (current desktop vs design)

Design top-to-bottom (full-width):
1. Header (sticky)
2. Transaction Summary card (orange left border) — primary info row, parties row, status grid, action row
3. Risk & Investigation
4. Complete Transaction Timeline
5. Linked Records (4-col grid)
6. **2/1 grid block:**
   - Left col (xl:col-span-2): Locked Agreement → Transaction Items → Payment & Escrow → Delivery & Fulfillment
   - Right col: Dispute Status → Dispute Evidence

Current desktop order (all full-width, no 2/1 grid):
Summary → Locked Agreement → Dispute Evidence → Dispute Status → Risk → Timeline → Linked Records → Items → Pricing → Payment&Escrow → Payout → Delivery.

Mismatches to fix:
- Wrong vertical order (Agreement/Evidence/Dispute pushed to top instead of grouped at bottom).
- No 2-column split for the lower block — design clearly uses `xl:grid-cols-3` with 2/1.
- "Pricing & Fees" and "Payout" are extra sections not present in the design — keep them but move them out of the matched section, rendered after the 2/1 grid as supplementary admin-only data so the matched designed area is pixel-faithful.
- Inside Payment & Escrow card: design uses a 2-column body (Payment Details | Escrow Ledger as stacked rows, not a table). Replace the wide ledger table on desktop with the 3-row stacked variant from the design (Funds Received / Fee Deducted / Currently Held). Keep the full ledger table behind a "View full ledger" toggle.
- Delivery & Fulfillment: design has 2 columns (Shipping Details | Delivery Status milestones with the red "Dispute opened within 24hrs of delivery" banner when applicable). Current already has 2-col shipping/proof; swap right column for the milestone list derived from `delivery.events` / shipped/delivered timestamps and conditionally show the red banner when a dispute was opened within 24h of `deliveredAt`.
- Dispute Status card: design uses 3 stacked rows (Dispute Opened / Resolution Deadline / Dispute Type) — current already matches; just move it to the right rail.
- Dispute Evidence card on the right rail: switch from 3-col image grid to a vertical list (icon + title + date + small thumbnail) to match the narrow-column design. The full grid stays available for mobile.

## Changes

### File: `src/pages/AdminTransactionDetail.tsx`

Reorder the JSX inside the main content wrapper to:

```text
- Mobile mini-header (unchanged)
- High-risk banner (unchanged, full-width)
- Summary Card (full-width, unchanged)
- Risk & Investigation (full-width, moved up)
- Complete Transaction Timeline (full-width, moved up)
- Linked Records (full-width, moved up)
- <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
    <div class="xl:col-span-2 space-y-6">
      Locked Agreement
      Transaction Items
      Payment & Escrow (compact ledger variant)
      Delivery & Fulfillment (milestones variant)
    </div>
    <aside class="space-y-6">
      Dispute Status
      Dispute Evidence (vertical list variant)
    </aside>
  </div>
- Supplementary admin-only block (full-width, after grid):
    Pricing & Fees, Payout, full Escrow Ledger table (collapsible)
```

Mobile (`lg:hidden` accordions) keeps the existing top-to-bottom order matching the mobile mockup; only desktop layout changes.

Implementation notes:
- Wrap the right-rail cards in `hidden xl:block` inside the grid; on `lg` and below they render in their existing single-column flow before the left-rail cards (to preserve the mobile mockup order).
- Add a small `EscrowLedgerCompact` inline component (3 rows: received / fee / currently held) computed from existing `data.escrow` + `data.pricing`. Keep `data.escrow.ledger` table behind a "View full ledger" toggle.
- Add a `DeliveryMilestones` inline component that renders shipped / in-transit / delivered dots from `data.delivery.shippedAt`, `inTransitAt` (if present, otherwise omit), `deliveredAt`. Show the red "Dispute opened within 24hrs of delivery" alert when `dispute.openedAt` and `delivery.deliveredAt` are both present and within 24h.
- Adjust the right-rail Dispute Evidence card to a vertical list when rendered inside the right column (`xl:flex-col xl:divide-y` style) and keep the existing card grid layout when rendered standalone (mobile / when right column not used).

No backend or service changes required — all needed fields already exist in `AdminTxDetailResponse`.

### Acceptance

- Desktop @ ≥1280px: section order and 2/1 split match the HTML design exactly.
- Locked Agreement, Items, Payment & Escrow, Delivery sit in a 2-col left rail; Dispute Status + Dispute Evidence sit in the right rail.
- Risk, Timeline, Linked Records, Summary, High-risk banner remain full-width and appear above the grid in the order shown above.
- Mobile (<lg): unchanged from current accordion flow which already matches the mobile mockup.
- No data is lost — Pricing & Fees, Payout, and the full Escrow Ledger table render in a supplementary section under the grid.
