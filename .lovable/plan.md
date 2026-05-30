## Goal

Finish the post-resolution state cleanup on Admin Dispute Detail + Admin Transaction Detail, and fix the new issues visible in the screenshots: misleading "High Risk" banner, stale `manual_hold` flag, `Dispute: Resolved` rendered as a red risk chip, wrong `Awaiting Release` amount, and inconsistent header math/CTAs.

Do not build the payout screen. Do not call Paystack transfer. Only fix what the user asked for.

---

## A. Issues visible in the screenshots

Transaction shown: SD-2026-000003. Dispute resolved, outcome = `release_funds_to_seller`. Money status = `funds_pending_release`. Escrow no longer frozen.

1. **Red "High Risk Transaction — Investigate" banner is still loud** even though there is no active blocker. Active state for this row is only `needs_release_review` (seller-won, awaiting payout). It should not look like a fraud/risk emergency.
2. **`manual_hold` chip** appears as a red risk flag. After resolution this is no longer an active hold — it is historical. Either drop it or recolor as neutral.
3. **`Dispute: Resolved` rendered as a red risk chip.** Resolved is a positive terminal state; it must never appear in the active risk-flag list. It already lives in the dispute status badge + timeline.
4. **`High-value transaction` styled red.** This is informational, not high-risk; should be a neutral/info chip.
5. **"Open Investigation" CTA** is shown even though all investigations on this case are resolved/dismissed per the timeline. After resolution this button should only appear if no active investigation exists AND the dispute is not resolved, or be relabeled "Reopen Investigation" with a confirm dialog.
6. **"Manage Dispute" CTA (orange)** duplicates the header `View Dispute` action and reads as if the case is still actionable. After resolution it should be `View Dispute` (neutral), opening the read-only dispute detail.
7. **Header `Awaiting Release` = ₦676,000 is wrong.** Awaiting Release is the seller payout amount = `item_total` (i.e. `₦650,000`), not the buyer's `total_charged`. Protection fee is SafeDeal revenue, never paid to seller.
8. **Total Charged math (₦650,000 + ₦16,250 ≠ ₦676,000)** is off by ₦9,750. Either a hidden delivery fee is rolled in or pricing is double-counting. The header must show a breakdown that reconciles: `Item Total + Protection Fee (+ Delivery Fee if any) = Total Charged`.
9. **Payout Status pill is empty (`—`).** After a seller-won resolution it should show `Pending Release` (linked to release-review queue) with timestamp.

---

## B. Remaining work from the previous plan (items 1–6)

10. **Dispute Detail sidebar — full post-resolution mode.**  When `active.isDisputeResolved`, also disable:
    - `Mark High Risk`, `Mark Fraud Watch`
    - `Move to Under Review`, `Escalate Further`, `Request More Evidence`
    - `Open Investigation`
    Keep enabled: `Add Internal Note`, `View Linked Transaction`, `View Payment / Escrow / Payout Record` (when wired), `Print`, `Export`.

11. **Real Resolution Summary panel** (replaces the current buyer/seller party cards block titled "Resolution Summary"):
    - Status: Resolved (green chip)
    - Outcome: `refund_buyer | release_funds_to_seller | partial_refund_release | close_case_without_resolution`
    - Decision summary text
    - Resolved by + Resolved at
    - Next-action chip via `nextActionLabelFor(outcome)` (already exists in `src/lib/admin-active-state.ts`)
    Buyer/Seller cards move below as "Case Parties Summary".

12. **Transaction Detail header status fallback.** When `active.isDisputeResolved`, header status pill must show the underlying `transactions.status` (`Resolved`, `Pending Release`, `Completed`, etc.) instead of "Disputed" / "In Dispute".

13. **`needs_admin_review` server-side recompute.** Migration adding `public.recompute_needs_admin_review(tx_id uuid)` that sets the column to:
    ```
    EXISTS active_dispute
    OR EXISTS active_investigation
    OR money_status = 'funds_frozen'
    OR EXISTS unresolved release-review entry
    OR risk_level IN ('high','critical') AND not_acknowledged
    ```
    Called at the end of every admin RPC: `resolve_dispute`, `freeze`/`unfreeze`, `upsert_investigation`, `flag_for_review`.

14. **Refresh after every admin action.** In `AdminDisputeDetail` and `AdminTransactionDetail`, every action handler must `await refetch()` before re-enabling the button. Currently only some do.

---

## C. Implementation details

### 1. `src/pages/AdminTransactionDetail.tsx` — header & risk banner

- Replace the single `accent="red"` banner with a two-tier banner:
  - `red` only if `active.isFrozen` or `active.isInvestigationActive` or risk level `critical`.
  - `amber` if `active.needsReleaseReview` only (banner title "Pending release review", neutral icon, no "Investigate" CTA — link to release-review queue instead).
  - hidden otherwise.
