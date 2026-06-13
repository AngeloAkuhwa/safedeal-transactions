
# Phase 3 — Wire edge functions to the new snapshot + view

Goal: switch every money-mover and money-reader to the canonical columns added in Phase 2 (`payment_processing_fee_amount`, `seller_payout_amount`, `pricing_model_version`, `is_total_service_fee_capped`) and the canonical view (`v_payout_account_state`). Behavior stays identical to today for unlocked transactions; legacy locked rows continue to read through fallbacks. No new tables, no new endpoints, no UI changes in this phase.

---

## 0. Ground rules

- **No math changes.** The shared policy from Phase 1 (`safedeal-money-policy.ts`) is already the math. Edge functions just write what it returns and read what was written.
- **Two-source-of-truth window stays.** During this phase, callers that still read `processing_fee_amount` / `seller_net_amount` keep working — the new columns are written **in addition**, not as a replacement. We'll remove the old reads in Phase 4 (UI sweep) once nothing references them.
- **Locked rows are never recomputed.** All new writes happen at row INSERT or pre-lock UPDATE only.
- **Auth + RLS unchanged.** All edits below stay within the existing service-role + signed-in-user patterns.

---

## 1. Pricing writers — stamp the new columns at INSERT time

Six functions create `transaction_pricing` rows. Each one will, in the same insert, set:

```ts
payment_processing_fee_amount: snapshot.payment_processing_fee_amount,
seller_payout_amount:          snapshot.seller_payout_amount,
is_total_service_fee_capped:   snapshot.is_total_service_fee_capped,
pricing_model_version:         snapshot.pricing_model_version,  // "NG_MVP_TOTAL_SERVICE_FEE_CAP_2500_V1"
```

`snapshot` comes from `buildPricingSnapshot(itemAmount, providerFeeEstimate)` in `_shared/safedeal-money-policy.ts` (Phase 1). Where the function previously called the older `computePricing(item_amount, currency)`, we add a parallel `buildPricingSnapshot` call and write both shapes side-by-side so existing math and existing columns are unchanged.

Files touched (writer side):

| File | Change |
|---|---|
| `supabase/functions/create-transaction/index.ts` (line 168, `upsertByTransaction`) | Add the four new columns to the pricing object. |
| `supabase/functions/storefront-checkout/index.ts` (line 237) | Same. |
| `supabase/functions/cart-checkout/index.ts` (lines 200 + 266) | Same on both the update and the insert branches. |
| `supabase/functions/claim-offer/index.ts` (line 361) | Same. |
| `supabase/functions/initiate-paystack-payment/index.ts` (line 169) | Read snapshot before initiating; pass the same `payment_processing_fee_amount` already implied by the current Paystack-fee estimate. Block the payment when `provider_fee_estimate > MAX_TOTAL_SERVICE_FEE` (2,500) and surface a `payment_method_blocked` error (Phase 1 already exposes the gate; this is just the call site). |
| `supabase/functions/paystack-webhook/index.ts` (line 151 area) | When backfilling pricing on rare webhook-first paths, also write the four new columns. |

Each call uses the shared policy module — no per-file math duplication.

---

## 2. Money-movers — read only `seller_payout_amount` going forward

The release/retry/refund path today reads from `payouts.amount` (which was set when the payout row was created) or from the legacy `seller_net_amount` column. After Phase 3:

| File | Change |
|---|---|
| `supabase/functions/release-payout/index.ts` | When creating the `payouts` row, set `payouts.amount = transaction_pricing.seller_payout_amount` (fall back to `seller_net_amount` only if the new column is NULL — i.e. legacy rows). No formula change. Call `evaluatePayoutEligibility` from `_shared/payout-eligibility.ts` (Phase 1) before doing anything; refuse to proceed if `outcome !== "eligible"`. |
| `supabase/functions/retry-payout/index.ts` | Same eligibility check up front. Continue to read `payouts.amount` (already correct from the original release). Replace the inline `payout_accounts.verification_status` + `provider_recipient_code` check with a single read from `v_payout_account_state` (`account_state = 'verified_ready'`). |
| `supabase/functions/refund-transaction/index.ts` | Call `evaluateRefundEligibility` from `_shared/refund-eligibility.ts` (Phase 1) and emit the central `refund_decision` to the response. Write ledger tags `processing_fee_non_refundable`, `safedeal_fee_refunded`/`buyer_refund_issued`/`seller_payout_cancelled` exactly as the decision object dictates. Refund amount = `transaction_pricing.buyer_total_amount - payment_processing_fee_amount` (with the same legacy fallback). |

