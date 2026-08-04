# Batch 4 — One configurable source of truth for charges

Note on the 5b approval: I am in plan mode, so the ledger write and the `ledger_write_guarded` guard cannot execute in this turn. They are Step 0 below and run first the moment this plan is approved, exactly as dry-run.

## Step 0 — Item 5b write (already approved, executes first)
- Migration: set derived `balance_after` on the 9 `adjustment` rows only; no touch to `amount`, `entry_type`, or transaction linkage.
- Add guard in `ledger_write_guarded`: reject future `adjustment` inserts without a balance.
- Document `freeze_hold`, `payout_awaiting_release`, `dispute_release_approved_pending_admin_release` as intentionally NULL (intent markers, not cash-chain positions).
- Verify: zero adjustment rows with NULL `balance_after`, chain replay reproduces every stored value, admin smoke 47/47, full tests + typecheck.
- Rollback: single UPDATE back to NULL on those 9 ids (values recorded in the dry run).

## Item 1 — Server: single read path (needs approval)
Every server `computePricing` caller, audited:

Config-aware already, with correct vendor scope:
- `create-transaction` — `loadPricingConfig(userId)`; userId is the seller creating it.
- `claim-offer` — `loadPricingConfig(offer.seller_id)`.
- `storefront-checkout` — `loadPricingConfig(product.seller_id)`.
- `cart-checkout` — `loadPricingConfig(sellerId)` per seller group.
- `initiate-paystack-payment` — `loadPricingConfig(tx.seller_id)`.

Config-blind callers, all display/reconciliation paths:
- `verify-paystack-payment:110`, `paystack-webhook:162`, `transaction-agreement:166`, `resolve-share-token:123`, `transaction-detail:148`, `seller-transaction-detail:221` and `:252`.

Proposed change: these six recompute from `transaction_pricing.item_amount` for display/fallback. The right fix is not to feed them today's config but to make them read the immutable snapshot first and only fall back to `computePricing(..., loadPricingConfig(seller_id))` when a snapshot row is genuinely absent — otherwise historical transactions would re-render at current rates. `seller-transaction-detail:252` computes from `escrow.held_amount` with no snapshot; resolve via `tx.seller_id`. Every one of these paths has a seller id in scope, so no path lacks a vendor id.

Risk: display-only, no charge behaviour change. Rollback: revert per file. Tests: snapshot-wins-over-recompute assertion.

## Item 2 — Client preview parity (safe to apply)
Preview surfaces and current state:
- `StorefrontCheckout.tsx` — `useEffectivePricingConfig(product.seller_id)`. Correct.
- `BuyerCart.tsx` — `useEffectivePricingConfigs(sellerIds)`. Correct.
- `CartCheckoutReview.tsx` — `useEffectivePricingConfigs(sellerIds)`. Correct.
- `SellerCreateTransaction.tsx` — `useEffectivePricingConfig(currentUserId)`; seller is the vendor. Correct.
- Sweep for any fee shown outside these four (offer detail, buyer private offers, product detail pages); anything found gets the same hook.

Real parity gap: `useEffectivePricingConfig` returns `{}` while loading and on fetch failure, so first paint can show default-rate fees for a vendor that has overrides. Fix: expose a `loading` flag and render the fee lines as a skeleton until config resolves, instead of a possibly wrong number.

## Item 3 — Anti-drift tests (safe to apply)
- (a) Static test scanning `supabase/functions/**` for `computePricing(` calls; each must either pass a config argument or be in an explicit allow-list of snapshot-read paths.
- (b) Fallback-parity test: `DEFAULT_PRICING_CONFIG` compared against a checked-in fixture of the seeded platform rows. Confirmed today that the DB rows match the defaults (250 / 2500 / the four tiers), so a DB read failure degrades to the identical price.
- (c) Extend `pricing-parity.contract.test.ts` across config variations: differing tier counts, floor-above-cap, single open-ended tier, zero floor.

## Item 4 — Admin write path (report + minimal fixes, needs approval)
`AdminSettings.tsx` already reads and writes `pricing.min_platform_fee_ngn`, `pricing.max_total_service_fee_ngn`, and the tier rates. To verify and report: the `financial_controls.configure` gate, one audit entry per changed key, and input validation. Expected minimal fixes: numeric validation (non-negative, floor <= cap, rates within a sane 0–20% band, tiers strictly ascending and non-overlapping with exactly one open-ended tier), and a "deprecated" badge sourced from `DEPRECATED_SETTING_KEYS` for the 7 dead keys. The report will also state explicitly that settings affect new transactions only — `transaction_pricing` is written once at creation/checkout and never re-derived.

## Item 5 — Fee transparency (approved to build)
- Shared `FeeExplainer` built on the existing `PricingBreakdown` and `Collapsible` components, collapsed by default, no redesign, no added step.
- Seller side: beneath `seller_net` in the create-transaction wizard — item amount, platform fee, Paystack fee, what the seller receives, fees non-refundable.
- Buyer side: at the checkout total, the same breakdown from the buyer's perspective.
- Copy is derived from the resolved config object the preview already computes with (tier rate hit, floor, cap), never hardcoded, so a settings change propagates automatically on next load.

## Item 6 — Server-side payout gate (needs approval)
Admin release already gates: `release-core.ts:77-92` requires `account_state = 'verified_ready'` plus a `provider_recipient_code`, recording a block reason otherwise. `retry-payout` reads the same fields — confirm it enforces rather than merely reads. The gap is the seller-facing path; `seller-payouts` is read-only today, so the gate belongs in whichever mutation initiates a payout, via a shared `assertPayoutEligible()` used by release, retry, and any future initiation. Seller-facing error: `payout_account_unverified` → "Add and verify your payout account before funds can be released."

## Item 7 — Release-time fee retention (verify, then minimal fix)
Release transfers `transaction_pricing.seller_payout_amount` to the recipient — consistent. Ledger today: 10 `fee_record` entries vs 3 `payout_debit`, which indicates fee records are written at payment time, not per release. The report will state exactly when `fee_record` is written and whether every released transaction has one; a fix is proposed only if a released transaction is missing its fee record. No Paystack charge-time Split.

## Item 8 — 2FA column defect (propose only, do NOT apply)
`_shared/auth.ts:69-74` and `orchestration-rules.ts:168` query `.select("value").eq("key", …)` against `system_settings`, whose columns are `setting_value` / `setting_key`. The read returns nothing, so the AAL2 gate has never fired — it fails open.

Blast radius, critical: `security.two_factor_admin` is already `true` in the platform row. Correcting the columns alone would immediately require AAL2 of every admin. There are 2 active internal users; `auth.mfa_factors` is not readable from this connection (permission denied), so enrolment state is unknown and must be read via the admin API before anything is flipped.

Proposed safe rollout:
1. Fix the column names in both files, but bind enforcement to a new, separate, default-OFF key (`security.two_factor_admin_enforced`), leaving `security.two_factor_admin` as an advisory/UI flag.
2. Log-only mode first: record who would have been blocked, deny nobody.
3. Read real MFA enrolment via the admin API and report it.
4. Flip the enforcement key only once every active admin is enrolled at AAL2, with a documented break-glass procedure.

## Approval split
- Safe to apply: Items 2, 3, 5.
- Needs approval (money, admin, or auth behaviour): Step 0 (already approved), Item 1, Item 4 fixes, Item 6, Item 7 fix if needed, Item 8 (propose only).