- "Investigate" CTA shown only when `active.isInvestigationActive || risk.level === 'high' || risk.level === 'critical'`. Otherwise hide.
- Header KPI strip: rename `AWAITING RELEASE` → keep the label but bind value to `pricing.itemTotal` (seller payout), not `pricing.buyerTotal`. Source from existing `data.pricing.sellerPayoutAmount` if present; fall back to `data.escrow.heldAmount` minus `protectionFee`.
- Add a `DELIVERY FEE` cell only when `pricing.deliveryFee > 0`, so `Item + Protection + Delivery = Total Charged` reconciles. If `Total Charged` still disagrees with the sum, show the breakdown tooltip with the raw fields.
- Payout Status pill: read from `data.payout?.status`. When null and `active.needsReleaseReview`, render `Pending Release`. When `data.payout?.releasedAt` exists, render `Released · <date>`.
- "Manage Dispute" CTA: when `active.isDisputeResolved`, swap label to `View Dispute` and use neutral variant.

### 2. `src/pages/AdminTransactionDetail.tsx` — Risk & Investigation card

- Stop rendering `Dispute: Resolved` in the risk-flag pill list. Filter out any flag whose label starts with `Dispute:` if `active.isDisputeResolved`.
- `manual_hold` chip: keep only if release-review entry is still open. Otherwise hide.
- Tone map for flag chips:
  - `funds_frozen`, `dispute_open`, `dispute_overdue`, `fraud_watch`, `investigation_open`, `risk:high|critical` → red
  - `manual_hold` (when active), `dispute_escalated` (when active) → orange
  - `high_value`, `repeat_buyer`, informational → neutral/slate
- Rename "Escalation History" → "Admin Action History" (it already contains freeze/unfreeze/escalate rows).
- "High Risk Transaction" header chip only when `risk.level === 'high' || 'critical'` AND there is at least one active blocker; otherwise render `Risk Review` neutral.

### 3. `src/pages/AdminDisputeDetail.tsx`

- Extend `isResolved` gating to all destructive/state-changing sidebar buttons listed in B.10.
- Build the real `ResolutionSummary` block as described in B.11, placed at the top of the right sidebar when `active.isDisputeResolved`. Move the existing buyer/seller party cards into a separate `CaseParties` block below.
- Header status pill uses `DisputeStatusBadge` derived label; on resolved cases also render `Resolved · <fmtDate(resolvedAt)>`.
- Every action handler: `await refetch()` before clearing local pending state.

### 4. `src/lib/admin-active-state.ts`

- Add helper `riskBannerTone(active, riskLevel)` returning `'red' | 'amber' | 'none'` per the rules in C.1, so both pages share the same banner logic.
- Add helper `visibleRiskFlags(rawFlags, active)` that filters out historical flags (`Dispute: Resolved`, dismissed-investigation, stale `manual_hold`).

### 5. New migration — `recompute_needs_admin_review`

```sql
CREATE OR REPLACE FUNCTION public.recompute_needs_admin_review(p_tx_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_active boolean;
BEGIN
  SELECT
       EXISTS (SELECT 1 FROM disputes
               WHERE transaction_id = p_tx_id
                 AND status IN ('open','seller_response_pending','under_review','escalated'))
    OR EXISTS (SELECT 1 FROM investigations
               WHERE transaction_id = p_tx_id
                 AND status IN ('open','in_progress','investigating'))
    OR EXISTS (SELECT 1 FROM transactions
               WHERE id = p_tx_id AND money_status = 'funds_frozen')
    OR EXISTS (SELECT 1 FROM release_review_queue
               WHERE transaction_id = p_tx_id AND status = 'open')
  INTO v_active;
  UPDATE transactions SET needs_admin_review = v_active WHERE id = p_tx_id;
END $$;

GRANT EXECUTE ON FUNCTION public.recompute_needs_admin_review(uuid) TO service_role;
```
Then call `PERFORM public.recompute_needs_admin_review(tx_id);` at the end of:
- `resolve_dispute_v1`
- `admin_freeze_transaction` / `admin_unfreeze_transaction`
- `upsert_investigation`
- `flag_for_review`

### 6. Edge function `admin-transaction-detail`

- Ensure response includes `payout.status`, `payout.releasedAt`, `pricing.sellerPayoutAmount`, `pricing.deliveryFee`, and `investigations[]` (latest 5). These drive C.1 + C.2 — if any are missing today, add them.

---

## Files

Edit:
- `src/pages/AdminTransactionDetail.tsx`
- `src/pages/AdminDisputeDetail.tsx`
- `src/lib/admin-active-state.ts`
- `src/services/admin-transaction-detail.service.ts` (typing)
- `supabase/functions/admin-transaction-detail/index.ts` (extra fields if missing)
- `supabase/functions/admin-transaction-actions/index.ts` (call recompute at end of each action)

New:
- One migration: `recompute_needs_admin_review` function

Not in this pass:
- No payout screen
- No Paystack transfer
- No unrelated redesigns

---

## Acceptance

- Resolved dispute with `funds_pending_release`: header shows amber "Pending release review" (not red "High Risk"); no "Investigate" CTA; `Manage Dispute` becomes `View Dispute`; risk flag list excludes `Dispute: Resolved` and stale `manual_hold`; `Awaiting Release` equals seller payout (item total), not buyer total; `Total Charged` reconciles with displayed line items.
- Resolved dispute sidebar shows Resolution Summary (status/outcome/decision/resolved-by/next-action) and disables all state-changing buttons.
- `needs_admin_review` flips false automatically once all active blockers clear.
- Every admin action triggers refetch before re-enabling its button.
- Transaction list, transaction detail, dispute queue, and dispute detail stay consistent.
