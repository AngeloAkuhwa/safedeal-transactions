## Goal
Seed one **failed** payout row so the existing failed-status UI (red icon, "Bank account blocked"-style caption, Retry+Details+⋮ actions, status-aware dropdown) can be exercised end-to-end against real data.

## Approach
Insert a single row into `public.payouts` via `supabase--insert`. No schema change, no service change, no UI change.

## Row to insert
- `transaction_id`: `41883d50-fcb5-4173-ab1e-66fdb7d98716` (SD-2026-000023, seller already has other payouts; this transaction is `payment_secured` and not yet linked to a payout, so the FK + uniqueness work).
- `seller_id`: `a1b2c3d4-0002-4000-8000-000000000002` (same Chioma Okafor seller used by the existing rows).
- `amount`: copy `item_amount` from `transaction_pricing` for that tx (fallback `25000.00` if no pricing row).
- `currency_code`: `NGN`.
- `status`: `failed`.
- `failure_reason`: `Bank account blocked by provider`.
- `failed_at`: `now() - interval '2 hours'`.
- `failed_attempt_count`: `2`.
- `retry_allowed`: `true` (so the Retry CTA + status-aware dropdown render).
- `last_release_error`: `Paystack: account_blocked`.
- `last_release_attempt_at`: `now() - interval '2 hours'`.
- `release_blocked`: `false` (we want the Failed branch, not the Blocked branch).
- `initiated_at`: `now() - interval '3 hours'`.
- `created_at`: `now() - interval '3 hours'` (so it sorts naturally and the relative time reads "2 hours ago" / "3 hours ago").

## Verification after insert
1. Run a `SELECT id, status, failure_reason, retry_allowed FROM payouts WHERE status='failed';` to confirm the row exists.
2. In the Admin → Payouts tab, switch to the **Failed** filter and confirm:
   - Red triangle icon in the Payout ID cell
   - Red "Bank account blocked by provider" caption under the friendly `PAY-YYYY-XXXXXX` id
   - `[Retry] [Details] [⋮]` action row
   - ⋮ dropdown shows the Failed-status menu (View Failure Details, Update Bank Account, Seller Profile, Transaction, Add Internal Note, Block Payout)

## Out of scope
- UI styling for Failed rows is already implemented from earlier turns; if anything looks off after the row is visible, treat it as a separate follow-up.
- No migration, no edge function, no service change.

## Files / data touched
- Data: one INSERT into `public.payouts`.
- No code files.
