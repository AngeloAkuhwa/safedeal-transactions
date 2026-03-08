

# Buyer Transaction Verification Screen — Implementation Plan

Build the escrow-critical verification screen at `/dashboard/transactions/:transactionId/verify` with a production-grade edge function enforcing all escrow protections from the backend contract, and a UI faithfully adapted from the uploaded HTML mockup.

## Files to Create

| File | Purpose |
|------|---------|
| `supabase/functions/transaction-verify/index.ts` | Edge function: 3 actions (get data, confirm, dispute) |
| `src/services/verification.service.ts` | Service layer wrapping edge function calls |
| `src/pages/BuyerTransactionVerify.tsx` | Main page component |
| `src/components/verification/VerificationCountdown.tsx` | Live countdown timer card |
| `src/components/verification/VerificationChecklist.tsx` | 5-item checklist from agreement |
| `src/components/verification/VerificationActions.tsx` | Confirm + Dispute CTA buttons |
| `src/components/verification/ConfirmReceiptDialog.tsx` | Confirmation modal (AlertDialog) |
| `src/components/verification/DisputeForm.tsx` | Expandable dispute form |
| `src/components/verification/VerificationSidebar.tsx` | Right column: agreement, seller, timeline |
| `src/components/verification/WhatHappensCard.tsx` | Auto-release explanation card |

## Files to Edit

| File | Change |
|------|--------|
| `src/App.tsx` | Add route `/dashboard/transactions/:transactionId/verify` |
| `src/components/transactions/TransactionTable.tsx` | Route `verify_item` rows to verify page |

## Edge Function: `transaction-verify`

Single POST endpoint with `{ action, transactionId, ... }`. Uses service role client. Auth via `getUser(token)` + `has_role` check.

### `get_verification_data`
- Guards: `buyer_id = userId`, `status = delivered_awaiting_verification`
- Reads: transactions, transaction_items, transaction_pricing, transaction_agreement_snapshots, delivery_tracking_details, escrow_states, profiles (seller), transaction_status_history
- Returns flat response with all verification screen data

### `confirm_receipt` — Full Contract Implementation
Validation order:
1. Ownership (`buyer_id = userId`) → 403
2. Idempotency (if `status = completed`) → 200 `{ already_confirmed: true }`
3. State guard (`status = delivered_awaiting_verification`) → 409
4. Dispute check (`dispute_status = none`) → 409
5. Money state (`money_status = funds_held_in_escrow`) → 409
6. Escrow lock (`escrow_states.state = held`) → 409
7. Deadline (`NOW() < verification_deadline_at`) → 410

Atomic writes (service role):
1. `transactions` — status→completed, money_status→funds_released, completed_at (conditional WHERE for idempotency)
2. `escrow_states` — state→released, released_amount=held_amount, held_amount=0 (WHERE state='held')
3. Insert `transaction_status_history`
4. Insert `money_status_history`
5. Insert `transaction_events` (buyer_confirmed)
6. Insert `escrow_ledger_entries` (payout_debit)
7. Insert `payouts` (seller_id, amount=seller_net_amount, status=pending)
8. Insert `notifications` for seller

### `raise_dispute`
Accepts: `reason` (dispute_reason_type enum), `description` (min 20 chars).

Validations: ownership, status=delivered_awaiting_verification, money=funds_held_in_escrow, escrow=held, deadline not expired, no existing dispute.

Writes:
1. Insert `disputes` (status=open, seller_response_due_at=NOW()+48h)
2. `transactions` — status→disputed, dispute_status→open, money_status→funds_frozen
3. `escrow_states` — state→frozen, frozen_amount=held_amount, held_amount=0
4. Insert dispute_status_history, transaction_status_history, money_status_history, transaction_events
5. Insert notifications for seller + buyer

Config: `[functions.transaction-verify] verify_jwt = false`

## Frontend Components

**Page layout** (from mockup): BuyerNav → amber trust banner → transaction header (code + status badges + amount + money status) → action-required alert → 2-column grid (`lg:grid-cols-3`). Left col-span-2: countdown, checklist, actions. Right col-span-1 sticky: sidebar.

**VerificationCountdown**: Gradient amber card with stopwatch icon, live 1s-interval countdown from `verification_deadline_at`, delivered date, HH:MM:SS with labels.

**VerificationChecklist**: 5 items from agreement snapshot — description match (shows item title/desc), quantity (badge), condition (badge), no damage, functionality. Green check icons.

**VerificationActions**: Two gradient CTA cards — green "Confirm Item Received" (opens dialog), red "Raise a Dispute" (expands form). Info panels below each. Protection reminder.

**ConfirmReceiptDialog**: AlertDialog with checklist (item matches, quantity correct, no defects, authorize release of $X), danger warnings, "Yes, Confirm Receipt" button with loading state via `useMutation`.

**DisputeForm**: Expandable section with reason select (6 enum values), description textarea (min 20 chars), warning banner, Submit/Cancel. `useMutation` → navigate to dispute detail.

**VerificationSidebar**: Agreement Snapshot card, Item Details card, Seller Info card, Quick Timeline (4 steps), WhatHappensCard (auto-release explanation).

## Data Seeding

Update TX-003 to set `verification_deadline_at = NOW() + interval '72 hours'` so the countdown timer works during testing.

## Key Anti-Fraud Invariants Enforced

- Seller delivery proof is evidence only — never triggers fund release
- Only buyer confirm, timeout, or admin resolution releases funds
- Confirm is idempotent via conditional WHERE clause
- Disputes blocked when escrow not in `held` state
- Completed transactions cannot accept disputes
- All state transitions create history/event/notification audit trail

