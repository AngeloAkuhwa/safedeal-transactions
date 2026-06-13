# Phase 8 — Pricing Read Hotfix (full sweep)

## Symptom (from screenshots + edge logs)

Across **seller dashboard, transactions list, analytics, payouts, blocked/delayed funds, private offers receipts**, and likely the equivalent buyer + admin screens, every persisted money figure renders as ₦0.00. UI alignment, statuses, counts, and `payouts.amount` (from the `payouts` table) all still render correctly — only fields sourced from `transaction_pricing` collapse to zero. Live edge-function log proof:

```
seller-analytics tx fetch error {
  code: "42703",
  message: "column transaction_pricing_1.seller_net_amount does not exist"
}
```

## Root cause

Phase 7 dropped `processing_fee_amount`, `seller_net_amount`, and `total_amount` from `public.transaction_pricing`. Canonical columns (`platform_fee_amount`, `payment_processing_fee_amount`, `seller_payout_amount`, `buyer_total_amount`) are populated and verified non-zero in the DB. Two regression patterns remain in the read path:

1. **Broken `.select(...)` lists** — Several edge functions still name dropped columns. PostgREST rejects the whole query (`42703`), `data` becomes `null`, and every downstream `Number(... ?? 0)` collapses to 0. This is why the screenshots show ₦0 everywhere.
2. **`service_fee_amount` returned from a non-existent row attribute** — `seller-transaction-detail` (and the shared `safedeal-money-policy` helper) read `pr.service_fee_amount` from a row that no longer has that column. UIs that bind to `pricing.service_fee_amount` render ₦0 even when the rest of the response is correct.

Scope: **data flow only — no screen redesign, no migration, no new columns.**

## Files to fix

### A. Remove dropped columns from `.select(...)` lists

| File | Lines | Drop |
| --- | --- | --- |
| `supabase/functions/seller-payouts/index.ts` | 202, 266, 353, 411 | `seller_net_amount`, `processing_fee_amount` |
| `supabase/functions/seller-confirm-completion/index.ts` | 195 | `seller_net_amount` |
| `supabase/functions/_shared/release-core.ts` | 287 | `processing_fee_amount` |
| `supabase/functions/admin-payouts-list/index.ts` | 130 | `total_amount` |
| `supabase/functions/admin-payouts-detail/index.ts` | 50 | `total_amount` |

Mapping for any downstream code that referenced the dropped key on the row object:
- `seller_net_amount` → `seller_payout_amount`
- `processing_fee_amount` → `payment_processing_fee_amount`
- `total_amount` → `buyer_total_amount`

Apply the rename at the point of read, e.g.

```ts
const sellerNet     = Number(pricing?.seller_payout_amount ?? 0);
const processingFee = Number(pricing?.payment_processing_fee_amount ?? 0);
const buyerTotal    = Number(pricing?.buyer_total_amount ?? 0);
```

### B. Response shape: derive `service_fee_amount`

The DB has no `service_fee_amount` column. The "Total Service Fee" exposed to the UI is `platform_fee_amount + payment_processing_fee_amount` (capped — capping is already done at write time).

Files to update:
- `supabase/functions/seller-transaction-detail/index.ts` lines 231–263 — replace `service_fee_amount: pr.service_fee_amount` with `service_fee_amount: Number(pricingRow.platform_fee_amount) + Number(pricingRow.payment_processing_fee_amount)` in both the `pricingRow` branch and the escrow-fallback branch.
- `supabase/functions/_shared/safedeal-money-policy.ts` — `snapshotFromPersisted`: derive `service_fee_amount` from canonical columns only; drop the `processing_fee_amount`/`seller_net_amount` branches from the input type and body (canonical columns are NOT NULL post-Phase-7).
- Any other reader returning `service_fee_amount` in JSON: same derivation.

### C. Screen-by-screen impact this resolves

