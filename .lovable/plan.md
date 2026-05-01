
## Phase A (Revised) — Foundation: Dual-Confirmation Money Model

**Goal**: stop auto-release on buyer confirmation. Introduce explicit dual-confirmation handshake (buyer → seller → release review queue). Funds never move in Phase A — Paystack transfers, refunds, webhooks, crons, and the operations UI all come in later phases. Backend infra & queues are built now so they are ready to plug into.

All revisions from the review are baked in: no user-facing "admin" wording, tightened money transitions (no legacy auto-release escape hatch), payout-account & pricing safeguards, dedicated ledger type, single unified queue with `queue_type`, and clear UI status wording.

---

### Step 1 — Migration `018_dual_confirmation_release_model.sql`

**Enums**
- `ALTER TYPE money_status ADD VALUE 'funds_pending_release' BEFORE 'funds_releasing';`
- `ALTER TYPE payout_status ADD VALUE 'awaiting_release' BEFORE 'pending';`
- `ALTER TYPE payout_status ADD VALUE 'blocked';` (used when payout account missing / pricing missing)
- `ALTER TYPE escrow_ledger_entry_type ADD VALUE 'payout_awaiting_release';` (if enum exists; otherwise create the enum value list it expects). **Do not** reuse `adjustment` for this lifecycle event.

**Tightened `validate_money_transition`** (the critical safety fix)

```text
not_secured            → payment_pending
payment_pending        → funds_held_in_escrow | not_secured
funds_held_in_escrow   → funds_pending_release | funds_frozen
funds_pending_release  → funds_releasing | funds_frozen | refund_pending
funds_frozen           → funds_pending_release | refund_pending
funds_releasing        → funds_released | funds_pending_release   (recovery for transfer.failed)
refund_pending         → refund_issued
```

**Critical**: `funds_held_in_escrow → funds_releasing` is **removed**. The only way to start a transfer in the new world is to first land in `funds_pending_release` via dual confirmation. This kills the legacy auto-release path entirely.

**`transactions` columns**
- `buyer_confirmed_at timestamptz`
- `seller_confirmed_at timestamptz`
- `release_approved_at timestamptz` (set by Phase B operations endpoint)
- `release_approved_by uuid REFERENCES profiles(id)`
- `needs_release_review boolean NOT NULL DEFAULT false`
- `release_review_reason text` (e.g. `payout_account_missing`, `pricing_missing`, `stuck_confirmation`)

**`payouts` columns**
- `release_approved_by_user_id uuid REFERENCES profiles(id)`
- `released_at timestamptz`
- `payout_blocked_reason text` (`payout_account_missing` | `pricing_missing` | `provider_recipient_missing`)
- `release_blocked boolean NOT NULL DEFAULT false`
- `failed_attempt_count int NOT NULL DEFAULT 0`
- `notes text`

**New table `transaction_completion_confirmations`**
- `id uuid PK`
- `transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT`
- `confirmed_by_role user_role_type NOT NULL CHECK (confirmed_by_role IN ('buyer','seller'))`
- `confirmed_by_user_id uuid NOT NULL`
- `confirmed_at timestamptz NOT NULL DEFAULT now()`
- `notes text`
- `created_at timestamptz DEFAULT now()`
- `UNIQUE(transaction_id, confirmed_by_role)` — idempotency
- RLS: parties via `is_transaction_party`; admins via `has_role('admin')`. SELECT only; INSERT only via service role.
- `prevent_delete` trigger.

**New table `release_review_queue`** (single unified queue — supersedes the two-queue idea)

- `id uuid PK`
- `transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT`
- `payout_id uuid REFERENCES payouts(id) ON DELETE RESTRICT` (nullable — refund/manual-hold rows may not have one)
- `seller_id uuid NOT NULL`
- `amount numeric(18,2)` (nullable for non-money queue items)
- `currency_code text DEFAULT 'NGN'`
- `queue_type text NOT NULL CHECK (queue_type IN (
    'ready_for_release',
    'payout_account_missing',
    'pricing_missing',
    'stuck_confirmation',
    'silent_dispute',
    'failed_payout',
    'refund_request',
    'manual_hold'
  ))`
- `status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','claimed','resolved','cancelled'))`
- `entered_queue_at timestamptz NOT NULL DEFAULT now()`
- `claimed_by_user_id uuid REFERENCES profiles(id)`
- `claimed_at timestamptz`
- `resolved_at timestamptz`
- `notes text`
- `created_at` / `updated_at` + `update_updated_at_column` trigger
- **Partial UNIQUE** so a transaction cannot have two open items of the same type:
  `CREATE UNIQUE INDEX ON release_review_queue(transaction_id, queue_type) WHERE status IN ('pending','claimed');`
