# Phase R — Payout Verification Single Source of Truth

## The bug you spotted

The **Seller Dashboard** says "Verify your payout account" while the **Seller Profile** shows "Payout Verified ✓". Both are reading different fields, and one of them is wrong.

### Verified against your live DB

For the seller `a1b2c3d4-...0002`:

| Field | Value | Used by |
|---|---|---|
| `payout_accounts.verification_status` | `verified` | Profile |
| `payout_accounts.provider_recipient_code` | **NULL** | Dashboard |
| `account_verifications.payout_verified` | `true` | Profile badge |

The dashboard is **technically right**: without a Paystack `provider_recipient_code`, SafeDeal physically cannot transfer money to the seller's bank — so payout is not truly verified. The profile and `account_verifications.payout_verified` flag are showing a stale/optimistic value that doesn't reflect payout readiness.

This means a seller could happily keep selling, then have payouts silently fail at release time. That is exactly the kind of production gap your audit is asking us to close.

## Fix strategy — one definition, applied everywhere

Define payout readiness in **one place** and reuse it:

```text
payout_ready = (
  payout_accounts row exists
  AND verification_status = 'verified'
  AND provider_recipient_code IS NOT NULL
)
```

### R1. Backend — fix `seller-profile` edge function

In `supabase/functions/seller-profile/index.ts`:

- Also select `provider_recipient_code` from `payout_accounts`.
- Compute `payout_ready` using the formula above.
- **Override** `verification.payout_verified` with the computed `payout_ready` (do not trust the cached `account_verifications.payout_verified` flag for this surface).
- Add `payout_ready: boolean` and `payout_blocker_reason: 'missing' | 'unverified' | 'no_recipient_code' | null` to the response so the UI can show specific guidance.

### R2. Backend — `seller-dashboard` already correct

`seller-dashboard/index.ts` line 136 already uses the strict definition. Leave logic as-is, but rename the emitted field to `payout_ready` (keep `payout_account_verified` as alias for one release) so terminology is uniform.

### R3. Service layer

- `src/services/seller-profile.service.ts`: extend `PayoutAccountSummary` and `SellerVerification` with `payout_ready` + `payout_blocker_reason`.
- `src/services/seller-dashboard.service.ts`: expose `payout_ready` alongside existing flag.

### R4. UI — Profile (`SellerProfileSettings.tsx` / `VerificationSidebar.tsx` / `SellerVerificationSection.tsx`)

- The "Payout Account" verification row must read `payout_ready`, not `payout_verified`.
- When `verification_status = 'verified'` but `provider_recipient_code` is missing, show an amber "Action needed — finish bank setup" state with a CTA pointing to the payout setup flow (instead of a green check).
- Microcopy: "Bank verified. We're finalising the secure payout link with your bank — complete this to receive payouts."

### R5. UI — Dashboard alert (`alertConfig.ts`, `ReleaseReviewBanner.tsx`)

- Use the new `payout_blocker_reason` to show the right message:
  - `missing` → "Add a payout bank account"
  - `unverified` → "Verify your payout bank account"
  - `no_recipient_code` → "Finish linking your bank with our payment processor" + Retry button (calls existing `payout-account-link` function, if present, else falls back to re-running verification).

### R6. UI — Payouts page (`SellerPayouts.tsx`)

- Same readiness check before allowing manual payout actions.
- Banner at top when not `payout_ready`, blocking confusion about why funds aren't moving.

### R7. Self-healing — backfill `provider_recipient_code`

Add a small "Retry payout link" action in profile + dashboard that calls a new edge function `seller-payout-relink`:

- Re-runs Paystack `transferrecipient` create using the stored bank details.
- Writes `provider_recipient_code` back to `payout_accounts`.
- Sets `account_verifications.payout_verified = (verification_status='verified' AND recipient_code IS NOT NULL)` so the cached flag is also corrected going forward.

This means existing affected sellers (like the demo seller in your DB) can self-recover with one click instead of being permanently stuck.

### R8. DB trigger — keep cached flag honest

Add a trigger on `payout_accounts` (AFTER INSERT/UPDATE) that recomputes `account_verifications.payout_verified` from the strict definition, so the two never drift again.

```sql
-- pseudo
CREATE FUNCTION sync_payout_verified() ...
  payout_verified := NEW.verification_status='verified' AND NEW.provider_recipient_code IS NOT NULL
```

## Acceptance criteria

1. Seller Profile and Seller Dashboard show the **same** payout status for the same account, always.
2. A seller whose bank is verified by Paystack but missing a `provider_recipient_code` sees a clear "finish linking" prompt on both surfaces, with a working retry button.
3. After the retry succeeds, both surfaces flip to "Verified" without a manual refresh of cached flags.
4. The `seller-payouts` page blocks payout-dependent actions whenever `payout_ready` is false, with a single consistent banner.
5. `account_verifications.payout_verified` automatically tracks the strict definition via DB trigger — no future drift possible.
6. Existing demo seller (`...0002`) recovers via the new "Retry payout link" action.

## Files touched

- `supabase/functions/seller-profile/index.ts` (compute + emit `payout_ready`)
- `supabase/functions/seller-dashboard/index.ts` (rename for consistency)
- `supabase/functions/seller-payout-relink/index.ts` (new)
- `supabase/migrations/<new>_payout_verified_sync.sql` (trigger + one-time backfill)
- `src/services/seller-profile.service.ts`
- `src/services/seller-dashboard.service.ts`
- `src/pages/SellerProfileSettings.tsx`
- `src/components/seller/VerificationSidebar.tsx`
- `src/components/seller/SellerVerificationSection.tsx`
- `src/components/seller/alertConfig.ts`
- `src/components/seller/ReleaseReviewBanner.tsx`
- `src/pages/SellerPayouts.tsx`

## Out of scope (deliberately)

- Buyer side payout displays (none exist — payouts are seller-only).
- Re-architecting `account_verifications`; we keep the flag but make it derived/synced rather than independently writable for payouts.
- A broader rerun of the full Phase Q audit — that already passed; this is a targeted fix for the specific drift you identified.

Approve this and I'll switch to build mode and implement R1–R8 in order.
