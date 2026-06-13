
# Phase 5 — Notifications & Transactional Emails (canonical labels + amounts)

## Status (this run)

- **Done**: `_shared/money-copy.ts` (server-side label registry + `formatMoney`,
  `formatMoneyOrDash`, `buildBuyerReceiptLines`, `buildSellerPayoutLines`).
  Notification copy rewritten to use canonical labels + amounts in
  `release-core.ts` (payout-released, refund-issued), `retry-payout` (retry
  attempt with amount), `seller-confirm-completion` (release-pending message
  now names `Seller Payout` + amount). Affected edge functions redeployed.
- **Deferred — email templates**: `email_domain--check_email_domain_status`
  reports no domain configured. Email scaffolding (6 templates +
  `send-transactional-email` wiring) is blocked on the user completing
  domain setup. Once set up, run `scaffold_transactional_email`, then author
  templates using `buildBuyerReceiptLines` / `buildSellerPayoutLines`.

## Email-setup follow-up

<presentation-actions>
<presentation-open-email-setup>Set up email domain</presentation-open-email-setup>
</presentation-actions>

**Goal:** Every user-facing money string sent outside the app (in-app notifications, push payloads, transactional emails) must use the same labels and amounts as the in-app UI built in Phase 4. No new pricing math, no DB schema changes — purely copy + adapter wiring through the existing `PRICING_LINE_LABELS` registry and `viewFromRow()` helper.

## Scope (in)

1. **In-app notifications** written from edge functions via `_shared/notify.ts`:
   - `release-core.ts` — payout-approved + refund-initiated messages.
   - `retry-payout/index.ts` — retry success/failed notifications.
   - `seller-confirm-completion/index.ts` — "add payout account" + confirmation messages.
   - `transaction-verify/index.ts` — payment confirmed → buyer + seller.
   - `cart-checkout`, `claim-offer`, `storefront-checkout`, `create-transaction` — any notification that quotes an amount.
   - `seller-notifications` / `buyer-notifications` listing functions — only the `message`/`title` formatting paths that re-render amounts.

2. **Transactional email templates** (scaffolded under `supabase/functions/_shared/transactional-email-templates/` once `scaffold_transactional_email` runs as part of this phase if absent):
   - `payment-received-buyer` (receipt)
   - `payment-received-seller`
   - `payout-released-seller`
   - `payout-failed-seller`
   - `refund-issued-buyer`
   - `dispute-opened-seller` / `dispute-resolved-buyer-seller` (amount lines only)

3. **Shared formatting module** — new `supabase/functions/_shared/money-copy.ts`:
   - `formatMoney(amount, currency)` — single source for `₦12,500.00` style.
   - `formatMoneyOrDash(amount, currency)` — mirrors the frontend helper.
   - `resolveMoneyLabel(key)` — server-side mirror of `PRICING_LINE_LABELS`, exported as a typed map so both edge-function notifications and React Email templates pull the same strings (e.g. `item_amount → "Item Total"`, `platform_fee_amount → "SafeDeal Fee"`, `payment_processing_fee_amount → "Payment Processing Fee"`, `service_fee_amount → "Total Service Fee"`, `total_amount → "Total Charged"`, `seller_payout_amount → "Seller Payout"`).
   - `buildBuyerReceiptLines(pricingRow)` and `buildSellerPayoutLines(pricingRow)` — use the same `viewFromRow` semantics already in `payment-flow.service.ts` (fall back `payment_processing_fee_amount ?? processing_fee_amount`, never read `escrow_fee_amount` / `delivery_fee_amount`).

4. **Notification copy rewrites** (illustrative, not exhaustive):
   - Payout released seller:
     - title: `Payout on the way`
     - message: `Your Seller Payout of ${formatMoney(seller_payout_amount)} for ${transaction_code} is on its way to your bank.`
   - Refund issued buyer:
     - message: `SafeDeal has initiated a refund of ${formatMoney(refund_amount)} for ${transaction_code}.` (already correct shape; switch to helper so currency + grouping are consistent).
   - Payment confirmed buyer:
     - message: `We've received your ${formatMoney(total_amount)} ("Total Charged") for ${transaction_code}. Funds are held in escrow until you confirm delivery.`
   - Payment confirmed seller:
     - message: `Payment received for ${transaction_code}. After fees, your Seller Payout will be ${formatMoney(seller_payout_amount)}.`

5. **Email template content** — each transactional email uses:
   - A 5-line `<PricingBreakdown>`-equivalent block in React Email (`Section` + `Row`/`Column`) generated from `buildBuyerReceiptLines`, with the "capped at ₦2,500" footnote when `is_total_service_fee_capped` is true.
   - A `Seller Payout` single line on seller-facing emails (mirrors `<SellerPayoutLine>`).
   - Never references "Delivery Fee", "Shipping Fee", "Escrow Fee", "Total Paid", "Net Amount", or any legacy label.

## Scope (out)

- No pricing math changes, no DB migrations, no policy snapshot changes.
- No new notification triggers — only re-format copy on existing ones.
- No marketing/digest emails (forbidden).

## Implementation steps

