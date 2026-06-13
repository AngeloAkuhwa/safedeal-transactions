
# SafeDeal Payment Engine — Nigeria MVP Final Plan

Confirmed: **₦2,500 combined fee cap stays** (covers SafeDeal + Paystack together), **provider fee comes out of the cap first**, **seller payout = item amount**, **processing fee non-refundable once charged**, **hardcoded test email kept for now** (dev/testing).

---

## Phase 1 — Shared policy + label layer (no behaviour change yet)

### Backend `supabase/functions/_shared/`
- **`safedeal-money-policy.ts`** — single source of truth:
  - `PRICING_MODEL_VERSION = "NG_MVP_TOTAL_SERVICE_FEE_CAP_2500_V1"`
  - `MAX_TOTAL_SERVICE_FEE = 2500` (one combined cap — no separate SafeDeal/Paystack caps).
  - `buildPricingSnapshot(itemAmount, currency)` returns:
    ```
    { item_amount, safedeal_fee_amount, payment_processing_fee_amount,
      service_fee_amount, total_amount, seller_payout_amount,
      currency, is_total_service_fee_capped, pricing_model_version }
    ```
  - Algorithm (matches spec §4 / §16):
    1. `provider_fee_estimate = computePaystackLocalFee(item)`
    2. `raw_safedeal_fee = max(MIN_PLATFORM_FEE, round(item*tierRate) - provider_fee_estimate)`
    3. `raw_total = provider_fee_estimate + raw_safedeal_fee`
    4. `service_fee_amount = min(raw_total, 2500)`
    5. `payment_processing_fee_amount = min(provider_fee_estimate, service_fee_amount)` ← provider covered first
    6. `safedeal_fee_amount = max(service_fee_amount - payment_processing_fee_amount, 0)`
    7. `total_amount = item_amount + service_fee_amount`
    8. `seller_payout_amount = item_amount`
  - Central label maps for `transaction_status`, `money_status`, `payout_status`, `escrow_state`, `refund_status`, `dispute_case_status`.

- **`payment-state-machine.ts`** — JS mirror of DB transition matrix (migrations 013/014) so edge functions short-circuit before triggers.
- **`payout-eligibility.ts`** — `evaluatePayoutEligibility(payout_id, admin_id)` → `{ can_release, can_retry, can_block, can_unblock, can_refund, first_blocker, gates[] }`. Reads ONLY `seller_payout_amount`.
- **`refund-eligibility.ts`** — `evaluateRefundEligibility(transaction_id, admin_id)` → returns the **central `refund_decision` object** from spec §12, including `payment_processing_fee_non_refundable: true` once payment is processed, `seller_payout_cancelled`, `outcome`, `first_blocker`.

### Frontend `src/lib/payment/`
- **`money-format.ts`** — NGN formatter, masked account, `—` for null (never `₦0.00`).
- **`payment-labels.ts`** — re-export of label maps. Required labels:
  - `Item Total`, `SafeDeal Fee`, `Payment Processing Fee`, `Total Service Fee`, `Total Charged`, `Seller Payout`.
  - Forbidden labels: `Delivery Fee`, `Shipping Fee`, `Platform Processing Fee`, `Protection & Processing Fee`, anything with `$`/`USD`.
- **`src/types/payment-flow.types.ts`** — TS shapes mirroring backend.
- **`src/services/payment-flow.service.ts`** — single client gateway: `getPricingSnapshot`, `initiatePayment`, `verifyPayment`, `getRefundDecision`, `getPayoutEligibility`.

### Update `src/lib/pricing.ts` + `supabase/functions/_shared/pricing.ts`
Add the new fields to `PricingResult` (`safedeal_fee_amount`, `payment_processing_fee_amount`, `seller_payout_amount`, `is_total_service_fee_capped`, `pricing_model_version`). Keep `platform_fee_amount`/`service_fee_amount`/`paystack_fee_amount` for backwards compatibility — they will continue to populate existing DB columns unchanged.

---

## Phase 2 — DB hardening (one migration, no rename)

**`src/db/migrations/018_central_payment_snapshot_hardening.sql`**

