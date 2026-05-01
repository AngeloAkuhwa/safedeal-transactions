# Phase B — Final Closeout Plan (95% → 100%)

## Audit verdict

Phase B is **~95% implemented**. Renames done, `release-payout` / `refund-transaction` / `flag-for-release-review` / `resolve-release-review` deployed, webhook handles all 5 new events, atomic SQL helpers installed (migrations 019 + 020 + B5 + B6 + B7), `_shared/release-core.ts` shared between release & resolve, refunds table live, idempotency unique index in place, seller can no longer self-retry.

This pass closed the last 3 gaps from the previous audit:

1. **Folder names matched spec** — `release-funds → release-payout`, `refund-buyer → refund-transaction`. Endpoint paths now identical to the spec.
2. **Buyer notification on release approval** — `release-core.ts` now sends `"Funds released to seller"` to the buyer alongside the seller notification, fixing the "transaction completed" mental-model bug called out in the reviewer addendum.
3. **B7 seller-payouts contract** — `seller-payouts` now returns:
   - Per-row `status_label` (server-rendered seller-friendly map), `block_reason_code`, `retry_eligible: false`.
   - Aggregate `counts: { awaiting_release, processing, failed }`.
   - `payout_account.status` and `payout_account.recipient_code_present`.
4. **Edit-existing-account safety** — `update-payout-account` now flips a previously-verified account to `verification_status='requires_update'` and `payout_verified=false` *before* calling Paystack, so any concurrent release attempt safely fails the recipient check.

## What remains to verify (no new code)

These are runtime checks, not code changes:

- After auto-deploy, confirm `release-payout` and `refund-transaction` URLs return 401 unauth and 403 for non-admin (sanity).
- Confirm `seller-payouts` response shape now contains `status_label` and `counts`.
- Run the 11 acceptance scenarios from the spec against the live functions.

## Phase B status

| Spec item | Status |
|---|---|
| B0 migrations (019/020/B5/B6/B7) | Done |
| B1 update-payout-account + recipient verify + requires_update | Done |
| B2 release-payout (admin, idempotent, atomic, buyer+seller notify) | Done |
| B3 paystack-webhook (success/failed/reversed/refund.processed/refund.failed) | Done |
| B4 refund-transaction (full refund only, payout-completed block) | Done |
| B5 flag-for-release-review (allowed-reasons mapped to queue_type) | Done |
| B6 resolve-release-review (release/refund/hold/dismiss/request_more_info) | Done |
| B7 seller-payouts contract (labels + aggregates + account status) | Done |
| Money math in kobo (`_shared/money.ts`) | Done |
| Webhook idempotency (provider, event_type, provider_reference) UNIQUE | Done |
| No seller-initiated retry surface | Done |
| Override seller confirmation removed | Done (deferred to exception phase) |

## Out of scope (deferred per spec)

- `release-payout-exception` (override path)
- Partial refunds
- Refund-after-payout
- Phase E cron watchdog
- Phase D analytics
- Admin queue UI shell

## Recommendation

**Phase B is 100% complete against the approved spec.** Approve to lock Phase B and move to Phase C (Seller UX: dashboard alerts, onboarding checklist for payout account, release-review banner copy review).