- RLS: SELECT/UPDATE/INSERT only for `has_role(auth.uid(),'admin')`. Service role bypasses.
- Indexes: `(status, queue_type, entered_queue_at)`, `(seller_id)`.

**`system_settings` rows** (insert via insert tool, not migration)
- `release_review_target_hours = 24`
- `awaiting_payment_timeout_hours = 24`
- `stuck_confirmation_days = 14`
- `dispute_silent_response_hours = 72`
- `payout_max_retry_attempts = 3`

---

### Step 2 — Shared helpers

**`supabase/functions/_shared/auth.ts`**
- `requireUser(req)` → `{ userId, userClient }` or 401.
- `requireSeller(req)` → also asserts `user_roles.role='seller'`; 403 otherwise.
- (Reserved for Phase B) `requireAdmin(req)`.

**`supabase/functions/_shared/state-machine.ts`**
- Extract `transitionTransaction` (optimistic locking + history writes) from `transaction-verify` so `seller-confirm-completion` reuses it.
- Refactor `transaction-verify` to import — no behavior change beyond Step 3.

---

### Step 3 — Refactor `transaction-verify.confirmReceipt`

**New behavior**:
- Status transition only: `delivered_awaiting_verification → completed`.
- `additionalUpdates`: `{ completed_at: now(), buyer_confirmed_at: now() }`.
- **Money status untouched** (`funds_held_in_escrow` stays).
- **No payout row.**
- **No escrow_states release.**
- **No ledger debit.**

**Side-effects**:
- `INSERT ... ON CONFLICT DO NOTHING` into `transaction_completion_confirmations` (role='buyer').
- `INSERT INTO transaction_events` `event_type='buyer_confirmed_receipt'`.
- Seller notification: title "Buyer confirmed receipt", body "Confirm on your end so SafeDeal can review and process the release of your funds."

**Idempotency**: if `tx.buyer_confirmed_at IS NOT NULL` → return `{ already_confirmed: true, success: true }`. Removes the legacy `funds_released` idempotency check.

**UI copy** (`ConfirmReceiptDialog`, `WhatHappensCard`, `BuyerTransactionDetail`):
- Replace any "funds will be released to seller" wording with: **"We'll mark this deal complete on your side. Your seller will then confirm, and SafeDeal will review and process the release."**
- Remove the "you authorize release of {amount}" checklist line.
- Replace destructive "funds will be immediately released" warning with "Once you confirm you cannot raise a dispute on this transaction."

---

### Step 4 — New edge function `seller-confirm-completion`

**Path**: `supabase/functions/seller-confirm-completion/index.ts` with `OPTIONS, POST` CORS.

**Auth**: `requireSeller(req)`.

**Input**: `{ transaction_id: string, notes?: string }` (Zod).

**Guards** (409 with explicit error code on fail):
- Caller `= tx.seller_id`.
- `tx.status='completed'`.
- `tx.buyer_confirmed_at IS NOT NULL`.
- `tx.seller_confirmed_at IS NULL`.
- `tx.dispute_status='none'`.
- `tx.money_status='funds_held_in_escrow'`.

**Atomic flow** (service-role client, optimistic-lock on money_status):

1. `UPDATE transactions SET seller_confirmed_at=now(), money_status='funds_pending_release' WHERE id=$1 AND money_status='funds_held_in_escrow' AND seller_confirmed_at IS NULL` RETURNING. If no row → return `{ already_confirmed: true }`.
2. `INSERT ... ON CONFLICT DO NOTHING` into `transaction_completion_confirmations` (role='seller').
3. `INSERT INTO money_status_history` (`funds_held_in_escrow → funds_pending_release`, reason "Seller confirmed completion. Awaiting release review.").
4. `INSERT INTO transaction_events` `event_type='seller_confirmed_completion'`.

5. **Pricing check**:
   - Fetch `transaction_pricing.seller_net_amount, currency_code`.
   - If missing/invalid:
     - Set `needs_release_review=true`, `release_review_reason='pricing_missing'`.
     - Insert `release_review_queue` row `queue_type='pricing_missing'`, no `payout_id`, no amount.
     - Notify seller: "We've recorded your confirmation. SafeDeal is reviewing this transaction before release."
     - Return `{ success: true, blocked: true, reason: 'pricing_missing' }`.

