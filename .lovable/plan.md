# Phase 0h — Runtime correctness, pricing truth, and claim-lock closure

## Goal
Close the two live runtime/data defects, remove the remaining fabricated or unsupported UI states, and make the trust scanner catch the laundering/extractor paths that escaped Phase 0g.

## Pricing decision and current source of truth
- The approved G3 **SafeDeal platform fee** is `2% + ₦100`, capped at **₦5,000**.
- The separate **total service fee ceiling** is currently **₦7,000**. It includes the SafeDeal fee plus payment processing: ₦5,000 maximum platform fee + ₦2,000 maximum local payment-processing fee.
- The live database platform settings confirm all four values: rate `0.02`, flat `100`, platform cap `5000`, total-service cap `7000`. No vendor overrides currently exist for these keys.
- The frontend and edge-function disaster-recovery fallbacks also use `5000`/`7000`; those mirror the database rather than defining policy.
- The stale `₦2,500` value survives in the old payment-flow model/version, snapshot inference, documentation, and buyer copy. It is not authoritative for G3.
- We will not change the live pricing policy. We will carry the **actual applied cap** into each pricing snapshot/view and render that value. Historical rows without a stored applied cap will show no cap amount rather than infer an obsolete one.

## Implementation
1. **Cart checkout hook crash**
   - Move `useEffectivePricingConfigs` above every early return, deriving vendor IDs safely from optional query data.
   - Add a React smoke test that drives `CartCheckoutReview` from loading to loaded and fails on hook-order errors.

2. **Applied pricing cap in canonical breakdown**
   - Add nullable `max_total_service_fee_amount` to the client snapshot/view contract.
   - Propagate the resolved vendor cap into estimate rows on cart/storefront checkout.
   - Persist and return the applied cap for new transaction pricing snapshots so historical rendering is snapshot-first and vendor-safe; update all pricing creators/readers consistently.
   - Remove every `2500` inference and the obsolete model-version constant; `PricingBreakdown` formats the snapshot’s applied cap only when the capped flag and amount are both present.

3. **Trust-claim laundering closure**
   - Fix `BuyerTransactionTracking` so held/released/other escrow states each render factual whole-node copy; no active claim on null/pending/refunded/frozen.
   - Add a contract rule banning `alwaysClaim(...)` or `resolveClaim(...)` inside template literals and string concatenation. Keep resolver results renderable as whole nodes without introducing unsafe coercion workarounds.

4. **Named live defects**
   - `TransactionSuccess`: render `—` for fee percentage, fee amount, and seller net when pricing is absent.
   - Seller transaction detail function: select `identity_verified` and identity-submission state; expose them through the service type and pass them to `BuyerTrustBadges`.
   - `BuyerTrustBadges`: remove dead `verificationLevel` and malformed dynamic Tailwind hover classes.
   - `AuthInfoPanel`: remove the fabricated testimonial and outcome guarantee.
   - `SellerTrustBanner`: remove unsupported “24/7 Monitoring”.
   - `AgreementTrustIndicators`: accept `lockedAt` and render lock/dispute wording only for a real locked snapshot; update buyer/seller agreement pages.
   - `PublicProductDetail`: remove null `hr Verification` output and the dead tracked-delivery variable.
   - `MarketplaceProductCard`: replace unregistered “Escrow Price” with a neutral price label.

5. **Scanner and allowlist repair**
   - Expand trust vocabulary for `24/7` and monitoring; ban “always get paid” outcome guarantees.
   - Capture both branches of inline JSX ternaries.
   - Stop extracting CSV headers, source fragments, HTML entities, and mid-expression/template residue as user copy.
   - Delete noisy/stale allowlist entries.
   - Remove `BULK_APPROVED_REASONS`; lower the repeated-reason threshold below the current observed distribution and hand-triage every remaining repeated buyer/money-facing reason until the guard can genuinely fail.

6. **Backend delivery and verification**
   - Deploy the changed seller transaction detail and any pricing-producing/reading edge functions touched by the applied-cap snapshot field.
   - Run focused tests first while iterating.
   - After the final edit, run exactly these last, in order: full Vitest suite, production Vite build, then `tsgo` last.
   - Return raw terminal output blocks: Vitest through `Duration`, Vite chunk table through `✓ built in`, and literal `tsgo` stdout/stderr/exit status, followed by a written **Limitations** section and the required change report.

## Technical notes
- A database migration is required only to add the nullable applied-cap column to `transaction_pricing`; existing financial rows remain untouched.
- The new column records the cap used when the transaction snapshot is created. It does not recalculate or rewrite historical money.
- UI components continue to use the existing service layer and semantic design tokens.
