

# Combined Implementation: Corrected State Machine + Locked Agreement Screen

This plan covers two items: (1) fixing the state machine transition maps, and (2) building the full Locked Agreement screen so the "View Agreement" button works.

---

## Part 1: Corrected State Machine

### Database Migration

Add `resolved` and `refunded` to the `transaction_status` enum, then replace both validation functions with corrected maps:

**Transaction transitions:**
- `disputed` → `resolved` only (no jumping back to verification or directly to completed)
- `resolved` → `completed`, `refunded` (new terminal paths)
- `refunded` → terminal

**Money transitions:**
- Remove `funds_released` from `funds_held_in_escrow` allowed targets (must go through `funds_releasing`)
- Remove `funds_held_in_escrow` from `funds_frozen` allowed targets (frozen funds never return to escrow)
- Add `funds_releasing` to `funds_frozen` targets (dispute resolved in seller's favor)

### Edge Function Update

Update `confirmReceipt` in `transaction-verify/index.ts` to do a two-step money transition: first `funds_held_in_escrow → funds_releasing`, then `funds_releasing → funds_released`.

---

## Part 2: Locked Agreement Screen

### New Edge Function: `transaction-agreement`

**File:** `supabase/functions/transaction-agreement/index.ts`

- Auth: manual JWT validation (same pattern as `transaction-verify`)
- Validates caller is buyer or seller of the transaction
- Reads from: `transactions`, `transaction_agreement_snapshots`, `transaction_items`, `transaction_pricing`, `transaction_delivery_terms`, `profiles` (seller), `escrow_states`
- Returns: transaction info, agreement snapshot + locked_at, item details, payment details, delivery terms, seller info, escrow state
- Config: add `[functions.transaction-agreement]` with `verify_jwt = false` to `supabase/config.toml`

### Service Layer

**File:** `src/services/agreement.service.ts`

- `getAgreementData(transactionId)` — invokes the edge function
- TypeScript interface `AgreementData`

### Page Component

**File:** `src/pages/BuyerTransactionAgreement.tsx`

Translates the uploaded HTML into React, using existing design system (shadcn/ui, Tailwind, lucide-react icons). Sections:

1. **Hero** — Green gradient, pulsing lock icon, "Agreement Locked Successfully", "Payment Confirmed" badge, anti-fraud protection card
2. **Locked Agreement Snapshot** — Dark header with lock + transaction code + fingerprint. 2x2 grid: Item Details (LOCKED), Product Images (LOCKED), Payment Details (LOCKED), Delivery Terms (LOCKED)
3. **Immutability Explanation** — Blue/primary gradient card with "Cannot Be Changed" and "Protection Activated" columns
4. **Next Steps** — 3-step icons (Seller Processing, In Transit, Verify & Confirm), notification list, CTA buttons (View Transaction Tracking, Return to Dashboard, Back to Verification)
5. **Trust Indicators** — 3-card row (Payment Secured, Agreement Locked, Dispute Ready)

Uses `BuyerNav` and `Footer`.

### Sub-components (in `src/components/agreement/`)

- `AgreementHero.tsx`
- `LockedSnapshotCard.tsx`
- `ImmutabilityExplanation.tsx`
- `AgreementNextSteps.tsx`
- `AgreementTrustIndicators.tsx`

### Route

**File:** `src/App.tsx`

Add under buyer-protected routes:
```
/dashboard/transactions/:transactionId/agreement → BuyerTransactionAgreement
```

### Wire "View Agreement" Button

**File:** `src/components/verification/VerificationSidebar.tsx`

Change the plain `<Button>` at line 73 to a `<Link>` wrapping a button that navigates to `/dashboard/transactions/${transaction.id}/agreement`.

---

## Files Summary

| File | Action |
|------|--------|
| `supabase/migrations/` | New migration: add enum values + replace validation functions |
| `src/db/migrations/014_corrected_state_machine.sql` | Mirror |
| `supabase/functions/transaction-verify/index.ts` | Two-step money transition in confirmReceipt |
| `supabase/functions/transaction-agreement/index.ts` | New edge function |
| `supabase/config.toml` | Add function config (auto-managed, noted for reference) |
| `src/services/agreement.service.ts` | New service |
| `src/pages/BuyerTransactionAgreement.tsx` | New page |
| `src/components/agreement/AgreementHero.tsx` | New component |
| `src/components/agreement/LockedSnapshotCard.tsx` | New component |
| `src/components/agreement/ImmutabilityExplanation.tsx` | New component |
| `src/components/agreement/AgreementNextSteps.tsx` | New component |
| `src/components/agreement/AgreementTrustIndicators.tsx` | New component |
| `src/App.tsx` | Add agreement route |
| `src/components/verification/VerificationSidebar.tsx` | Wire View Agreement navigation |

