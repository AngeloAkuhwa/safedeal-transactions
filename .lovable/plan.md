

# Fix Verification Window to Use Actual Seller-Defined Hours

## Problem
The countdown timer correctly uses `verification_deadline_at` from the database, but the AutoReleaseWarning progress bar and all text labels hardcode "72 hours". The actual verification window is stored in `transaction_delivery_terms.verification_window_hours` and could be any value the seller set.

## Solution

### 1. Edge function: return `verification_window_hours`
**File:** `supabase/functions/transaction-verify/index.ts`

Add a query for `transaction_delivery_terms` in the parallel reads (already fetching other 1:1 tables), and include `verification_window_hours` in the response under a new `delivery_terms` field (or derive the window hours from `delivered_at` and `verification_deadline_at`).

**Simpler approach:** Since we already have `delivered_at` and `verification_deadline_at`, we can compute the window on the frontend without an extra DB query:
```
windowHours = (deadline - delivered) / 3_600_000
```

### 2. AutoReleaseWarning: use computed window
**File:** `src/components/verification/AutoReleaseWarning.tsx`

- Accept a new `windowHours` prop (or `deliveredAt` to compute it)
- Replace hardcoded `72 * 3_600_000` with `windowHours * 3_600_000` for progress bar calculation
- Replace "72-hour" text with the actual value

### 3. Update hardcoded "72 hours" text across components
**Files:**
- `src/pages/BuyerTransactionVerify.tsx` — trust banner and notification alert text
- `src/components/verification/WhatHappensCard.tsx` — "72-hour verification window" text
- `src/components/verification/AutoReleaseWarning.tsx` — description text

Pass the computed `windowHours` as a prop to these components and interpolate it into the text.

### 4. Compute window hours in BuyerTransactionVerify.tsx
```ts
const windowHours = transaction.delivered_at && transaction.verification_deadline_at
  ? Math.round((new Date(transaction.verification_deadline_at).getTime() - new Date(transaction.delivered_at).getTime()) / 3_600_000)
  : 72; // fallback
```

Then pass `windowHours` to `AutoReleaseWarning`, `WhatHappensCard`, trust banner, and notification alert.

## Files to Edit
| File | Change |
|------|--------|
| `src/pages/BuyerTransactionVerify.tsx` | Compute `windowHours`, pass as prop, update inline text |
| `src/components/verification/AutoReleaseWarning.tsx` | Accept `windowHours` prop, fix progress bar calc + text |
| `src/components/verification/WhatHappensCard.tsx` | Accept `windowHours` prop, update text |
| `src/components/verification/VerificationCountdown.tsx` | No change needed (already uses `deadlineAt`) |