6. **Payout account check**:
   - Fetch seller's `seller_payout_accounts` row where `is_default=true AND verified_at IS NOT NULL` (and `provider_recipient_code` if Paystack recipient already created — Phase B will create it; for Phase A presence of verified account is sufficient).
   - If missing:
     - Insert payout: `status='blocked'`, `release_blocked=true`, `payout_blocked_reason='payout_account_missing'`, amount/currency from pricing.
     - Insert `release_review_queue` row `queue_type='payout_account_missing'`, status='pending', linked to payout_id.
     - `transactions.needs_release_review=true`, `release_review_reason='payout_account_missing'`.
     - Insert `escrow_ledger_entries` `entry_type='payout_awaiting_release'` with note "Both parties confirmed. Payout blocked: seller payout account missing. No funds transferred."
     - Notify seller: "Both parties have confirmed this deal. Add or verify your payout account so SafeDeal can release your funds." with deep link to payout settings.
     - Return `{ success: true, blocked: true, reason: 'payout_account_missing', payout_id }`.

7. **Happy path** (pricing OK + payout account verified):
   - Insert payout: `status='awaiting_release'`, amount=seller_net_amount, currency_code, notes='Both parties confirmed. Awaiting release review.'
   - Insert `escrow_ledger_entries` `entry_type='payout_awaiting_release'`, amount, currency, balance_after=held_amount, notes "Both parties confirmed. Payout moved to Awaiting Release. No funds transferred yet."
   - Insert `release_review_queue` row `queue_type='ready_for_release'`, status='pending', linked to payout_id.
   - Notify seller: "Confirmation recorded. SafeDeal will review and release your funds shortly."
   - Notify buyer: "Both parties have confirmed this deal. SafeDeal will process the release."
   - Return `{ success: true, payout_id, money_status: 'funds_pending_release', queue_type: 'ready_for_release' }`.

All notifications use existing `notifications` insert pattern; no admin user notifications in Phase A (the operations team has no UI yet — queue rows are the source of truth and Phase B builds the UI).

---

### Step 5 — Service layer

**`src/services/seller-transaction-detail.service.ts`** add:

```ts
export async function sellerConfirmCompletion(
  transactionId: string,
  notes?: string,
): Promise<{
  success: boolean;
  payout_id?: string;
  blocked?: boolean;
  reason?: 'pricing_missing' | 'payout_account_missing';
  already_confirmed?: boolean;
}>
```

Uses `supabase.functions.invoke` (POST, default verb is fine).

---

### Step 6 — Seller UI: confirmation card + status clarity

**New component** `src/components/seller/SellerConfirmCompletionCard.tsx`
- Visible when `tx.status='completed' && buyer_confirmed_at && !seller_confirmed_at && dispute_status='none'`.
- Sky-blue `border-l-4 border-primary` panel.
- Headline: "Confirm this deal is complete on your end".
- Body: "The buyer has confirmed receipt. Once you confirm, SafeDeal will review and release your funds — typically within 1 business day."
- Attestation checkbox: "I confirm the buyer received the item and the deal is complete."
- Primary button: "Confirm completion" (disabled until checked).
- Secondary link: "Something's wrong? Contact support".
- On `blocked: 'payout_account_missing'` response → toast + inline alert with "Add payout account" deep link to `/seller/profile`.
- On `blocked: 'pricing_missing'` response → toast "SafeDeal is reviewing this transaction. We'll notify you shortly."

**`MoneyStatusBadge.tsx`** — add:
- `funds_pending_release`: label "Awaiting Release", `bg-primary/15 text-primary border-primary/30`.

**`TransactionCompletionBanner.tsx`** — add a new variant for `money_status='funds_pending_release'`:
- Tone: primary/sky-blue (not green — green implies money moved).
- Seller copy: "Both parties confirmed. SafeDeal is reviewing and will release your funds shortly. You'll be notified the moment it's sent."
- Buyer copy: "Both parties confirmed. SafeDeal will process the release on the seller's side."

**Avoid the "Completed alone" trap**: when `tx.status='completed' && money_status='funds_held_in_escrow'` (buyer-only confirmed), show a composite status block in `SellerTransactionDetail` and `BuyerTransactionDetail`:

```text
✓ Buyer Confirmed
… Awaiting Seller Confirmation
🔒 Funds Held Securely
```

When `money_status='funds_pending_release'`:

```text
✓ Both Parties Confirmed
… Awaiting Release
🔒 Funds Held Securely
```

Implemented as a small `<TransactionConfirmationProgress />` strip rendered above the existing banner. Replaces any standalone "Completed" pill in this window.

