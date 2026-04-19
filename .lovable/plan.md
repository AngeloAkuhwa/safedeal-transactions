
# Diagnosis & Fix: Stuck "Awaiting Setup" + No Pay Button

## What's actually wrong (not the state machine)

The transaction state machine is correct. Two real bugs are causing what you see:

### Bug 1 — Buyer lands on Detail page instead of Agreement page after claiming
- `claim-offer` correctly returns `redirect_to: /dashboard/transactions/:id/agreement`
- But once the buyer clicks back to the dashboard and re-opens the transaction (current URL: `/dashboard/transactions/06c3374c…` — Detail page, not `/agreement`), there is no path forward.
- The Detail page shows status `awaiting_buyer` → "Awaiting Setup, this transaction is being set up" with **no CTA**. Buyer is stuck.

### Bug 2 — Transaction is in `awaiting_buyer` instead of `awaiting_payment`
- DB confirms: `status='awaiting_buyer'`, `money_status='not_secured'`, `agreement_locked_at=null`.
- The buyer already claimed (`claimed_at` is set on offer), so the transaction should be advanced to `awaiting_payment` so the "Pay Now" button shows up on the Agreement page.
- `claim-offer` creates the tx as `awaiting_buyer` and never transitions it. The Agreement page also never bumps it. So the buyer sees the locked terms but `initiate-paystack-payment` (which requires `awaiting_payment`) is never reachable.

### Bug 3 — Item Details on Detail page shows "Untitled Item" + empty image
- `transaction-detail` selects `transaction_items.title, condition` but the column is `condition_label`. DB shows the title IS stored ("Touch Light Phone") — so the issue is a mismatch in the SELECT or a different code path.
- Verified: DB row has `title: "Touch Light Phone"` and `condition_label: "brand_new"`. The screenshot shows "Untitled Item" → either `transaction-detail` is failing silently on the bad column name `condition` (should be `condition_label`) and falling back to "Untitled Item", or it's reading a different row. Will fix the column name and the fallback.
- Image placeholder: same root cause as the agreement-page fix — `transaction-detail` does not pull `product_media` for offer-sourced transactions. Will mirror the productMedia fetch we added to `transaction-agreement`.

## Fix plan

### 1. `supabase/functions/claim-offer/index.ts`
When creating or reusing a `draft`/`awaiting_buyer` tx for a claimed offer, advance it to `awaiting_payment` immediately (the agreement is already locked-by-snapshot; buyer just needs to pay).
- New tx path: insert with `status: 'awaiting_payment'`.
- Reuse path: if reused tx is `draft` or `awaiting_buyer`, UPDATE to `awaiting_payment`. The state machine allows both transitions.

### 2. `supabase/functions/transaction-detail/index.ts`
- Fix SELECT: replace `condition` → `condition_label` (and category may not exist; verify and drop if so).
- Add productMedia fetch (same pattern as `transaction-agreement`): look up `source_offer_id` → `buyer_specific_offer_items.product_id[]` → `product_media` join `files`. Return `productMedia[]`.
- For offer transactions, prefer the offer's bundle items for the displayed title/quantity so we never show "Untitled Item".

### 3. `src/pages/BuyerTransactionDetail.tsx`
- Render the first product image from `productMedia` (image mime) inside the Item Details card instead of the empty placeholder.
- When `status === 'awaiting_payment'`, show a primary CTA button "Review Agreement & Pay" → `/dashboard/transactions/:id/agreement`. (The `transaction-detail` response already includes `next_action.action = "review_agreement"` — just wire it to a visible button in the hero/status panel.)

### 4. One-off data repair for the stuck transaction
Run a single UPDATE to unblock the user right now:
```sql
UPDATE transactions
SET status = 'awaiting_payment'
WHERE id = '06c3374c-b4ac-4f91-9859-ba7a598f2125'
  AND status = 'awaiting_buyer';
```

## Files touched
- `supabase/functions/claim-offer/index.ts` — set `awaiting_payment` on create + transition on reuse
- `supabase/functions/transaction-detail/index.ts` — fix column name, add productMedia, prefer offer bundle for title
- `src/pages/BuyerTransactionDetail.tsx` — image rendering + "Review Agreement & Pay" CTA
- Migration: one-off UPDATE for the stuck tx

## Out of scope
- Auto-redirecting Detail → Agreement when status is `awaiting_payment` (intentional: buyer should be able to inspect detail then choose to pay).
- Refactoring `awaiting_buyer` out of the state machine — it's still useful for seller-created drafts that need buyer email confirmation before payment.
