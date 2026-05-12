# Dispute Resolution — Final Adjustments Plan

This revision builds on the existing `resolve_dispute_atomic` implementation. It does **not** change the central release model (no Paystack calls happen at resolve time). It tightens the UI so what the admin sees matches what the backend stored, and it strengthens the partial and no-action outcomes.

---

## 1. Backend — RPC contract changes

### `resolve_dispute_atomic` (update)
Confirm and enforce:
- `release_funds_to_seller` and `dismissed_seller_favor` → `money_status = funds_pending_release` (NOT `funds_releasing`).
- No Paystack transfer is initiated. Only `release_review_queue` row is inserted with status `pending`.
- `partial_refund_release` → splits into `refund_pending` for refund portion + `release_review_queue` row for release portion. Money status reported as `refund_pending` while a `held_for_release` amount remains tracked on `escrow_states`.

### Return payload (new)
The RPC must return a structured object so the edge function and UI can render linked records without a second round-trip:

```json
{
  "outcome_type": "...",
  "dispute_outcome_id": "uuid",
  "money_status": "refund_pending | funds_pending_release | funds_held_in_escrow | funds_frozen",
  "refund_id": "uuid | null",
  "release_queue_id": "uuid | null",
  "ledger_entry_ids": ["uuid", ...],
  "remaining_held_amount": "numeric",
  "remaining_frozen_amount": "numeric",
  "refund_amount": "numeric",
  "release_amount": "numeric"
}
```

### `close_case_without_resolution`
- If `money_status = funds_frozen` at resolve time, RPC requires `acknowledge_frozen_funds = true` in payload, else raises `frozen_funds_acknowledgement_required`.
- Writes `dispute_outcomes` row with `refund_amount=0`, `release_amount=0`.
- Inserts a `transaction_events` entry `dispute_closed_no_action` with the residual money state captured in metadata for traceability.

---

## 2. Edge function — `admin-transaction-actions`

`resolve_dispute` case:
- Pass through new `acknowledge_frozen_funds` flag.
- Forward the RPC return payload to the client unchanged under `result`.
- After RPC, also append linked-record references to the response so `setReloadKey` is not the only refresh path:
  - `dispute_outcome_id`, `refund_id`, `release_queue_id`, `escrow_ledger_entry_ids`, `admin_action_id`, `timeline_event_id`.

---

## 3. Frontend — Display derivation

### New helper `src/lib/dispute-display-status.ts`
Single source of truth used by both admin and party UIs:

```text
deriveDisputeDisplay({ disputeStatus, outcome, moneyStatus, escrow }):
  if disputeStatus !== 'resolved' → return existing dispute badge logic
  switch outcome.outcome_type:
    release_funds_to_seller, dismissed_seller_favor →
      { label: 'Awaiting Release', tone: 'info', moneyStatus: 'funds_pending_release' }
    refund_buyer, dismissed_buyer_favor →
      { label: 'Refund Pending', tone: 'warning', moneyStatus: 'refund_pending' }
    partial_refund_release →
      { label: 'Partially Resolved', tone: 'info',
        parts: [
          { label: 'Refund Pending', amount: outcome.refund_amount },
          { label: 'Release Pending', amount: outcome.release_amount }
        ] }
    close_case_without_resolution →
      if escrow.frozenAmount > 0 → { label: 'Manual Action Required', tone: 'danger' }
      else if moneyStatus === 'funds_pending_release' → { label: 'Awaiting Release', tone: 'info' }
      else → { label: 'Funds Held in Escrow', tone: 'info' }
```

Key rule: **never show "In Dispute" once `disputes.status = resolved`** — derive purely from outcome + money/escrow.

### `AdminTransactionDetail.tsx`
- Replace any "In Dispute" badge fallback with `deriveDisputeDisplay`.
- For `partial_refund_release`, render a two-row breakdown card:
  - Refund: amount + refund record status (from `refunds` table via linked records)
  - Release: amount + queue status (from `release_review_queue`)
  - Remaining escrow balance (held + frozen) shown as a third line if `> 0`.
- Linked Records panel must include, when present:
  - Dispute Outcome
  - Refund Record
  - Release Queue Record
  - Escrow Ledger (latest dispute-related entries)
  - Admin Action
  - Timeline Event

### `ResolveDisputeDialog.tsx`
- For `close_case_without_resolution`, always show:
  > Closing without resolution will not move money. If funds are frozen or held, another admin action may still be required.
- If current `money_status === 'funds_frozen'`, require a mandatory checkbox:
  > I understand funds will remain frozen until another admin action is taken.
  Submit button disabled until checked. Pass `acknowledge_frozen_funds: true` to the action.
- For `partial_refund_release`, validate `refund_amount + release_amount ≤ held + frozen` and show the split inline before submit. Both amounts NGN, 2dp.

### Party-facing UI (buyer + seller)
- `DisputeMoneyStatusBadge` / `DisputeStatusBadge`: route through `deriveDisputeDisplay` so resolved disputes never render "In Dispute".
- `DisputeResolutionSection`: add `partial_refund_release`, `dismissed_seller_favor`, `dismissed_buyer_favor` label entries.

---

## 4. Tests — display + amount rules

Add `src/lib/__tests__/dispute-display-status.test.ts` covering:
- seller-favor outcome → "Awaiting Release"
- buyer-favor outcome → "Refund Pending"
- partial outcome → "Partially Resolved" with two amount rows
- no-action + `funds_frozen` → "Manual Action Required"
- no-action + `funds_held_in_escrow` → "Funds Held in Escrow"
- resolved dispute never returns "In Dispute"
- all money values formatted via `formatMoney(..., 'NGN')` with exactly 2 decimals (e.g. `₦1,500.00`)

Optional: a small RPC contract test (Deno) asserting the new return payload shape for each outcome.

---

## 5. Files to change

- `supabase/migrations/<ts>_resolve_dispute_display_contract.sql` — update `resolve_dispute_atomic` to return structured JSON, enforce frozen-funds ack, ensure `funds_pending_release` for seller-favor.
- `supabase/functions/admin-transaction-actions/index.ts` — pass-through new flag and return payload.
- `src/services/admin-transaction-actions.service.ts` — extend `ResolveDisputePayload` with `acknowledge_frozen_funds`; type the return payload.
- `src/lib/dispute-display-status.ts` — new helper.
- `src/lib/__tests__/dispute-display-status.test.ts` — new tests.
- `src/components/admin/transactions/ResolveDisputeDialog.tsx` — warning, ack checkbox, partial split validation.
- `src/pages/AdminTransactionDetail.tsx` — use helper, render partial breakdown, expanded Linked Records.
- `src/components/disputes/DisputeMoneyStatusBadge.tsx`, `DisputeStatusBadge.tsx`, `DisputeResolutionSection.tsx` — route through helper, add new outcome labels.

---

## Acceptance

- Seller-favor and dismissed-seller-favor land in `funds_pending_release` only; central release flow remains the sole payout path.
- Partial outcomes display refund + release amounts, statuses, and remaining escrow.
- Closing without resolution warns clearly and blocks on frozen-funds acknowledgement.
- No UI surface shows "In Dispute" once the dispute is resolved.
- Linked Records panel exposes all six artifacts when applicable.
- All amounts render NGN with 2 decimals; tests cover each display branch.