| Screen | Endpoint | Failure mode now | Fixed by |
| --- | --- | --- | --- |
| Seller Dashboard KPIs (₦0 across all six cards) | `seller-dashboard` | OK select today, but blocked indirectly because the page also calls `seller-payouts` whose 4 selects 42703-fail and zero out "Total Released / Pending Release / Held in Escrow / On Hold" | A (seller-payouts) |
| Seller Transactions list ("Gross ₦0 · Net to seller ₦0") | `seller-transactions` | Selects are clean; UI binds to `tx.amount` and `tx.seller_net`. Already returns correct values — re-verify after deploy and confirm no stale build | Verification only |
| Seller Analytics ("We couldn't load analytics") | `seller-analytics` | Embedded `transaction_pricing(...)` returns 42703 because deployed function still names `seller_net_amount`. Repo file is already correct → just needs deploy | Redeploy |
| Seller Payouts (Gross/Fees columns ₦0, Upcoming Releases ₦0, Blocked/Delayed Funds ₦0) | `seller-payouts` | 4 selects name dropped columns → all `pricing` maps empty | A |
| Private Offers list (last row ₦0 with 0 items) | `seller-offers` | Pricing comes from offer items, not `transaction_pricing`; ₦0 row is intentional (empty offer). No fix needed | Verification only |
| Seller Transaction Detail (`/seller/transactions/:id`) — Total Service Fee ₦0 | `seller-transaction-detail` | `service_fee_amount` derived from missing column | B |
| Buyer Tracking / Buyer Transaction Detail | `transaction-detail` | Re-computes pricing from `item_amount` only — UI shows non-zero for tiered fees but loses persisted cap/snapshot. Switch to canonical persisted columns for consistency | B (optional) |
| Admin Transaction Detail | `admin-transaction-detail` | Selects are canonical; already correct. Verify only | Verification only |
| Admin Payouts (list + detail) | `admin-payouts-list`, `admin-payouts-detail` | Both still select dropped `total_amount` → 42703 → zero | A |

### D. Out of scope

- No new SQL migration. No new columns.
- No UI redesign. Component contracts (`pricing.service_fee_amount`, `pricing.seller_net_amount` aliases, `pricing.buyer_total_amount`, `pricing.total_amount`) stay the same — they're already preserved as response aliases or derived values.
- No writer-path changes. Writers were updated in Phase 7 and DB rows are already correct.

## Verification

1. **Static**: `rg "\.select\([^)]*(seller_net_amount|processing_fee_amount|service_fee_amount|total_amount[^_])" supabase/functions/` returns no matches.
2. **Deploy** the affected edge functions.
3. **Edge logs**: re-pull `seller-analytics`, `seller-payouts`, `admin-payouts-list`, `admin-payouts-detail` logs and assert no `42703` / `column ... does not exist` errors.
4. **Smoke** with existing tx `06c3374c-b4ac-4f91-9859-ba7a598f2125` (DB: item=12,345, buyer_total=12,880, seller_payout=12,095):
   - `seller-transaction-detail` → `pricing.item_amount=12345`, `service_fee_amount=535`, `seller_net_amount=12095`, `buyer_total_amount=12880`.
   - `transaction-detail` (buyer) → non-zero `pricing.total_amount` and `service_fee_amount`.
   - `admin-transaction-detail` → `pricing.itemTotal`, `protectionFee`, `paymentProcessingFee`, `totalCharged`, `sellerNet` all non-zero.
   - `seller-payouts` → `gross_amount`, `fees`, `net_payout` non-zero; Upcoming Releases and Blocked/Delayed cards show real ₦.
   - `seller-dashboard` → six KPI cards render the real totals from screenshot 1.
   - `seller-analytics` → response 200, no error banner.
5. **UI spot-check** `/seller`, `/seller/transactions`, `/seller/transactions/:id`, `/seller/analytics`, `/seller/payouts`, `/buyer/transactions/:id`, `/admin/transactions/:id`, `/admin/payouts` — confirm real ₦ values.

## Rollback

Code-only rollback. No schema change to undo.

## Estimated change

~7 edge functions + 1 shared module. Net diff small (column-name corrections + one derivation line per response builder). Phases remaining after this: **0**.
