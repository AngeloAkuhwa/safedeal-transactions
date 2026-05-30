## Re-scan results

The re-scan surfaced **one new critical (error-level) finding** plus the same 51 lower-severity Supabase linter warnings already triaged into security memory (SECURITY DEFINER helpers exposed to anon/authenticated, extensions in `public`, deny-by-default RLS tables with no policies).

### New critical finding

**Transaction parties can overwrite admin-controlled fields on `transactions`**

The `parties_update_transactions` RLS policy lets any buyer or seller `UPDATE` every column on their own transaction row. That includes fields that must only ever be written by edge functions running as `service_role`:

- `release_approved_by`, `release_approved_at` (self-approve a payout)
- `needs_admin_review`, `needs_release_review`, `admin_review_reason`, `release_review_reason` (suppress fraud flags)
- `status`, `money_status`, `dispute_status` (jump the state machine)

A malicious party with just the anon key + their own session could PATCH any of these via PostgREST.

### Codebase check

`rg` over `src/services/`, `src/pages/`, `src/components/`, `src/hooks/` finds **no client-side `.update()` or `.insert()` against the `transactions` table**. All transaction writes already flow through edge functions using `service_role`, which bypasses RLS. So the policy is unused by the app and safe to drop.

## Fix plan

Single migration:

1. `DROP POLICY parties_update_transactions ON public.transactions;`
   - Removes the only client-reachable UPDATE path on transactions.
   - Buyer/seller confirmations (`buyer_confirmed_at`, `seller_confirmed_at`, etc.) continue to be set by their existing edge functions (`transaction-verify`, etc.) — no app behavior changes.
2. Keep `parties_select_transactions`, `admins_select_all_transactions`, and `sellers_insert_transactions` as-is.
3. Update `security-memory` to record that direct client UPDATEs on `transactions` are forbidden — all state transitions must go through edge functions.
4. Mark the finding fixed via `manage_security_finding`.

## Remaining (already triaged, no action)

- `SECURITY DEFINER` helpers callable by anon/authenticated — required RLS primitives (`has_role`, `is_transaction_party`, …), each with internal access checks and a fixed `search_path`.
- Extensions in `public` schema — platform default, not relocating.
- `RLS enabled, no policy` on service-role-only tables — intentional deny-by-default to clients.

These will continue to surface in scans and stay ignored per the existing memory entries.

## Manual review areas the automated scanner does not cover

Worth a deeper human pass later (not part of this patch):

- Edge-function input validation (zod) on every PATCH/DELETE endpoint, especially admin-only ones.
- Storage bucket policies for Cloudinary signed URLs and any Supabase-hosted assets.
- Webhook signature verification on Paystack callbacks.
- Rate limiting on phone OTP, password reset, and message-send endpoints.
- IDOR checks: confirm every edge function that takes an `id` parameter re-verifies the caller is a party / admin before returning data.

Let me know if you want me to dig into any of those after the migration lands.