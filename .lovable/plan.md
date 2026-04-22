

# Plan: Fix seller transaction list & dashboard data inconsistencies

## What the screenshots reveal vs DB ground truth

I cross-checked Chioma's seller dashboard, transactions list, payouts, and disputes against the database. Real bugs found, listed in priority order.

### Bug T1 (HIGH) — Revenue card shows ₦958.0K but is wrong

**Where:** `supabase/functions/seller-transactions/index.ts` line ~273
**Cause:** `summary.total_earned` sums `transaction_pricing.seller_net_amount` for completed transactions. But the same edge function recomputes `seller_net = item_amount − min(platform_fee+processing_fee, 2000)` for the row display. The two formulas disagree:
- Pricing-table `seller_net_amount` for the 3 completed = ₦957,965 (shown rounded to ₦958.0K)
- Recomputed per-row caps fees at ₦2,000 → row shows e.g. `Net: ₦11,810` for SD-2026-000021 even though the underlying `seller_net_amount` is ₦12,095

Two different "net" definitions are leaking into the same screen. Per the **transaction-fee-model** memory the canonical fee model already lives in DB — there should be ONE source of truth.

**Fix:** Remove the recompute in `seller-transactions` (lines 227–229). Use `pricing.sellerNet` directly for the row's `seller_net`, and use `pricing.platform_fee_amount + pricing.processing_fee_amount` for `service_fee`. Drop the `Math.min(..., 2000)` cap entirely — the cap (if any) belongs in pricing computation, not in a read-side aggregator. Then `summary.total_earned` and per-row `seller_net` will reconcile.

### Bug T2 (HIGH) — Drafts appear in seller transactions list & dashboard recent activity

**Where:** screenshot row `SD-2026-000016` shows status **draft** in the seller transactions table; `seller-dashboard` recent_activity also surfaces it.
**Cause:** `seller-transactions` returns ALL statuses (no draft exclusion). Drafts are incomplete pre-share records with no buyer commitment — they pollute the list and make `summary.total = 18` while only 17 are real.
**Fix:**
- In `seller-transactions/index.ts`, when `statusFilter === "all"`, filter out `status='draft'` from `allRows` before pagination AND from `summary.total` / `summary.in_progress`. Drafts remain reachable via `?status_filter=draft` and the dedicated Drafts tab.
- In `seller-dashboard/index.ts` `recent_activity`, exclude `draft`.
- In `seller-dashboard/index.ts` metrics: `transactions_created_count` (currently 18) should be "shared transactions" → exclude drafts → 17.

### Bug T3 (MEDIUM) — "Active / In Progress" count includes pre-checkout drafts

**Where:** `seller-transactions/index.ts` lines 251–254. `activeStatuses` includes `awaiting_buyer` and `awaiting_payment`.
**Reality check:** `awaiting_buyer` = seller created and shared a link, buyer hasn't reviewed. `awaiting_payment` = buyer reviewed, payment not done. Counting them as "Active / In Progress" is debatable but the screenshot shows `ACTIVE 9` which equals `4 awaiting_buyer + 3 awaiting_payment + 2 seller_dispatched`. None of those have escrowed money yet for the first 7. Per the **state-machine** memory, "active fulfillment" should mean post-payment.
**Fix:** Split into two clearly-labeled cards:
- **Awaiting payment** = `awaiting_buyer + awaiting_payment` (currently `7`)
- **In fulfillment** = `payment_secured + seller_preparing_delivery + seller_dispatched + delivered_awaiting_verification` (currently `2`)

Update the Summary Cards section in `src/pages/SellerTransactions.tsx` (5 cards or replace the single "Active" card with these two).

### Bug T4 (MEDIUM) — Buyer name shown as "Unknown Buyer" when participant data exists

**Where:** screenshot SD-2026-000016 shows "Unknown Buyer" on dashboard recent activity, but on the transactions list the same row resolves correctly to "test / angeloakuhwa@gmail.com".
**Cause:** `seller-transactions/index.ts` already has the participant fallback (lines 134–183). `seller-dashboard/index.ts` `recent_activity` does NOT — it only joins `profiles` for non-null `buyer_id`.
**Fix:** Port the same participant fallback into `seller-dashboard/index.ts` recent_activity block: when `buyer_id` is null, look up `transaction_participants` (role='buyer') by `transaction_id` and use `display_name` / `email` / `phone` like seller-transactions does.

### Bug T5 (LOW) — Inconsistent buyer display (same person, different label)

**Reality:** Angelo Akuhwa appears as:
- "Angelo Akuhwa / 08137778295" on SD-2026-000007
- "test / angeloakuhwa@gmail.com" on SD-2026-000008/009/010
- "Angelo Akuhwa / angeloakuhwak@gmail.com" on SD-2026-000019/021 (registered profile)

