

# Fix: Use Valid Test Email for Paystack Fallback

## Problem
The fallback email `customer-{userId}@safedeal.ng` is not a real email address that Paystack recognizes. Paystack validates emails and rejects non-deliverable domains.

## Solution
Update `supabase/functions/initiate-paystack-payment/index.ts` line 70 — change the fallback email from `customer-${userId.slice(0, 8)}@safedeal.ng` to `angeloakuhwa@gmail.com`.

```typescript
// Line 70: change fallback
userEmail = 'angeloakuhwa@gmail.com';
```

Single line change, then redeploy the edge function.

| File | Action |
|------|--------|
| `supabase/functions/initiate-paystack-payment/index.ts` | Change fallback email on line 70 |

