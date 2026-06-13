
## Audit findings (admin dashboard, transactions, disputes, payouts)

I cross-checked the four admin sections against the edge functions and Phase 8 fixes. Money flows now render correctly. The remaining issues are **presentation/consistency**, not money math:

### What's already correct
- Transaction Monitor amounts (₦14.3M total, ₦3.1M in escrow, per-row totals + protection fees) — all reading canonical columns after Phase 8.
- Payouts list amounts (₦926,250, ₦19,620, etc.) — coming from `payouts.amount` and `transaction_pricing.seller_payout_amount`.
- Dashboard KPIs (20 tx, ₦3,077,545 escrow, 3 active users, 2 flagged) — consistent with DB.
- **Batch selection on Payouts already exists**: header "select-all-eligible" checkbox, per-row checkboxes, `PayoutBatchBar`, and `Process Batch` button with concurrency=3 worker pool in `AdminPayouts.handleBatchProcess`.

### Real issues to fix

1. **Released payout still shows "RECIPIENT MISSING" badge** (image-141 row 1). The badge reflects the seller's *current* payout-account state, but for completed/released/reversed payouts it's noise and misleading. Hide bank-verification badges for terminal statuses.

2. **Critical Alerts says "All clear" despite real signals** (image-148). The 95-day overdue dispute, 1 failed payout, and 1 stuck transaction should be surfaced. Currently `admin-dashboard` only seeds alerts from a narrow rule. Extend alert generation to include: overdue disputes (SLA breached), failed payouts in last 7d, stuck transactions flagged `needs_release_review`.

3. **"No item snapshot" caption on released payout row** (image-141 row 1). `transactions.source_product_id` is null for that legacy tx, so admin-payouts-list returns `item_title: null`. Fallback: when product title is missing, show the transaction code's first item from `transaction_items` (already populated for cart-based tx) instead of "No item snapshot".

4. **Disputes queue → Critical Alerts mismatch.** Dispute is OVERDUE (95 days) but dashboard's `dispute_sla_pressure.overdue=1` only renders inline; it never escalates to Critical Alerts. Wire `overdue > 0` and `escalated > 0` into the Critical Alerts feed.

5. **"Process Batch" button is invisible / confusing when no rows are eligible.** All 4 payouts in the screenshot have `RECIPIENT MISSING`, so every checkbox is disabled and clicking Process Batch silently no-ops with a toast. Add an inline hint above the table: *"0 of 4 payouts are eligible for batch release. Reasons: 3 missing recipient code, 1 already released."* This makes batch UX self-explanatory.

6. **Payouts "Pending Payouts: 0" vs Dashboard "Awaiting Release: 2"** (images 140 vs 146). Two different metrics labeled similarly. Rename dashboard tile to "Funds Awaiting Release" (counts transactions, not payouts) and Payouts KPI stays "Pending Payouts" (counts `payouts.status=awaiting_release`). Add tooltips clarifying each.

### Files to change

| File | Change |
|---|---|
| `src/components/admin/payouts/PayoutsTable.tsx` | Suppress `RECIPIENT MISSING` / `UNVERIFIED` bank badge when `r.status` ∈ {completed, reversed, cancelled}. Show "VERIFIED" or hide entirely. |
| `src/components/admin/payouts/PayoutsTable.tsx` | Add eligibility hint banner above table: `{eligible}/{total} eligible for batch release` with breakdown of top reasons. |
| `supabase/functions/admin-payouts-list/index.ts` | When `productMap.get(...)` is empty, fall back to a join on `transaction_items` (first item's snapshot title) for `item_title`. |
| `supabase/functions/admin-dashboard/index.ts` | Extend `critical_alerts` generator: push items for overdue disputes (`dispute_sla_pressure.overdue > 0`), recent failed payouts, stuck transactions. Each alert has `severity`, `title`, `link`. |
| `src/pages/AdminDashboard.tsx` | Rename "Awaiting Release" KPI to "Funds Awaiting Release"; add tooltip clarifying it counts transactions, not payout rows. |
| `src/components/admin/payouts/PayoutSummaryCards.tsx` | Add tooltip to "Pending Payouts" tile: "Payouts with status = awaiting_release". |

### Out of scope
- No schema migration. No money-math change (Phase 8 already corrected the canonical column reads).
- No redesign of any screen — text/badge/alert tweaks only.
- Batch processing logic stays untouched; only the surrounding UX hints change.

### Verification
- Reload Admin → Payouts: the released row no longer shows `RECIPIENT MISSING`; eligibility hint reads "0 of 4 eligible — 3 missing recipient code, 1 already released".
- Reload Admin → Dashboard: Critical Alerts shows the overdue dispute and failed payout.
- Reload Admin → Payouts row 1: caption shows item title from `transaction_items` instead of "No item snapshot" (if any item rows exist for that tx).
- Hover the two "release" KPIs to confirm tooltips appear and labels are no longer ambiguous.

## Phase 10 — Buyer surfaces audit + payment-engine verification (executed)

Files:
- supabase/functions/buyer-dashboard/index.ts — extended bucket mappings (awaiting_delivery: awaiting_fulfillment | seller_dispatched | in_transit; awaiting_verification: delivered_awaiting_verification | delivered | awaiting_buyer_confirmation), added `declined` to terminal-exclusion list, added rejection/error logging + `[buyer-dashboard] metrics` info log.
- src/components/admin/payouts/PayoutsTable.tsx — `no_account` (non-terminal) badge softened to gray "Seller bank not set up" instead of red text.

### How to test a real payment
1. Log in as buyer (Tunde).
2. Marketplace → product → Buy Now → Payment Summary.
3. Paystack test card `4084 0840 8408 4081`, CVV `408`, exp any future, PIN `0000`, OTP `123456`.
4. Redirect lands on `/dashboard/transactions/:id/verify`; `transaction-verify` fires.
5. Expected: `payments.status='succeeded'`, `transactions.status='awaiting_fulfillment'`, `money_status='funds_held_in_escrow'`, +1 row in `escrow_ledger_entries`.

### How to test a payout (admin manual release)
1. Seller adds bank in Profile → Payout Destination → name resolves → `create-payout-recipient` populates `payout_accounts.provider_recipient_code`.
2. Buyer confirms delivery (or auto-confirm fires) → `payouts` row created with `status='awaiting_release'`.
3. Admin → `/admin/payouts` → tick row(s) → Process Batch (or per-row Release) → `release-core` calls Paystack `/transfer`. On success: `payouts.status='completed'`, `money_status='funds_released'`, -debit row in ledger.
