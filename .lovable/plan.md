## Root cause

The `transactions` table has **no `total_amount` column** — amounts live in `transaction_pricing.buyer_total_amount`. Two edge-function queries reference the missing column, so PostgREST returns an error and the data silently becomes empty:

1. `supabase/functions/_shared/users-directory-engine.ts` (line ~157) — `select("buyer_id, seller_id, total_amount, status")` → entire transactions roll-up returns `null` → every user's `transactions.count = 0` and `volume = 0` in the table AND drawer.
2. `supabase/functions/admin-user-detail/index.ts` (line ~42) — `select("id, transaction_code, total_amount, status, money_status, created_at, buyer_id, seller_id")` → `txs` is `null` → "No recent transactions" always, and the disputes sub-query degrades to `transaction_id.in.('')`.

Confirmed for Chioma (`a1b2c3d4-…0002`): she has 3 disputes as seller in the DB (1 open + 2 resolved), and the drawer correctly shows `1/3 Active/Total disputes` (engine doesn't depend on `total_amount` for disputes). But the directory table cell renders `r.disputes.total` (3) with the label "Active disputes" — misleading when only 1 is actually active.

## Fix

### 1. `supabase/functions/_shared/users-directory-engine.ts`
Replace the broken transactions query with a join on `transaction_pricing`:
```ts
.from("transactions")
.select("buyer_id, seller_id, status, transaction_pricing(buyer_total_amount)")
```
Read amount from `t.transaction_pricing?.buyer_total_amount ?? 0`. Keep the same status whitelist and resolved-set logic.

### 2. `supabase/functions/admin-user-detail/index.ts`
- Replace `total_amount` with `transaction_pricing(buyer_total_amount)` in the recent-transactions select.
- Map response amount from the nested pricing row.
- Also fix the dispute lookup to use the actual `txs` ids (already correct logically; just confirm `txs` is non-empty after the pricing fix).

### 3. `src/components/admin/users/UsersTable.tsx` (disputes cell)
Align the big number with the label: render `r.disputes.active` as the primary value when there are active disputes, with secondary text `"of {total} total"`; otherwise render `total` with `"Clean record"` / `"In progress"` wording (already done for mobile). This matches the drawer's `active/total` framing.

### 4. (Optional, no-op for current bug) `UsersMobileFeed.tsx`
Already shows `disputes.active` correctly — no change needed.

## Verification after build
- Reopen Chioma's drawer → `Activity` shows real transaction count + NGN volume; "Recent transactions" lists her seller transactions.
- Directory row for Chioma shows `1` (large) with `of 3 total · In progress` instead of `3 / Active disputes`.
- Spot-check Tunde (buyer) — transactions count > 0, volume > 0.

No schema migrations, no UI redesign, no route changes.
