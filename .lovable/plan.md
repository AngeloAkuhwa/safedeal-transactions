

# Plan: Fix receipt printing + seller notifications + buyer→seller messages

## Issue 1 — "Download/View Receipt" prints a blank page

**Root cause** (`src/components/transactions/TransactionReceipt.tsx`):
The print CSS targets only **direct** children of `body` and `#root`:
```css
body > *:not(#safedeal-receipt-root),
#root > *:not(#safedeal-receipt-root) { display: none !important; }
```
But `#safedeal-receipt-root` is rendered deep inside the page tree (inside `BuyerTransactionDetail` → wrapper divs), not as a direct child of `#root`. So the rule hides the receipt's ancestor div, which hides the receipt itself. Combined with the `hidden` Tailwind class (which sets `display:none` even in print on some browsers), nothing renders.

**Fix**:
- Render the receipt into a **portal at `document.body`** (using `createPortal`) so it becomes a direct child of `body` and the print scoping works.
- Replace `className="hidden print:!block"` with inline styles: `style={{ display: 'none' }}` on screen, flipped to `display:block` only inside `@media print` via the scoped style block. This avoids the Tailwind specificity trap.
- Tighten the print CSS to: hide everything in `body` except `#safedeal-receipt-root` and its descendants, then explicitly show the receipt.

## Issue 2 — Seller notifications 404

**Root cause**:
- `SellerNav` links to `/seller/notifications`
- No such route in `src/App.tsx`
- No `SellerNotifications` page exists
- Buyer notification edge function (`buyer-notifications`) is buyer-scoped

**Fix**:
1. **New page** `src/pages/SellerNotifications.tsx` — visually identical to `BuyerNotifications` but uses `SellerNav`, seller name from seller dashboard hook, and calls a new seller-scoped service.
2. **New edge function** `seller-notifications` — mirror of `buyer-notifications` but:
   - Selects notifications where `user_id = auth.uid()` (same column, role-agnostic)
   - Resolves transaction joins via `transactions.seller_id = auth.uid()` for context
   - Includes new `direct_message` type so messages from buyers surface here
   - Maps each notification to a seller-side route (e.g. `/seller/transactions/:id` instead of `/dashboard/transactions/:id`)
3. **New service** `src/services/seller-notifications.service.ts` mirroring the buyer one.
4. **Mirror read endpoint** `seller-notifications-read` (mark single / mark all).
5. **Add route** `/seller/notifications` in `App.tsx` wrapped in `ProtectedRoute`.
6. Reuse existing UI primitives: `NotificationSummaryCards`, `NotificationFilters`, `NotificationList`, `NotificationEmptyState`, `TransactionPagination` — they are already role-agnostic.

> Why not literally reuse `BuyerNotifications`? It hard-codes `BuyerNav`, `useBuyerIdentity`, and routes notifications to `/dashboard/...`. Cleaner to ship a thin seller wrapper around the same shared components.

## Issue 3 — Buyer messages to seller don't appear anywhere

**Root cause**:
- `send-seller-message` correctly inserts into `transaction_messages` AND creates a notification with `type='transaction_update'` for the seller.
- BUT seller has nowhere to read it: no notifications page (Issue 2) AND seller transaction detail has no thread view.
- Realtime is not enabled on `transaction_messages`.

**Fix** (two surfaces, both needed):

**A. Seller notifications surface** (closes the loop with Issue 2)
- When inserting the seller notification in `send-seller-message`, change `type` from generic `transaction_update` to a new logical bucket `direct_message` so it shows in a "Messages" filter on the new seller notifications page (and on the buyer page when the seller eventually replies).
- Notification deeplinks to `/seller/transactions/:id#messages`.

**B. Inline message thread on transaction detail pages**
- New shared component `src/components/transactions/MessageThread.tsx`:
  - Lists all `transaction_messages` for the transaction (oldest→newest)
  - Reply textarea posts via `send-seller-message` (already supports both directions: `recipient = the other party`)
  - Subscribes to Supabase Realtime for `transaction_messages` filtered by `transaction_id`
- New edge function `transaction-messages` with two operations:
  - `list`: returns messages + sender names; gated by `is_transaction_party`
  - `mark_read`: marks recipient's messages as read
- Mount the thread on **both** `BuyerTransactionDetail.tsx` and `SellerTransactionDetail.tsx`, anchored at `#messages`.
- Enable realtime: `ALTER PUBLICATION supabase_realtime ADD TABLE transaction_messages;`

**C. Symmetrical sending**
- Rename UX-facing labels from "Contact Seller" → reused as "Send message" on the seller side too (same modal, opposite direction). Backend `send-seller-message` already swaps recipient based on `userId`, so no edge change needed.

## Files

**New**
- `src/pages/SellerNotifications.tsx`
- `src/services/seller-notifications.service.ts`
- `supabase/functions/seller-notifications/index.ts`
- `supabase/functions/seller-notifications-read/index.ts`
- `src/components/transactions/MessageThread.tsx`
- `supabase/functions/transaction-messages/index.ts`
- migration: enable realtime on `transaction_messages` + add `direct_message` to notification type enum (if enum-typed; otherwise no-op)

**Modified**
- `src/components/transactions/TransactionReceipt.tsx` — portal + print CSS fix
- `src/App.tsx` — add `/seller/notifications` route
- `supabase/functions/send-seller-message/index.ts` — use `type='direct_message'`, deeplink to seller route when recipient is seller
- `src/pages/BuyerTransactionDetail.tsx` + `src/pages/SellerTransactionDetail.tsx` — mount `<MessageThread/>` and add `#messages` anchor
- `src/components/transactions/ContactSellerModal.tsx` — make label/title prop-driven so seller side can reuse with "Reply to buyer"

## Risk

- **Receipt portal** changes mounting target; only print output is affected, screen UI stays identical.
- **New `direct_message` notification type** — if the DB column is a Postgres enum, requires a migration; if it's `text`, no migration needed. Will check at implementation time and branch accordingly.
- **Realtime on `transaction_messages`** — RLS on that table must already restrict by `is_transaction_party`; if missing, will add policy in same migration.
- **No breaking API changes**: `buyer-notifications` and existing services untouched.