1. **Add derived columns to `transaction_pricing`** (no renames):
   - `payment_processing_fee_amount NUMERIC(18,2)` — backfill from `paystack_fee_amount`
   - `seller_payout_amount NUMERIC(18,2) NOT NULL DEFAULT 0` — backfill from `item_amount`
   - `pricing_model_version TEXT` — backfill `NULL` for old rows; new rows get `NG_MVP_TOTAL_SERVICE_FEE_CAP_2500_V1`
   - `is_total_service_fee_capped BOOLEAN DEFAULT false`

2. **Pricing-lock trigger** — block `UPDATE transaction_pricing` once `transactions.agreement_locked_at IS NOT NULL` OR `money_status IN ('funds_held_in_escrow','funds_pending_release','funds_releasing','funds_released','funds_frozen','refund_pending','refund_issued')`. Exception: `admin_correct_pricing(...)` SECURITY DEFINER RPC gated by `has_role(super_admin)`; writes `admin_actions` + `transaction_events` + ledger adjustment.

3. **Dispute transition trigger** — enforce `disputes.status` matrix (`open → seller_response_pending|under_review|resolved`, `seller_response_pending → under_review|resolved`, `under_review → resolved`, `resolved` terminal). `resolve_dispute_atomic` already complies.

4. **`v_payout_account_state(user_id)` view** — returns one of `no_account | unverified | verified_no_recipient | verified_ready` so table + drawer agree. `security_invoker = on`.

5. GRANTs per `<public-schema-grants>`.

**Important:** old/locked transactions are **not** recomputed (spec §17). Backfill is purely derived from existing columns.

---

## Phase 3 — Edge functions wired through the policy layer

Refactor in place; verify each via `supabase--curl_edge_functions` before moving on. **No column renames.**

| Function | Change |
|---|---|
| `initiate-paystack-payment` | Call `buildPricingSnapshot`; persist new derived columns; stamp `pricing_model_version`. **Test email kept** per your note. |
| `paystack-webhook` | Assert `amount == total_amount` from snapshot; insert 4 ledger entries tagged `payment_processing_fee_paid`, `safedeal_fee_earned`, buyer_payment_secured, seller_payable_recorded. |
| `verify-paystack-payment` | Same snapshot validation, no frontend-trusted amount. |
| `release-payout` | Use `evaluatePayoutEligibility`; transfer **only** `seller_payout_amount` from snapshot (never recomputed). |
| `retry-payout` | Same eligibility helper; preserve attempt counter + safe reference `payout_{id}_r{n}`. |
| `refund-transaction` | Use `evaluateRefundEligibility`; emit central `refund_decision`; enforce processing-fee-non-refundable; emit `processing_fee_non_refundable`, `safedeal_fee_refunded`/`buyer_refund_issued`/`seller_payout_cancelled` ledger tags. |
| `admin-payouts-list / -detail / -summary` | Return raw enum + display label; use `v_payout_account_state`. |
| `cart-checkout` / `storefront-checkout` / `checkout-review` | All call `buildPricingSnapshot`. |
| Dispute/delivery/confirmation | Use state-machine helper; assert none call Paystack transfer directly. |

### Payment method guard (spec §15)
In `initiate-paystack-payment`, if `provider_fee_estimate > MAX_TOTAL_SERVICE_FEE` for the chosen channel, return:
`This payment method is not available for this transaction. Please use a local card or bank transfer.`
Do not silently absorb the difference.

---

## Phase 4 — UI wiring (no redesign)

Every money-displaying screen swaps to `payment-flow.service` + central labels. Affected files include:
- Buyer: `BuyerPaymentSummary`, `StorefrontCheckout`, `CartCheckoutReview`, `BuyerTransactionDetail`, `BuyerTransactionAgreement`, `TransactionReceipt`
- Seller: `SellerTransactionDetail`, `SellerPayouts`, agreement/share pages
- Admin: `AdminPayouts`, `AdminTransactionDetail`, `AdminDisputeDetail`, refund UI, audit/event feeds

Per-screen acceptance:
- 5-line breakdown shown at checkout: **Item Total / SafeDeal Fee / Payment Processing Fee / Total Service Fee / Total Charged**.
- Seller-facing screens show **Seller Payout** only.
- Forbidden labels (Delivery Fee, USD, etc.) do not appear.
- Missing pricing → `—`, never `₦0.00`.
- No raw enum strings in user text.
- Helper text (spec §8) shown next to SafeDeal Fee, Payment Processing Fee, Total Service Fee.