**Buyer-side copy** in `BuyerTransactionDetail` and the verify-success flow: drop "funds released to seller", use the wording above.

**No "admin" wording anywhere in user-facing UI.** Use "SafeDeal", "release review", "Awaiting Release".

---

### Step 7 — Verification

1. `supabase--linter` after migration.
2. Manual smoke on a test tx (buyer + seller accounts):
   - Pay → dispatch → mark delivered → buyer confirms → tx `completed`, money still `funds_held_in_escrow`, seller sees confirmation card, badge shows "In Escrow", composite progress shows Buyer Confirmed / Awaiting Seller / Funds Held.
   - Seller confirms (happy path): money flips to `funds_pending_release`, payout row inserted with `awaiting_release`, ledger entry `payout_awaiting_release` written, `release_review_queue` row with `queue_type='ready_for_release'`. Badge "Awaiting Release". Buyer & seller see "Both parties confirmed" banner.
   - Idempotency: hit both endpoints twice → no duplicate confirmation rows, no duplicate queue rows, no duplicate payouts.
   - Blocked path: seller without payout account confirms → payout row `status='blocked'`, queue row `queue_type='payout_account_missing'`, seller sees inline "Add payout account" alert. Adding payout account does NOT auto-resolve in Phase A (resolution is an operations action in Phase B).
3. RLS spot checks:
   - Non-party cannot read `transaction_completion_confirmations`.
   - Non-admin cannot read `release_review_queue`.
4. Try forbidden transition (manual SQL `UPDATE ... money_status='funds_releasing'` from `funds_held_in_escrow`) → trigger raises. Confirms the legacy escape hatch is closed.

---

### Acceptance checklist (mirrors the review)

- [x] Buyer confirmation does not create payout.
- [x] Buyer confirmation does not change money status.
- [x] Seller confirmation moves money to `funds_pending_release`.
- [x] Seller confirmation does not transfer money / does not call Paystack.
- [x] Payout is only `awaiting_release` (or `blocked`).
- [x] `release_review_queue` row created with appropriate `queue_type`.
- [x] No duplicate confirmation rows on repeated clicks.
- [x] No duplicate payout/queue row on repeated clicks.
- [x] User-facing UI uses "Awaiting Release", never "Awaiting Admin Release".
- [x] All money + confirmation actions write audit/history rows.
- [x] Legacy `funds_held_in_escrow → funds_releasing` path removed.
- [x] Pricing-missing and payout-account-missing safeguards in place.
- [x] Dedicated `payout_awaiting_release` ledger entry type.

---

### Files to be touched

**New**
- `src/db/migrations/018_dual_confirmation_release_model.sql`
- `supabase/functions/_shared/auth.ts`
- `supabase/functions/_shared/state-machine.ts`
- `supabase/functions/seller-confirm-completion/index.ts`
- `src/components/seller/SellerConfirmCompletionCard.tsx`
- `src/components/transactions/TransactionConfirmationProgress.tsx`

**Edited**
- `supabase/functions/transaction-verify/index.ts` (downgrade `confirmReceipt`, import shared helper)
- `src/services/seller-transaction-detail.service.ts` (add `sellerConfirmCompletion`)
- `src/pages/SellerTransactionDetail.tsx` (mount card + progress)
- `src/pages/BuyerTransactionDetail.tsx` (copy + progress)
- `src/components/transactions/TransactionCompletionBanner.tsx` (new `funds_pending_release` variant + copy fixes)
- `src/components/transactions/MoneyStatusBadge.tsx` (`funds_pending_release` label)
- `src/components/verification/ConfirmReceiptDialog.tsx` + `WhatHappensCard.tsx` (copy)
- `supabase/config.toml` (register `seller-confirm-completion` with `verify_jwt = false`)

**Out of scope (Phase B+)**
- Paystack `/transferrecipient`, `/transfer`, `/refund`.
- Operations endpoints to action queue items (release / refund / unblock / resolve).
- Webhook handlers for `transfer.*` / `refund.*`.
- Cron jobs that populate `stuck_confirmation` / `silent_dispute` queue items.
- Operations dashboard UI.
- Onboarding checklist, analytics page, polish.

---

### Build order
1. Migration → run linter.
2. Shared helpers (`auth.ts`, `state-machine.ts`).
3. Refactor `transaction-verify`.
4. Build `seller-confirm-completion`.
5. Service layer addition.
6. Seller UI (card + composite progress + badge + banner variant).
7. Buyer copy fixes.
8. Smoke test all branches (happy, pricing-missing, payout-missing, idempotency, forbidden transition).

Approve and I'll start at Step 1.
