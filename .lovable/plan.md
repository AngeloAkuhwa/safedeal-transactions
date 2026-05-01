## Phase B audit — final verdict

**Phase B is ~99% complete.** Re-audited every Phase B function against the live DB schema. All 5 previously identified bugs and both polish gaps from the prior round were fixed and are correctly deployed:

- `_shared/release-core.ts` — uses `actor_role` + `event_data` on `transaction_events`; refund amount derived from `payments.amount`. ✅
- `paystack-webhook/index.ts` — `charge.success` insert uses `event_data` JSONB. ✅
- `flag-for-release-review/index.ts` — full 12-value `ReasonEnum` + optional `severity`. ✅
- `resolve-release-review/index.ts` — no more `case_reviews` writes; `hold` calls `freeze_funds_atomic` via RPC. ✅
- Migration `20260501223810_*.sql` — `freeze_funds_atomic` SQL helper present + `flag_for_release_review` extended with new reason mappings. ✅
- Idempotency, `release-payout` short-circuit, `seller-payouts` extended contract, `update-payout-account` re-edit downgrade — all verified. ✅

### One remaining bug

**`retry-payout/index.ts` lines 155–161 still use the broken `description`/`metadata` shape on `transaction_events`.** This call was missed in the previous fix batch (only `release-core.ts` and `paystack-webhook` were patched). After Paystack accepts a retry transfer, the audit insert will 400 silently — the response still returns 200 to the admin, but the audit row is lost.

```ts
// CURRENT (broken)
await admin.from("transaction_events").insert({
  transaction_id: tx.id,
  event_type: "payout_released",
  actor_user_id: ctx.userId,
  description: `SafeDeal retry ${attempt} ...`,   // ← column does not exist
  metadata: { payout_id, reference, ... },         // ← column does not exist
});
```

### Fix plan (one tiny edge function patch)

**File:** `supabase/functions/retry-payout/index.ts` (lines 155–161)

Rewrite the insert to match the actual table shape:

```ts
await admin.from("transaction_events").insert({
  transaction_id: tx.id,
  event_type: "payout_released",
  actor_user_id: ctx.userId,
  actor_role: "admin",
  event_data: {
    description: `SafeDeal retry ${attempt} initiated payout transfer of ${tx.currency_code} ${Number(payout.amount).toLocaleString()}`,
    payout_id: payout.id,
    reference,
    transfer_code: transferCode,
    status: providerStatus,
    attempt,
  },
});
```

No migration, no contract changes, no other files touched.

### Verification after deploy

1. Curl `retry-payout` against a seeded `failed` payout with a valid recipient → expect `200 ok` AND a fresh `transaction_events` row with `event_type='payout_released'` and the `attempt` key in `event_data`.
2. Re-confirm Phase B acceptance suite still green.

After this one-line fix, Phase B is **100% complete** and we can move to Phase C.