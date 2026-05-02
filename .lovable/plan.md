
# Phase F — Seller Experience Polish, Data Consistency & Final UX Cleanup

## Goal

Final polish pass on the seller experience before the Central Admin UI project. No new architecture — tighten existing flows, fix incomplete UI behavior, add missing actions, and remove confusing gaps across **payouts, transactions, products, dashboard quick actions, and notifications**.

**Product copy rule (enforced everywhere in this phase):** never use "admin" in seller-facing UI. Use:
- **Awaiting Release** (not "awaiting admin release")
- **SafeDeal Review** (not "admin review")
- **Payment Processing**
- **Funds Held Securely**
- **Awaiting Your Confirmation**

---

## F1 — Wire `ExportPayoutsDialog` date filter end-to-end

**Files**
- `src/components/seller/ExportPayoutsDialog.tsx`
- `src/services/seller-payouts.service.ts`
- `supabase/functions/seller-payouts/index.ts`

**Backend (`seller-payouts/index.ts`)**
- Accept optional `from` and `to` query params (`YYYY-MM-DD`).
- Filter the **history list** rows by the existing release timestamp ladder already used in the response (`completed_at ?? initiated_at ?? created_at`) — same field the dialog labels as "release date", so what sellers see matches what gets exported.
- Summary KPIs (lifetime totals) remain unfiltered — they describe the seller's whole state.
- Range semantics: `from` inclusive at `00:00:00`, `to` inclusive through `23:59:59.999` of that day, in the seller's local intent (treated as ISO date, no TZ math beyond that).
- 400 if `from > to`.

**Service**
- `getSellerPayouts(page, limit, status, search, from?, to?)` — append `from`/`to` to the URL only when set.

**UI (`ExportPayoutsDialog.tsx`)**
- Replace the current preset-only `dateFilter` with two `<Input type="date">` fields: **Date from** / **Date to**.
- Helper text: "Export payout records within the selected date range."
- Validation:
  - `from > to` → inline error "Start date must be before end date"; Export disabled.
  - Both empty → exports all (button enabled, secondary helper "Exporting all payout history").
  - Only `from` → from that date onward.
  - Only `to` → everything up to that date.
- **Export button must never look disabled when export is actually possible.** Remove the always-grey state. Show loading spinner while CSV is built.
- CSV: same columns as today, money formatted with 2 decimals, headers always written even when 0 rows.

**Acceptance**
- Selected range narrows the exported rows.
- Empty range exports all.
- Invalid range blocked with clear inline error.
- CSV has headers even when empty.
- Button enabled state reflects real availability.

---

## F2 — Fix `SellerQuickActions` grid for 5 cards

**File:** `src/components/seller/SellerQuickActions.tsx`

**Problem:** `lg:grid-cols-4` with 5 cards leaves an orphan card.

**New responsive grid:**
```
mobile          grid-cols-1
tablet (sm)     grid-cols-2
laptop (lg)     grid-cols-3   (3 + 2 layout, second row left-aligned)
wide (xl)       grid-cols-5   (single row)
gap-4
```

**Per-card structure (already mostly there — confirm parity):**
- Icon (lucide), Title, Short description, optional count badge, hover state (`hover:bg-accent/40 hover:border-primary/40`), equal heights via `h-full` + `flex flex-col`.

**Five cards:** Create Transaction · Add Product · View Drafts · Sales Analytics · Account Settings.

**Acceptance**
- No orphan card on any breakpoint.
- No horizontal overflow at 1246px (current viewport) or 1024px.
- Cards equal height, consistent hover.

---

## F3 — Seller "Cancel Transaction" CTA

**Files**
- `supabase/functions/seller-cancel-transaction/index.ts` (new)
- `supabase/functions/_shared/auth.ts` (new — shared helper, see Technical Notes)
- `src/services/seller-transactions.service.ts`
- `src/pages/SellerTransactionDetail.tsx`

**Visibility rules**
- Show only when `tx.seller_id = current user` AND `tx.status ∈ {draft, awaiting_buyer, awaiting_payment}`.
- Hide for everything else (`payment_secured`, `seller_preparing_delivery`, `seller_dispatched`, `delivered_awaiting_verification`, `completed`, `disputed`, `cancelled`, `timed_out`, `refunded`).
- Also hide if `money_status ≠ not_secured` and `≠ payment_pending` (defence in depth).

**UI placement**
- `SellerTransactionDetail` header, right-hand button group, destructive outline button "Cancel Transaction" with `Ban` icon.
- Click opens shadcn `<AlertDialog>`:
  - Title: "Cancel this transaction?"
  - Body: "This will close the transaction link and the buyer will no longer be able to pay for this deal. No money has been secured yet."
  - Optional textarea "Reason for cancellation (optional)" (max 500 chars).
  - Buttons: "Keep Transaction" (cancel) / "Cancel Transaction" (destructive confirm).
