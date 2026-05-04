# SafeDeal Admin Transaction Detail — Implementation Plan

## 0. Reading Mode (already done — confirming)

Reading Mode is already wired globally for every Central Admin screen via `AdminLayout`:
- `ReadingModeProvider` wraps all admin pages.
- Desktop trigger lives in `AdminHeader`; mobile trigger in `AdminMobileHeader`.
- Floating controls (`mobile-floater`, `desktop-floater`) are mounted from `AdminLayout` so they appear on Dashboard, Transactions, the new Detail page, and any future admin route automatically.

**No new work needed** — the new Detail page inherits it through `AdminLayout`. We will only verify it doesn't collide with the new mobile sticky bottom action bar (raise floater offset if needed).

---

## 1. Backend — extend `admin-transaction-detail` edge function

The current function returns: `summary`, `timeline`, `ledger`, `messages`, `notes`. We need richer data to fill all design sections without hardcoding.

Add to the response:

| Section | New fields |
|---|---|
| `summary` | `payoutStatus`, `paymentProvider`, `providerReference`, `lastActivityAt`, `itemTitle`, full `pricing` (item_total, protection_fee, buyer_total, seller_net, refunded, payout) |
| `risk` (new) | `riskLevel`, `riskSignals[]`, `escalationHistory[]`, `investigationLog[]` (from `admin_actions` + `audit_logs`) |
| `dispute` (new) | `id`, `status`, `reason`, `openedAt`, `deadlineAt`, `evidence[]` |
| `linkedRecords` (new) | `buyerProfile` (id, name, masked email, flagged), `sellerProfile` (verified tier), `payment` (provider, ref, amount), `escrow` (state, held) |
| `agreement` (new) | locked JSONB snapshot from `transactions.agreement_snapshot` |
| `items` (new) | `transaction_items` rows (title, qty, unit price, image url) |
| `delivery` (new) | `delivery_method`, `tracking_number`, `carrier`, shipped/delivered timestamps, latest `delivery_updates` |
| `auditTrail` (new) | last 50 `audit_logs` rows scoped to this transaction |

All queries run in `Promise.all`. Field names continue camelCase. Auth/RLS pattern unchanged (admin-only via `has_role`).

---

## 2. Frontend — rebuild `src/pages/AdminTransactionDetail.tsx`

Replace the current minimal layout with a section-driven, fully responsive page rendered inside `AdminLayout`.

### Shared utilities
- `formatNGN(value)` — wrapper around `formatMoney` forcing `NGN` + 2 decimals (no abbreviation).
- `StatusBadge` — single component with the design's color matrix:
  - In Dispute → orange · Held in Escrow → purple · Frozen → cyan (or red if severity high) · Completed → green · Awaiting Payment → yellow · Awaiting Release → blue · Refunded → gray · Failed → red · Overdue → red.

### Desktop layout (≥ lg)
Sticky header slot (passed via `AdminLayout headerSlot`):
- Back arrow, title `Transaction #{transactionCode}`, subtitle `{itemTitle} — {statusLabel}`
- Right: `Export`, conditional `View Dispute`.

Single-column main area (matches design — full-width cards stacked):
1. **Transaction Summary Header** — large card with left orange accent if disputed; grid of: Transaction code, Last Activity, Total Amount, Payout Status, Payment Provider, Buyer, Seller, Transaction Status, Money Status, Item Total, Protection Fee, Total Charged, Held in Escrow. Inline action row at the bottom: Export Data, Open Investigation, Freeze Funds, Manage Dispute (state-aware, disabled with tooltip).
2. **Risk & Investigation** — Risk Assessment panel (level + signals), Investigation Log (right column at lg+), Escalation History below.
3. **Complete Transaction Timeline** — full event stream from existing `timeline[]`.
4. **Linked Records** — Buyer Profile, Seller Profile, Payment, Escrow as 2×2 grid.
5. **Locked Agreement** — read-only JSON viewer + key fields (item price, fee, total, dates).
6. **Transaction Items** — list/table of items with thumbnails and NGN totals.
7. **Payment & Escrow** — provider, reference (masked, copy-to-clipboard), escrow state, held/released amounts.
8. **Delivery & Fulfillment** — method, carrier, tracking, status timeline.
9. **Admin Notes / Internal Activity** — existing `notes[]` plus inline "Add Note" action (already in actions service).
10. **Audit Trail** — table of audit events.

All sections **expanded by default** on desktop.

### Mobile layout (< lg)
- `AdminLayout` mobile header retained (back, brand, hamburger).
- Mini transaction header card: code, item title, status badges (multiple).
- Stacked cards: Summary, High Risk Alert (only if risky), Quick Actions (Investigate / Freeze / Export / Manage), Dispute Status (collapsible), Timeline (collapsible), Linked Records (collapsible), Transaction Details (collapsible), Payment & Escrow (collapsible), Delivery & Fulfillment (collapsible).
- Sticky bottom action bar: primary `Take Action` (opens action sheet reusing `RowActionsMenu` items) + kebab `More`.
- Reuse shadcn `Collapsible`. Default open: Summary + Quick Actions; rest closed.
- Add `pb-24` to main scroll container so sticky bar doesn't hide content; raise mobile reading-mode floater to `bottom-32` only on this page.

### State preservation
Back button continues using `location.state.returnTo` (already implemented).

---

## 3. Money formatting rule (enforced)
Every money value across the page goes through `formatNGN`. No `$`, no abbreviation. Examples: `₦5,356.00`, `₦156.00`, `₦5,200.00`. Replace any sample design copy showing `$` with the corresponding NGN field.

---

## 4. Files touched

- **Edit** `supabase/functions/admin-transaction-detail/index.ts` — add risk, dispute, linkedRecords, agreement, items, delivery, auditTrail; expand summary fields. Redeploy.
- **Edit** `src/services/admin-transaction-actions.service.ts` — extend `AdminTxDetail` type.
- **Replace** `src/pages/AdminTransactionDetail.tsx` — full design build, mobile + desktop.
- **New** `src/components/admin/transactions/detail/` —
  - `StatusBadge.tsx`
  - `SummaryHeader.tsx`
  - `RiskInvestigation.tsx`
  - `TimelineSection.tsx`
  - `LinkedRecords.tsx`
  - `LockedAgreement.tsx`
  - `ItemsSection.tsx`
  - `PaymentEscrow.tsx`
  - `DeliveryFulfillment.tsx`
  - `InternalActivity.tsx`
  - `AuditTrail.tsx`
  - `MobileActionBar.tsx`
  - `CollapsibleSection.tsx`
- **No changes** to Reading Mode plumbing — already global.

---

## 5. Acceptance verification (after build)
- Visual diff vs the two uploaded references (desktop + mobile) at 1280px and 390px.
- All money values render as `₦X,XXX.00` — grep-free of `$` in the new files.
- Disputed transaction shows orange accent, Risk panel, View Dispute button; non-disputed transaction hides those gracefully.
- Mobile sticky action bar doesn't overlap reading-mode floater or content.
- Reading Mode toggle still works on this page (Easy / Standard / Dense).
