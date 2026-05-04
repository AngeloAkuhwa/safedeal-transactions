## Goal

Audit shows `src/pages/AdminTransactionDetail.tsx` is ~85% aligned with the uploaded desktop + mobile mockups. This pass closes the remaining visual gaps. No backend or service changes — pure presentational polish in one file.

## Gaps identified vs mockups

### Mobile (mockup `Transaction_Details_1-2.html` + screenshot)

1. **Transaction header strip is too plain.** Mockup renders a dedicated `bg-card` strip below the sticky header with `#TXN-...`, item title, and a row of pill badges (`In Dispute`, `Overdue`). Current impl uses bare `px-1` text without a card background. → wrap in `-mx-4 -mt-4 px-4 py-4 bg-card border-b border-border` so it visually separates from content.

2. **Mobile summary card layout mismatch.** Mockup mobile summary shows: 2-col primary (Transaction / Total Amount) → parties stacked → 2×2 status grid (Status / Escrow / Provider / Payout). Current code reuses the desktop 5-col grid which collapses awkwardly on mobile. → conditional mobile layout: on `<lg` show 2-col primary + stacked parties + 2×2 grid; on `lg+` keep current desktop layout.

3. **Quick Actions not wrapped in a card.** Mockup shows a card titled "Quick Actions" containing the 2×2 action grid. Current impl renders raw buttons. → wrap in `<Card>` with `<CardHeader title="Quick Actions" />` (mobile only).

4. **Dedicated Dispute Status card missing on mobile.** Mockup has a collapsible card with rows for "Dispute Opened" (status pill), "Deadline" (with `OVERDUE` flag if past due), and an Evidence list (icon tile + title + timestamp). Current code only shows the generic Dispute card (which is fine for desktop). → add a `lg:hidden CollapsibleCard` that consumes `data.dispute` and `data.dispute.evidence` to mirror the mockup exactly.

5. **Sticky bar icon.** Mockup uses a `gavel` icon with "Take Action". Current uses `Search`. → swap to `Gavel` from lucide-react.

### Desktop (mockup `Transaction_Detail_1.html` + screenshot)

6. **Locked Agreement card missing.** Mockup shows a "Locked Agreement / Original terms when payment was made" card with item details, terms (agreed price / delivery / verification window), and seller notes block. → render a new `<Card>` that reads from `data.agreement` (locked snapshot) when present; show `Empty` otherwise. Use `data.transaction.agreementLockedAt`, `data.delivery.method`, `data.delivery.verificationWindowHours`, `data.pricing.itemTotal`.

7. **Dispute panel as a right-rail in mockup.** Mockup places "Dispute Status" + "Dispute Evidence" as right-column cards on `xl+`. We currently render Dispute full-width. → on `xl+` move Dispute + new Locked Agreement into a 2-col layout (`xl:grid-cols-3` with agreement/items spanning 2 cols and dispute sidebar in 1 col). Below `xl` keep the current stacked layout.

8. **Linked record footer for payment/payout cards.** Mockup payment card footer shows `Jan 15, 14:35` on left and `$5,356.00` on right (date + amount, no status badge). Current code shows status + amount. → for `payment` and `payout` types: prefer `at` timestamp (from new `r.subtitle`-style or use existing payment.paidAt) over status badge; keep status badge for `escrow` / `dispute` / `payout-without-date`. To do this without backend changes, add an optional `at` field consumer: read it from `r.subtitle` if it parses as ISO, else fall back to status. Cleanest: extend rendering to show the existing `r.status` only when no amount + no party badge applies — the date/timestamp already lives in `r.subtitle` for payment/payout records, render it inline at the footer left.

9. **"Payout Record" empty card opacity-60.** When `payout` is not yet created, mockup renders the card greyed out with "No payout yet / Pending resolution / Awaiting dispute outcome". Currently we omit the card entirely. → if a dispute exists and no payout, push a synthetic linked record with `type: "payout"`, `label: "No payout yet"`, `subtitle: "Pending resolution"`, no route, and apply `opacity-60`.

10. **Section header heaviness.** Mockup section headers use `px-6 py-4 border-b border-border` (heavier divider). Our `CardHeader` uses `px-4 pt-4 pb-3` with no border. → adjust `CardHeader` to `px-4 lg:px-6 py-4 border-b border-border` and add corresponding `pt-4` to body containers; keep collapsible chevron alignment.

## Files touched

1. `src/pages/AdminTransactionDetail.tsx` — all changes above.

No backend, service, types, or route changes.

## Acceptance criteria

- Mobile view matches the screenshot: header strip → gradient summary → high-risk card → Quick Actions card → Dispute Status card (with deadline + evidence) → Timeline → Linked Records → Transaction Details → sticky `Take Action` (gavel) + `⋮`.
- Desktop view matches the screenshot: header → summary card with action row → Risk & Investigation (split + escalation history) → Timeline → Linked Records grid (4-col, with greyed payout card if none) → main grid with Locked Agreement + Items + Payment & Escrow on left and Dispute Status + Evidence on right (xl+).
- All values still come from `getAdminTransactionDetailFull`; no hardcoded amounts/users.
- Currency stays NGN.
- Admin actions, confirmations, and audit logging unchanged.