- On success: toast "Transaction cancelled", refetch, navigate to `/seller/transactions`.

**Edge function `seller-cancel-transaction`**
- `POST { transaction_id, reason? }` body, validated with zod (`transaction_id: uuid`, `reason: string().max(500).optional()`).
- `requireSeller(req)` (shared helper).
- Load tx with `FOR UPDATE` semantics via service-role client; verify `seller_id = auth user`.
- Re-check status guard server-side (`draft | awaiting_buyer | awaiting_payment`); 409 otherwise with `{ error: "not_cancellable", current_status }`.
- Re-check `money_status ∈ {not_secured, payment_pending}`; 409 otherwise.
- Update transaction:
  - `status = 'cancelled'`
  - `money_status` stays `not_secured` (or transitions `payment_pending → not_secured` first if needed — `validate_money_transition` allows that path).
  - `cancelled_at = now()`, `cancellation_reason = 'seller_cancelled'`.
- Append to `transaction_status_history` with reason `concat('seller_cancelled: ', body.reason ?? '')`.
- Append to `money_status_history` if money_status moved.
- Append to `transaction_events` (`type = 'seller_cancelled'`, payload includes reason).
- Deactivate any open `transaction_links` for the tx (`is_active = false`, `revoked_at = now()`).
- Release reserved stock (mirror `timeout_transaction_atomic` logic): sum `transaction_items.quantity`, decrement `products.reserved_quantity` for `source_product_id`, write `product_inventory_logs` with `change_type = 'release'`, `reference_type = 'seller_cancellation'`.
- Insert buyer notification only if `buyer_id IS NOT NULL`:
  - Title: "Transaction cancelled by seller"
  - Message: "The seller cancelled this transaction before payment was completed."
  - `type = 'transaction_update'`, `channel = 'in_app'`, `related_transaction_id = tx.id`.
- CORS: `POST, OPTIONS` (see Technical Notes §4).

**Acceptance**
- CTA only visible while safe to cancel.
- Confirmation dialog required.
- Status → `cancelled`, money_status → `not_secured`, transaction link revoked.
- Reserved stock released and logged.
- Buyer notified only if linked.
- All history tables written.

---

## F4 — "Duplicate Product" action on `SellerStorefront`

**Files**
- `supabase/functions/seller-products/index.ts` (extend)
- `src/services/seller-products.service.ts`
- `src/components/storefront/SellerProductCard.tsx`
- `src/pages/SellerStorefront.tsx`

**UI**
- Replace the trailing icon-only button on `SellerProductCard` with a shadcn `<DropdownMenu>` triggered by `MoreVertical`. Menu items, in order:
  1. Edit
  2. Duplicate
  3. Manage visibility
  4. Update stock
- Add `onDuplicate?: () => void` prop. The primary "Edit" button on the left stays.
- On `SellerStorefront`, wire `onDuplicate={() => handleDuplicate(product.id)}`.
- Toast on success: "Product duplicated as draft" with a `<ToastAction>` "Edit Draft" → navigates to `/seller/storefront/{newId}`.

**Edge function**
- `POST { action: "duplicate", product_id }` (extend existing `seller-products` switch).
- `requireSeller`, verify `products.seller_id = auth user`.
- Load source product + linked rows: `product_media`, `product_serviceable_regions`, `product_payment_methods` (only if rows exist; skip if FK has no relation).
- Insert new product, copying:
  - `title` → `${title} Copy`
  - `description`, `short_description`, `category_id`, `currency_code`, `unit_price`, `original_price`, `condition_label`, `brand`, `model`, `sku`, `seller_notes`, `agreement_terms`, `delivery_method`, `delivery_scope`, `estimated_delivery_days`, `verification_window_hours`, `visibility_type`, `feature_highlights`
  - `stock_quantity` copied as-is
- Reset:
  - `id` fresh, `seller_id` from auth
  - `status = 'draft'`
  - `is_active = false`
  - `reserved_quantity = 0`
  - `published_at = null`, `archived_at = null`
  - `created_at = now()`, `updated_at = now()`
  - `slug` regenerated (see below)
- Slug generation honouring `UNIQUE(seller_id, slug)`:
  - base = `${source.slug}-copy`
  - if exists for this seller, append `-2`, `-3`, ... until free (cap 50 attempts → 409).
- Re-link cloned rows to the new product id (insert new rows pointing to new product, keep file refs in `product_media` pointing to same `file_id` — files are immutable assets, no re-upload).
- Return `{ id, slug }`.