1. **Add `_shared/money-copy.ts`** with `resolveMoneyLabel`, `formatMoney`, `formatMoneyOrDash`, `buildBuyerReceiptLines`, `buildSellerPayoutLines`. Unit-test by importing into one edge function and logging.
2. **Sweep edge-function notifications**: replace inline ``${(tx as any).amount}`` / `toLocaleString()` strings with `formatMoney(...)` and the registry labels. Files: `release-core.ts`, `retry-payout`, `seller-confirm-completion`, `transaction-verify`, `cart-checkout`, `claim-offer`, `storefront-checkout`, `create-transaction`.
3. **Email infrastructure**: run `email_domain--check_email_domain_status`; if no domain → show setup dialog and pause. If domain present but `scaffold_transactional_email` not yet run → scaffold once.
4. **Author / refactor templates** under `_shared/transactional-email-templates/` (6 templates above). Register each in `registry.ts`. Drive amounts from `templateData` populated by callers using `buildBuyerReceiptLines` / `buildSellerPayoutLines`.
5. **Wire send calls** at the existing trigger sites (`transaction-verify`, `release-core`, `retry-payout`, refund flow, dispute flow). Use idempotency keys like `payout-released-${transaction_code}` to prevent duplicate sends.
6. **Deploy** all touched edge functions (`deploy_edge_functions`) and email functions.

## Verification

- `tsc --noEmit` clean.
- `rg -n "Total Paid|Protection Fee|Escrow Fee|Delivery Fee|Shipping Fee|Net Amount|seller_net_amount" supabase/functions/_shared/transactional-email-templates supabase/functions/**/index.ts | rg -v "// legacy"` returns zero matches in notification/email code.
- Manual smoke: trigger one of each event in preview, confirm in-app notification copy + `email_send_log` row + rendered preview match Phase 4 UI breakdown line-for-line.
- Spot-check capped + floored transactions show the same footnotes the UI shows.

## Rollback

Pure copy + adapter changes. Reverting `_shared/money-copy.ts` and the touched files restores prior strings. Email templates are additive; un-registering them disables sends without affecting other flows.

## Risk

Low. Only side effect is one queued email per existing trigger. Idempotency keys prevent duplicate sends. No money math touched.

---

# Phase 7 (optional cleanup) — Drop legacy column reads

## Status (this run)

- **Done — type-level deprecation**: added `LegacyPricingRowFields` to
  `src/types/payment-flow.types.ts` with `@deprecated` JSDoc on
  `processing_fee_amount`, `seller_net_amount`, `escrow_fee_amount`,
  `delivery_fee_amount`. New code surfaces a compile-time hint to avoid
  reading them.
- **Deferred — fallback removal**: keeping `?? processing_fee_amount` and
  `?? seller_net_amount` reads in service/edge layers until Phase 6
  reconciliation confirms 100% snapshot coverage on unlocked rows. Removing
  them now risks `—` rendering for any unmigrated locked row. Phase 7 will
  delete those `??` branches in one mechanical sweep once Phase 6 ships.

**Prerequisite:** Phase 6 reconciliation confirms 100% of unlocked rows carry a complete `transaction_pricing` snapshot and `pricing_model_version` is non-null. Locked (paid/immutable) rows keep their original snapshot — we never rewrite those.

## Scope

1. **Service layer** (`src/services/*`): remove fallbacks like `pricing.payment_processing_fee_amount ?? pricing.processing_fee_amount` and `pricing.seller_payout_amount ?? pricing.seller_net_amount`. After cleanup, `viewFromRow` reads only canonical keys.
2. **Edge functions**: same fallback removal in `seller-payouts`, `seller-transactions`, `seller-transaction-detail`, `admin-payouts-*`, `admin-transaction-detail`, `admin-export-transaction-data`, `seller-analytics`, `release-core`, `refund-eligibility`, `safedeal-money-policy`.
3. **Type narrowing** (`src/types/payment-flow.types.ts` and edge equivalents): mark `processing_fee_amount`, `seller_net_amount`, `escrow_fee_amount`, `delivery_fee_amount` as `@deprecated never read` and remove from `PricingSnapshotView`. Keep them as optional/ignored in raw row types so locked snapshots still deserialize.
4. **Tests / fixtures**: update any fixture that seeds `seller_net_amount` / `processing_fee_amount` to use canonical keys.
5. **Documentation**: update `.lovable/plan.md` and the policy doc to mark legacy keys as "read-only on locked snapshots, never written, never displayed".

## Out of scope

- No DB column drops. Legacy columns stay on `transaction_pricing` to preserve locked-row history.
- No retroactive backfill — Phase 6 already gated this.

## Verification

- `rg -n "processing_fee_amount|seller_net_amount|escrow_fee_amount|delivery_fee_amount" src supabase/functions | rg -v "// locked-snapshot only|@deprecated"` returns zero matches in active read paths.
- `tsc --noEmit` clean.
- Smoke: open one historic locked transaction (legacy snapshot) + one new transaction; both render identical Phase 4 breakdown.
- Reconciliation dashboard (built in Phase 6) still reports 100% snapshot coverage post-cleanup.

## Rollback

Each file is mechanically reverted by re-adding the `??` fallback. Because nothing is dropped at the DB level, rollback is risk-free.

## Risk

Low–medium. The only failure mode is a row missing a canonical key that previously relied on fallback — Phase 6 reconciliation explicitly gates against this. If any are found post-merge, restore the single-line fallback for that field only.
