

# Fix: "Attribute callback must be a valid function"

## Problem
`PaystackPop.setup()` rejects `async` functions for the `callback` parameter. The current code passes `callback: async (response) => { ... }` which Paystack's type check rejects.

## Solution
Change the callback to a regular (non-async) function and handle the async verification inside it using `.then()/.catch()` or a fire-and-forget pattern.

### Edit `src/pages/BuyerPaymentSummary.tsx` (lines 150-176)
Replace:
```typescript
callback: async (response) => {
  try { ... } catch { ... }
},
```
With:
```typescript
callback: function(response: { reference: string }) {
  supabase.functions.invoke("verify-paystack-payment", {
    body: { reference: response.reference },
  }).then(({ data: verifyData, error: verifyError }) => {
    if (verifyError || verifyData?.error) {
      setFailureReason(verifyData?.error || verifyError?.message || "Payment verification failed");
      setIsProcessing(false);
      setShowFailed(true);
      return;
    }
    setIsProcessing(false);
    setShowSuccess(true);
  }).catch((verifyErr) => {
    console.error("Verification error:", verifyErr);
    setFailureReason("Payment verification failed. If you were charged, your payment is safe — please contact support.");
    setIsProcessing(false);
    setShowFailed(true);
  });
},
```

| File | Action |
|------|--------|
| `src/pages/BuyerPaymentSummary.tsx` | Edit — change async callback to sync function with .then() |