Mutex with payouts is enforced by the existing `payouts.status` checks plus the new `evaluateRefundEligibility` gate — no new locks needed.

---

## 3. Money-readers — switch to the new column with a fallback

These functions report numbers to the UI. Today they read `seller_net_amount` / `item_amount`. After Phase 3 they prefer the new columns, falling back when NULL so locked legacy rows still render:

```ts
const payoutAmount =
  Number(pricing.seller_payout_amount ?? pricing.seller_net_amount ?? 0);
const processingFee =
  Number(pricing.payment_processing_fee_amount ?? pricing.processing_fee_amount ?? 0);
```

Files:

| File | Change |
|---|---|
| `supabase/functions/seller-payouts/index.ts` | Select includes the two new columns; lines 207, 315, 394, 451 read through the fallback above. |
| `supabase/functions/admin-payouts-list/index.ts` | Add the two new columns to the pricing select; use fallback. Also fix the broken `account_number` select by switching to `v_payout_account_state` (see §4). |
| `supabase/functions/admin-payouts-detail/index.ts` | Same select+fallback. Same view swap for the account section. |
| `supabase/functions/admin-payouts-summary/index.ts` | If it aggregates payout totals from pricing rows, same select+fallback. |
| `supabase/functions/seller-transaction-detail/index.ts`, `buyer-transactions/index.ts`, `seller-transactions/index.ts`, `transaction-detail/index.ts`, `transaction-verify/index.ts`, `seller-dashboard/index.ts`, `buyer-dashboard/index.ts` | If they surface seller-payout or processing-fee numbers, add the columns to their select and read through the fallback. Read-only — no writes. |

---

## 4. Payout-account state — one read, four canonical states

Today three places independently compute "is this seller payout-ready" from raw `verification_status` + `provider_recipient_code`. Phase 2 shipped `v_payout_account_state` for exactly this.

| File | Change |
|---|---|
| `supabase/functions/seller-payouts/index.ts` (line 90) | Replace the `payout_accounts` select with `v_payout_account_state` and use `account_state` directly to drive the existing block messages. |
| `supabase/functions/admin-payouts-list/index.ts` (line 118) | Same swap; the existing `payout_account` shape in the response gets one extra field `account_state`. |
| `supabase/functions/admin-payouts-detail/index.ts` (line 51) | Same. The detail-gates section keeps its current per-check breakdown (those gates are useful in the drawer) but adds `account_state` so the UI in Phase 4 can collapse them into one badge. |
| `supabase/functions/retry-payout/index.ts` (line 71) | Replace the verification check with `account_state = 'verified_ready'`; surface `verified_no_recipient` and `unverified` as distinct, human-readable blockers. |
| `supabase/functions/update-payout-account/index.ts` (only if it currently reads back its own state) | Read back through the view so the response is consistent. |

`src/lib/payout-presentation.ts` (the shared frontend mapper from the earlier turn) and `src/services/admin-payouts.service.ts` get a small additive change in §6 to pass `account_state` through.

---

## 5. `_shared/payout-eligibility.ts` — fix the wrong assumption

The Phase 1 module ordered candidates by `is_default`, a column that doesn't exist. Replace with a single read from `v_payout_account_state`:

```ts
const { data: acct } = await admin
  .from("v_payout_account_state")
  .select("account_state, account_id, provider_recipient_code")
  .eq("user_id", sellerId)
  .maybeSingle();

const account_ready = acct?.account_state === "verified_ready";
```

Then map `account_state` directly into the `first_blocker` reason for `verified_no_recipient` / `unverified` / `no_account`. No other module needs to change because the function's signature is unchanged.

---

## 6. Service layer — keep it thin

Only two service-layer files actually need to learn the new fields. None of them gain new business logic — they just pass the snapshot/state through to the UI in a typed shape.

