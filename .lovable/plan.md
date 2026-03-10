

# Fix: Pass Email to PaystackPop.setup() Frontend

## Problem
The backend `initiate-paystack-payment` call succeeds and returns a valid `access_code`. However, `PaystackPop.setup()` in the frontend doesn't include the `email` parameter. Paystack's inline JS validates this field independently of the server-side initialization.

## Solution
Add `email: 'angeloakuhwa@gmail.com'` to the `PaystackPop.setup()` config in `src/pages/BuyerPaymentSummary.tsx`, and also return the email from the backend so the frontend can use it.

### Changes

**1. `supabase/functions/initiate-paystack-payment/index.ts`** — Include `email` in the response JSON (add `email: userEmail` to the return object).

**2. `src/pages/BuyerPaymentSummary.tsx`** — Add `email` to `PaystackPop.setup()`:
```typescript
const handler = window.PaystackPop.setup({
  key: initData.public_key,
  access_code: initData.access_code,
  email: initData.email,  // <-- add this
  callback: function(response: { reference: string }) { ... },
  onClose: () => { ... },
});
```

| File | Action |
|------|--------|
| `supabase/functions/initiate-paystack-payment/index.ts` | Add `email: userEmail` to response JSON |
| `src/pages/BuyerPaymentSummary.tsx` | Add `email: initData.email` to PaystackPop.setup() |