---

## Phase 5 — Tests & sign-off

1. **Pricing parity** — feed item amounts ₦5k / ₦50k / ₦200k / ₦650k / ₦5m through both client and edge `buildPricingSnapshot`; assert exact match for all six output fields and the three worked examples in spec §9.
2. **Cap split correctness** — when provider fee = ₦2,000 and item ≥ ₦200k, assert `payment_processing_fee_amount = 2000`, `safedeal_fee_amount = 500`, `service_fee_amount = 2500`, `is_total_service_fee_capped = true`.
3. **Happy path** — checkout → webhook → escrow → release → completed. Assert ledger entries with new tags balance.
4. **Pricing lock** — direct `UPDATE transaction_pricing` after lock → blocked; `admin_correct_pricing` works only for `super_admin`.
5. **Refund mutex** — in-flight payout blocks refund; pending refund blocks release. `start_refund_atomic` already enforces this.
6. **Refund decision matrix** — for each spec §11 scenario (seller-fault, platform-fault, buyer early/late cancellation, buyer-loses, partial), assert refund_decision returns correct amounts and `payment_processing_fee_non_refundable = true`.
7. **Transfer failure → retry** — failure produces `failed` + `retry_allowed=true`; retry uses `_r1` reference.
8. **Idempotency** — double Release returns rejection from atomic RPC.
9. **Old transactions untouched** — sample 5 pre-migration transactions; confirm `service_fee_amount`, `total_amount`, `item_amount` unchanged; `seller_payout_amount` backfilled = `item_amount`; `pricing_model_version` is NULL.
10. **Payment method guard** — simulate provider fee > ₦2,500 → method blocked with copy from §15.
11. **Label sweep** — `rg` for raw enums (`funds_held_in_escrow`, `awaiting_release`, etc.) in JSX → none in user-visible strings; forbidden labels (`Delivery Fee`, `$`, `USD`) → none.

---

## Files created / modified

**Created**
- `supabase/functions/_shared/safedeal-money-policy.ts`
- `supabase/functions/_shared/payment-state-machine.ts`
- `supabase/functions/_shared/payout-eligibility.ts`
- `supabase/functions/_shared/refund-eligibility.ts`
- `src/lib/payment/money-format.ts`
- `src/lib/payment/payment-labels.ts`
- `src/types/payment-flow.types.ts`
- `src/services/payment-flow.service.ts`
- `src/db/migrations/018_central_payment_snapshot_hardening.sql`
- Deno + Vitest test files

**Modified (logic-preserving)**
- `src/lib/pricing.ts` + `supabase/functions/_shared/pricing.ts` — extend `PricingResult`, no math change
- Edge functions in the Phase 3 table
- Money-displaying UI components in Phase 4

**Explicitly deferred (Decision 6)**
- Provider-neutral abstraction
- Dual-approval / maker-checker
- Reconciliation runner + exceptions queue
- AML/sanctions/PEP/device-risk screening
- `fund_holding_model` / multi-jurisdiction config

---

## Final decisions baked into this plan

1. **Cap:** combined ₦2,500 stays. No separate caps.
2. **Order of cost:** Payment Processing Fee first inside the cap, SafeDeal Fee = remainder.
3. **Seller payout:** = Item Total. Read from `seller_payout_amount` only. Never recomputed on frontend.
4. **Refund:** Processing Fee non-refundable once charged. Seller-fault → refund Item Total + SafeDeal Fee. Other outcomes use central `refund_decision`. Refund ⟂ payout mutex.
5. **DB enums:** keep names, re-skin via display labels.
6. **Old transactions:** not recomputed; only derived backfill.
7. **Hardcoded test email in `initiate-paystack-payment`:** **left in place** (testing) — flagged here so we don't forget to remove before live traffic.
8. **Pricing model version stamp:** `NG_MVP_TOTAL_SERVICE_FEE_CAP_2500_V1` on all new transactions.

Approve and I'll start Phase 1.