| File | Change |
|---|---|
| `src/services/payment-flow.service.ts` (Phase 1) | `getPricingSnapshot(transactionId)` returns `{ ...legacy, payment_processing_fee_amount, seller_payout_amount, is_total_service_fee_capped, pricing_model_version }`. Already typed via Phase 1's `payment-flow.types.ts`; the regenerated DB types pick this up. |
| `src/services/admin-payouts.service.ts` | Add `account_state: PayoutAccountState \| null` to the row type; pass the existing payload through unchanged. |

The UI components are intentionally **not** touched in Phase 3 — that's Phase 4. Today's components already render through the fallback shape, so once the writers stamp the new columns the components silently start showing them where the snapshot is present.

---

## 7. Verification after Phase 3 lands

A. **Static checks (parallel).**
- `tsc` passes via the normal build pipeline.
- `rg "seller_net_amount|processing_fee_amount"` in `supabase/functions/release-payout|retry-payout|refund-transaction|admin-payouts-*|seller-payouts` shows **only fallback reads**, never bare reads.

B. **Functional smoke (in this order).**
1. Create a fresh transaction via `create-transaction` → confirm the new row in `transaction_pricing` has all four columns populated, `pricing_model_version = 'NG_MVP_TOTAL_SERVICE_FEE_CAP_2500_V1'`.
2. Initiate Paystack payment via `initiate-paystack-payment` → confirm a "bank transfer / large card" simulated `provider_fee_estimate > 2500` produces `payment_method_blocked` and does not call Paystack.
3. Run paystack-webhook for a happy-path payment → confirm `money_status` advances and the pricing row stays unchanged (no rewrite).
4. `release-payout` on the new transaction → confirm `payouts.amount = seller_payout_amount` (not `seller_net_amount`) and a ledger entry exists.
5. `retry-payout` on a forced-failed payout → confirm the eligibility gate fires when `v_payout_account_state.account_state != 'verified_ready'`.
6. `refund-transaction` on a paid-but-not-released transaction → confirm `refund_decision.payment_processing_fee_non_refundable === true` and the ledger tags match.
7. `admin-payouts-list` and `admin-payouts-detail` → confirm `payout_account.account_state` is present and matches what `seller-payouts` would show the same seller.

C. **Negative checks.**
- Pricing-lock trigger still rejects direct UPDATEs (already verified in Phase 2).
- An attempt to release a payout where the seller is `verified_no_recipient` returns `first_blocker = "payout_account_recipient_missing"` and never calls the provider.

D. **Cross-check.** `account_state` returned by `seller-payouts`, `admin-payouts-list`, and `admin-payouts-detail` is identical for the same seller for the same point-in-time read. This is the §7.5 "drawer ≠ table" fix.

---

## 8. What this phase deliberately does NOT do

- No UI refactor (Phase 4 sweeps `BuyerPaymentSummary`, `SellerCreateTransaction`, `CartCheckoutReview`, `BuyerTransactionVerify`, the admin payouts table & drawer, and the seller payouts page).
- No removal of `seller_net_amount` / `processing_fee_amount` reads. They stay as fallbacks until the UI sweep is complete.
- No new background reconciliation job, no dual-approval flow, no provider abstraction — those are still deferred (decisions from the integration plan stand).
- No change to `auto-timeout-payments`, `auto-escalate-silent-disputes`, `flag-stuck-confirmations`, `resolve-release-review` — they don't move money. (They will inherit the central labels in Phase 4 where they emit user-visible text.)
- No write of the per-transaction `pricing_model_version` for **legacy** rows — they stay NULL by design.

---

## 9. Rollback

Phase 3 is pure code (no migrations). To roll back, revert the touched edge-function files. The pricing columns added in Phase 2 stay; new writes simply stop populating them again. Because every reader uses the legacy fallback, behavior degrades gracefully back to the pre-Phase-3 state.

---

## 10. After Phase 3

- All money-moving paths read and write through one snapshot shape.
- Drawer and table show identical payout-account state for any seller.
- The system is structurally ready for Phase 4 (UI sweep: central labels everywhere, `—` for missing values, 5-line breakdown, forbidden labels removed, no raw enums in user copy).

Approve and I'll start with the writer-side changes (§1) — one or two files per turn so each one is easy to review — and verify against §7 as I go.
