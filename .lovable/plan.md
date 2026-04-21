

# Plan: Fix all dashboard data correctness issues (consolidated)

## Issues to fix

### Bug B1 — Seller dashboard "Awaiting Buyer Payment" amount is wrong (HIGH)
**Where:** `supabase/functions/seller-dashboard/index.ts` (~line 125)
**Cause:** Sums `status IN ('awaiting_buyer','awaiting_payment')`. `awaiting_buyer` rows are pre-checkout drafts the buyer hasn't reviewed yet, so they shouldn't count under "Awaiting Buyer Payment". Inflated Chioma's number from ₦38,586 → ₦5,469,936.
**Fix:** Restrict bucket to `status = 'awaiting_payment'`. Add a second bucket `awaiting_buyer_review_amount` (sum where `status='awaiting_buyer'`) so the data isn't lost — surfaced as its own metric.

### Bug B5 — Seller `verification_level` shows buyer-named badges
**Where:** `supabase/functions/seller-profile/index.ts` lines 11–23, `seller-dashboard`, `SellerDashboardHero`
**Cause:** Underlying enum (`unverified | basic_verified | trusted_buyer | high_trust_buyer`) is buyer-named. Sellers see "Trusted Buyer" on their own dashboard.
**Fix:** Add a `verification_label` mapping returned alongside the raw enum:
- `unverified` → "Unverified Seller"
- `basic_verified` → "Verified Seller"
- `trusted_buyer` → "Trusted Seller"
- `high_trust_buyer` → "Premium Seller"

Returned by both `seller-profile` and `seller-dashboard`. `SellerDashboardHero` and seller profile badge consume `verification_label`. Underlying enum unchanged → all gating logic unaffected.

### Bug B2 — Reclassified, NOT a bug
`delivery-token-confirm` correctly writes `system_delivery_marked_at` (rider OTP path), not `buyer_acknowledged_delivery_at` (which is only set on buyer's manual confirm). Detail pages already branch on both. **Action:** correct test report invariant L6 to: *"Every used delivery-confirmation token has either `system_delivery_marked_at` OR `buyer_acknowledged_delivery_at` set."* No code change.

### Section K corrections (from previous plan, folded in)
The test report's Section K (edge function health sweep) had three rows that were misclassified; folding the corrections in here so they ship with the same report update:
- `buyer-dashboard` and `buyer-notifications` ⚠️ 403 → re-test using a real buyer JWT (Tunde's session); these aren't function defects, they're test-session role mismatches.
- `marketplace` ⚠️ 405 on POST → reclassify ✅: GET-only by design; 405 is correct.
- "OPTIONS preflight: n/a" → either run a real OPTIONS request per function or replace the column with "CORS headers present in 200 response".

Expand Section K coverage from 4 functions to all ~50 grouped by surface (buyer / seller / transaction lifecycle / delivery / public / admin), with sub-tables K1 CORS preflight, K2 authenticated happy path, K3 unauthenticated calls, K4 error log scan.

## Audited surfaces — confirmed clean ✅

No bug, no change needed:
- `buyer-dashboard` metrics (counts + joins all match DB)
- `seller-payouts` (real `payouts` + `payout_accounts` rows, computed sums, no hardcoding)
- `buyer-transactions` / `seller-transactions` (status enum maps exhaustive vs state machine)
- `transaction-detail` / `seller-transaction-detail` (variant detection consistent)
- `seller-profile` / `buyer-profile` permission engines (limits & tiers match policy memory)
- All "hardcoded" string hits in the source were `placeholder=` props on form inputs — not data
- `payout_accounts` table reference consistent across all three functions

## Files to change

1. **`supabase/functions/seller-dashboard/index.ts`**
   - Change `["awaiting_buyer", "awaiting_payment"]` → `["awaiting_payment"]` for `awaiting_buyer_payment_amount`
   - Add derived `awaiting_buyer_review_amount` = sum of `buyer_total_amount` where `status='awaiting_buyer'`
   - Compute and return `verification_label` on the `seller` block via shared helper

2. **`supabase/functions/seller-profile/index.ts`**
   - Return `verification_label` derived from the same enum→label map (so dashboard hero badge and profile page badge always match)

3. **`src/services/seller-dashboard.service.ts`**
   - Add `awaiting_buyer_review_amount: number` to `SellerMetrics`
   - Add `verification_label: string` to the `seller` block of `SellerDashboardResponse`

4. **`src/components/seller/SellerMetricsCards.tsx`**
   - Tighten "Awaiting Buyer Payment" card subtitle → "Buyer started checkout, payment not completed"
   - Add a 6th card "Awaiting Buyer Review" wired to `awaiting_buyer_review_amount` (so the previously over-counted draft amount stays visible, just in the right bucket)

5. **`src/components/seller/SellerDashboardHero.tsx`**
   - Replace any "Trusted Buyer / Verified Buyer" badge text with `verification_label` from the API

6. **Re-deploy** edge functions: `seller-dashboard`, `seller-profile`

7. **`/mnt/documents/safedeal-test-report.md`** — append a "Re-test after fix" section:
   - B1 → ✅ closed; recompute Chioma's `awaiting_buyer_payment_amount` (expect ₦38,586) and new `awaiting_buyer_review_amount` (expect ₦5,431,349.97)
   - B5 → ✅ closed; verify `verification_label = "Trusted Seller"` for Chioma
   - B2 → reclassified, invariant L6 reworded
   - Replace Section K with corrected K1–K4 sub-tables and expanded function coverage
   - Confirm buyer dashboard untouched — Tunde's 7 active / 2 awaiting delivery / 2 open disputes still match

## Verification

After deploy, re-run the targeted assertions from the test report:
- `seller-dashboard.metrics.awaiting_buyer_payment_amount` = **₦38,586** (was ₦5,469,936)
- `seller-dashboard.metrics.awaiting_buyer_review_amount` = **₦5,431,349.97** (new bucket)
- `seller.verification_label` = "Trusted Seller" for Chioma (raw `verification_level` still `trusted_buyer`)
- `transactions_created_count`, `funds_held_in_escrow_amount`, `funds_pending_release_amount`, `payouts_completed_amount` unchanged
- Re-call `buyer-dashboard` with Tunde's session → 200 with correct counts
- Re-call `marketplace` GET → 200; POST → 405 (now reclassified ✅ in K2)

## Risk
- All changes are read-side aggregation tweaks and additive label fields. No schema migration, no state machine impact.
- New `awaiting_buyer_review_amount` field and 6th card are additive; will not break existing consumers.
- `verification_label` is cosmetic — underlying `verification_level` enum is unchanged so all gating/permission logic continues to work identically.

