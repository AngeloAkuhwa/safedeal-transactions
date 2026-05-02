## Phase F — Gap Closure Plan

Two confirmed gaps after audit. Backend infrastructure for both is already written; only deployment/UI wiring remains.

---

### Gap 1 — F5 trigger never reached the database

**Symptom:** `notify_seller_product_out_of_stock()` function and `trg_notify_seller_product_out_of_stock` trigger are absent from the live DB even though `supabase/migrations/20260502140000_f5_out_of_stock_notify.sql` exists on disk. Result: sellers do not get notified when a product flips to `out_of_stock`.

**Fix:** Create a fresh migration with the same DDL (a re-numbered file so it gets picked up). It is idempotent (`create or replace function` + `drop trigger if exists`), so re-running is safe.

Migration steps:
1. `create or replace function public.notify_seller_product_out_of_stock()` with `security definer`, `set search_path = public`.
2. Fire only on `OLD.status IS DISTINCT FROM 'out_of_stock' AND NEW.status = 'out_of_stock'`.
3. Insert a `notification_type = 'system_message'`, `channel = 'in_app'` row addressed to `NEW.seller_id`, with metadata `{ event, product_id, product_slug, previous_status, new_status, reason }` where `reason` is `stock_depleted` (available <= 0) or `manual_status_change`.
4. `drop trigger if exists ... ; create trigger trg_notify_seller_product_out_of_stock after update of status on public.products for each row execute function ...`.

Verification after migrate:
- `select proname from pg_proc where proname = 'notify_seller_product_out_of_stock';` → 1 row.
- `select tgname from pg_trigger where tgname = 'trg_notify_seller_product_out_of_stock';` → 1 row.

---

### Gap 2 — F3 Seller "Cancel transaction" CTA not wired

**Symptom:** Edge function `seller-cancel-transaction` and service helper `cancelSellerTransaction()` exist and are correct, but `src/pages/SellerTransactionDetail.tsx` never imports or renders them. The seller has no way to trigger cancellation from the UI.

**Fix:** Wire a destructive CTA + confirmation dialog into the detail page, gated to states where cancellation is safe.

UI changes in `src/pages/SellerTransactionDetail.tsx`:
1. Import `cancelSellerTransaction` from `@/services/seller-transactions.service`.
2. Import `AlertDialog`, `AlertDialogTrigger`, `AlertDialogContent`, `AlertDialogHeader`, `AlertDialogFooter`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogAction`, `AlertDialogCancel` from `@/components/ui/alert-dialog`, and `Textarea` from `@/components/ui/textarea`.
3. Add local state: `cancelOpen`, `cancelReason`, `cancelPending`.
4. Show the CTA only when:
   - `tx.seller_id === currentUserId`, AND
   - `tx.status` is one of `draft`, `awaiting_buyer`, `awaiting_payment`, AND
   - `tx.money_status` is one of `not_secured`, `payment_pending`.
5. Render a `Button variant="destructive" size="sm"` labelled **"Cancel transaction"** in the page header action row (next to the existing status badge / mark-as-dispatched area).
6. On click, open the AlertDialog. Title: "Cancel this transaction?". Body: explain that the buyer will be notified, the share link will be revoked, and any reserved stock will be returned. Optional `Textarea` for `reason` (max 500 chars).
7. Confirm action calls `cancelSellerTransaction(tx.id, reason)`; on success show toast "Transaction cancelled", invalidate the relevant React Query keys (`["seller-transaction-detail", tx.id]`, `["seller-transactions"]`, `["seller-dashboard"]`), and close the dialog.
8. On error, surface the server message via `toast.error()`. Specifically translate `state_conflict` → "This transaction changed state — please refresh." and `money_not_safe` → "Payment is already in progress and cannot be cancelled here."

No backend changes needed — the existing edge function already handles atomic status flip, link revocation, stock release, history rows, and buyer notification.

Verification:
- Open a draft / awaiting_payment transaction as the seller → CTA visible.
- Open a `payment_secured` or later transaction → CTA hidden.
- Click cancel → buyer receives in-app notification; transaction row appears in `cancelled` filter; reserved stock returns to product.

---

### Out of scope

- No changes to Phases A–E. Audit confirmed they are healthy: realtime publication intact, all three cron jobs active, atomic RPCs present, no forbidden "admin"/"Retry payout" wording on seller surfaces.

### Technical notes

- The F5 migration is idempotent — re-applying via a new timestamped file is the safest path; we do not alter the original file (it stays as a record).
- The F3 CTA must respect the same gating as the edge function (`CANCELLABLE` set + `SAFE_MONEY` set) to avoid showing a button that the backend will reject with 409.
- React Query invalidations should match the keys actually used in `SellerTransactionDetail.tsx` and the transactions list.