This is data entry — seller typed `display_name="test"` when creating manual transactions. Not a code bug, but UX confusing.
**Fix (optional, not in this plan unless approved):** Add a "Resolve participant" step in `create-transaction` that, before insert, checks if `buyer_email` matches an existing profile and pre-fills `display_name` from `profiles.full_name`. For this plan, just call it out in the report as a UX recommendation; no code change.

### Bug T6 (LOW) — Rider link modal "BACKUP HANDOFF CODE: 129113" exposes OTP server-side

**Where:** screenshot of "Send link to your rider" dialog. The OTP `129113` is shown plainly.
**Reality check (per memory `phone-otp-security` and `delivery-token-system`):** OTPs are SHA-256 hashed in DB and only the seller can see the plaintext to share with the rider. This is **by design** — it's the seller's backup if the OTP-via-phone path fails. **Not a bug.** Just document it in the test report.

### Bug T7 (LOW) — Disputes mismatch in screenshot

Screenshot shows 2 disputed rows (SD-2026-000003, SD-2026-000004) — DB confirms 3 disputes total but only 2 transactions are in `disputed` state (the third dispute belongs to a transaction that was already resolved). This is correct.

## Files to change

1. **`supabase/functions/seller-transactions/index.ts`**
   - Lines 227–229: drop `serviceFee = Math.min(rawServiceFee, 2000)` and `sellerNet = pricing.amount - serviceFee`. Use `pricing.sellerNet` and full `rawServiceFee` directly.
   - Lines 71–77 & 257–262: filter out `status='draft'` from `allRows` when `statusFilter === 'all'`. Adjust `summary.total` and `summary.in_progress` accordingly.
   - Lines 251–254: replace single `activeStatuses` with two buckets `awaitingPaymentStatuses` and `inFulfillmentStatuses`. Return both counts in summary.

2. **`supabase/functions/seller-dashboard/index.ts`**
   - In `recent_activity` block (~lines around `recent_activity` mapping): exclude rows with `status='draft'`.
   - Same block: add `transaction_participants` fallback for null `buyer_id` (mirror the seller-transactions pattern).
   - `transactions_created_count`: exclude drafts (`!== 'draft'`).

3. **`src/services/seller-transactions.service.ts`**
   - Add `awaiting_payment_count: number` and `in_fulfillment_count: number` to `summary` interface. Keep `in_progress` for backward compatibility (sum of both) but mark as deprecated.

4. **`src/pages/SellerTransactions.tsx`** (lines 371–402)
   - Replace the "Active / In Progress" single card with two cards: "Awaiting Payment" and "In Fulfillment", driven by the new summary fields.
   - Or keep 4-card grid: All Time | Awaiting Payment | In Fulfillment | Revenue (drop Completed, since it's also visible on the dashboard).

5. **Re-deploy** edge functions: `seller-transactions`, `seller-dashboard`.

## Verification after fix (Chioma's data)

| Metric | Before | After |
|---|---|---|
| Transactions list `summary.total` | 18 | 17 (drafts hidden) |
| Transactions list `summary.in_progress` | 9 | replaced |
| New `summary.awaiting_payment_count` | — | 7 |
| New `summary.in_fulfillment_count` | — | 2 |
| `summary.total_earned` | ₦957,965 (shown 958K) | ₦957,965 — now matches per-row Net values |
| Per-row `Net` for SD-2026-000021 | ₦11,810 | ₦12,095 (= `seller_net_amount`) |
| Dashboard `recent_activity` SD-2026-000016 buyer | "Unknown Buyer" | "test / angeloakuhwa@gmail.com" |
| Dashboard `recent_activity` count | 6 (incl. draft) | 5 (no draft) or 6 if we backfill from non-drafts |
| Dashboard `transactions_created_count` | 18 | 17 |

## Risk
- All read-side aggregation tweaks. No schema migration. No state machine impact.
- Removing the `Math.min(rawServiceFee, 2000)` cap is the only behavioral change to a displayed number — it's a correctness fix because the cap was producing a fake `Net` that contradicted the canonical `seller_net_amount`.
- Drafts removed from default list are still accessible via the explicit `?status_filter=draft` filter and the existing draft-count quick action — no data lost.
- Backward-compatible: `summary.in_progress` is still emitted (sum of new buckets) so any other consumer doesn't break.

## Out of scope (noted but not changed)
- T5 buyer-display normalization at create-transaction time (UX, not data integrity).
- T6 rider OTP visibility — confirmed working as designed.
- Buyer dashboard parity — last audit confirmed it's already clean; will re-verify post-fix.