**Service**
- `duplicateProduct(productId): Promise<{ id: string; slug: string }>`.

**Acceptance**
- New row appears as `draft`, unique slug, zero reserved stock.
- Original untouched.
- Sales/view counters (if present in any future view) start clean — we never copy aggregates.
- Toast offers immediate edit shortcut.

---

## F5 — Products `AFTER UPDATE` trigger for `out_of_stock` notifications

**Migration only.** Note: `auto_out_of_stock_status` trigger function already exists and runs `BEFORE UPDATE` to set `status = 'out_of_stock'`. We add a separate `AFTER UPDATE` trigger that fires the notification when the transition actually lands.

```sql
create or replace function public.notify_seller_product_out_of_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text;
begin
  -- Fire only on the transition INTO out_of_stock
  if NEW.status = 'out_of_stock'
     and OLD.status is distinct from 'out_of_stock' then

    v_reason := case
      when COALESCE(NEW.stock_quantity, 0) - COALESCE(NEW.reserved_quantity, 0) <= 0
        then 'stock_depleted'
      else 'manual_status_change'
    end;

    insert into public.notifications (
      user_id, type, channel, title, message,
      status, metadata
    ) values (
      NEW.seller_id,
      'transaction_update'::notification_type,  -- reuse existing enum value;
                                                -- if a product-specific value exists, swap to it
      'in_app'::notification_channel,
      'Product is now out of stock',
      format('"%s" is now out of stock and is no longer available for new buyers.', NEW.title),
      'pending',
      jsonb_build_object(
        'event', 'product_out_of_stock',
        'product_id', NEW.id,
        'product_slug', NEW.slug,
        'previous_status', OLD.status,
        'new_status', NEW.status,
        'reason', v_reason
      )
    );
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_notify_seller_product_out_of_stock on public.products;
create trigger trg_notify_seller_product_out_of_stock
after update of status on public.products
for each row execute function public.notify_seller_product_out_of_stock();
```

**Front-end follow-up:** the existing `NotificationsCenter` already renders rows by `metadata.product_id` with a deep link — confirm it does, otherwise add a click handler that routes to `/seller/storefront/{product_id}` when `metadata.event = 'product_out_of_stock'`.

**Acceptance**
- Seller gets exactly one notification per transition into `out_of_stock`.
- Repeated updates while already out_of_stock do not re-notify.
- Works for both manual edits (`status = 'out_of_stock'`) and the auto-flip from the `BEFORE` trigger (because the `AFTER` fires after the `BEFORE` mutation).
- Notification deep-links to the product.

---

## F6 — "Awaiting Your Confirmation" filter on `SellerTransactions`

**Files**
- `supabase/functions/seller-transactions/index.ts`
- `src/pages/SellerTransactions.tsx`
- `src/pages/SellerTransactionDetail.tsx` (copy refresh only)

**Backend**
- Extend the `transactions.select(...)` to include `buyer_confirmed_at, seller_confirmed_at, dispute_status` (the latter to make sure disputed deals don't appear here).
- Add `statusMap` key `awaiting-seller-confirmation` and apply this composite predicate in JS:
  ```
  tx.status === 'completed'
  && tx.buyer_confirmed_at !== null
  && tx.seller_confirmed_at === null
  && (tx.dispute_status ?? 'none') === 'none'
  ```
- Add `awaiting_seller_confirmation_count` to the `summary` payload (computed against the unfiltered `allRows`).

**UI on `SellerTransactions`**
- Above the existing filter row, add a horizontal **chip rail** (only visible when `summary.awaiting_seller_confirmation_count > 0`):
  - One pill: `Awaiting Your Confirmation · {N}`, primary tone, `Tooltip` body: "The buyer has confirmed the item. Confirm from your side so the transaction can move toward release."
  - Click → set `statusFilter = 'awaiting-seller-confirmation'` and update `searchParams`.
- Add a matching `<SelectItem value="awaiting-seller-confirmation">Awaiting your confirmation</SelectItem>` to the existing Status select.
- For matching rows, show a `Badge` "Awaiting Your Confirmation" (primary tone) and a small "Confirm" `Button` linking to the detail page anchor `#confirm`.

**UI on `SellerTransactionDetail`**
- The existing `SellerConfirmCompletionCard` already covers the body copy. Audit and update its strings to:
  - Title: "Buyer has confirmed this transaction"
  - Body: "Please confirm that the transaction is complete from your side. Once both sides confirm, SafeDeal can move the funds to release review."
  - CTA: "Confirm Transaction"
- Replace any remaining "admin release" string with "Awaiting Release" across `SellerTransactionDetail.tsx` and `TransactionConfirmationProgress.tsx`.

**Acceptance**
- Chip count matches backend.
- Filter narrows the table.
- Detail copy never says "admin".
- After seller confirms, the row leaves this bucket on next refetch.

---

## Technical notes (cross-cutting)

### 1. Shared auth helper — `supabase/functions/_shared/auth.ts`

Single import to standardise JWT validation + role checks. Used by the new `seller-cancel-transaction` function and back-ported gradually elsewhere later.

```ts
// Exports
export async function requireUser(req: Request): Promise<{ userId: string; admin: SupabaseClient }>;
export async function requireSeller(req: Request): Promise<{ userId: string; admin: SupabaseClient }>;
export async function requireAdmin(req: Request): Promise<{ userId: string; admin: SupabaseClient }>;
```
- Validates the bearer JWT against `SUPABASE_JWKS`.
- Loads `user_roles` via service-role client and asserts the requested role.
- Throws typed errors (`UnauthorizedError`, `ForbiddenError`) that the handler maps to 401/403 with CORS headers.
- Never trusts a client-supplied role.

### 2. Shared state-machine helper (light touch this phase)

We do **not** rewrite all transitions in Phase F. We only introduce `_shared/state-machine.ts` with two helpers used by the new cancel function:
```ts
transitionTransaction(admin, txId, { from, to, actor, reason })
transitionMoneyStatus(admin, txId, { from, to, actor, reason })
```
- Both use **optimistic locking** (`.eq('id', id).eq('status', from)`) and write to the matching history table inside the same call.
- Returning row count of 0 raises `StateConflictError` → 409 to the caller.

### 3. Audit invariants (already enforced; re-stated for Phase F)

- Every money_status change writes `money_status_history` (cancel only writes if `payment_pending → not_secured` actually happens).
- Every transaction status change writes `transaction_status_history`.
- Privileged changes also write `admin_actions` — the seller cancel flow does **not** count as admin and skips this.

### 4. CORS

Every new edge function must:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version
Access-Control-Allow-Methods: POST, OPTIONS
```
Return early for `OPTIONS`.

### 5. Idempotency / concurrency

- Cancel: optimistic-locked transition; safe to call twice (second call returns 409 `not_cancellable`).
- Duplicate: slug uniqueness loop bounded; new row uses fresh UUID so retries cannot collide.
- No webhooks added in this phase.

### 6. UI consistency sweep

Quick `rg` sweep on these strings and replace where seller-facing:
- "admin release" → "Awaiting Release"
- "admin review" → "SafeDeal Review"
- "Awaiting admin" → "Awaiting Release"

---

## Out of scope for Phase F

- Central Admin UI (separate follow-up project).
- Email/SMS providers (in-app notifications only).
- Buyer-side redesign — only the buyer notification copy from F3 is touched.
- Reworking confirmation/release plumbing (Phase A/B already shipped).

---

## Files touched (summary)

```text
NEW
  supabase/functions/seller-cancel-transaction/index.ts
  supabase/functions/_shared/auth.ts
  supabase/functions/_shared/state-machine.ts
  supabase/migrations/<ts>_products_out_of_stock_notify.sql

EDIT (backend)
  supabase/functions/seller-payouts/index.ts          (from/to filter)
  supabase/functions/seller-transactions/index.ts     (awaiting-seller-confirmation filter + count)
  supabase/functions/seller-products/index.ts         (duplicate action)

EDIT (services)
  src/services/seller-payouts.service.ts              (from/to args)
  src/services/seller-transactions.service.ts         (cancelSellerTransaction)
  src/services/seller-products.service.ts             (duplicateProduct)

EDIT (UI)
  src/components/seller/ExportPayoutsDialog.tsx       (date inputs + validation + enabled state)
  src/components/seller/SellerQuickActions.tsx        (5-col responsive grid)
  src/components/storefront/SellerProductCard.tsx     (DropdownMenu, onDuplicate)
  src/pages/SellerStorefront.tsx                      (wire onDuplicate + toast action)
  src/pages/SellerTransactions.tsx                    (chip rail + filter option + row badge/button)
  src/pages/SellerTransactionDetail.tsx               (Cancel CTA + dialog + copy refresh)
  src/components/seller/SellerConfirmCompletionCard.tsx  (copy refresh)
  src/components/seller/TransactionConfirmationProgress.tsx  (copy sweep)
```

## Acceptance — phase-level

The seller experience feels complete and production-ready. Sellers clearly understand:
- what action is needed on each transaction,
- what money is held vs awaiting release,
- which transactions can still be cancelled,
- which products need attention,
- and never see the word "admin".
